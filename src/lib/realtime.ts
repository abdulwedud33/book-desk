import { supabase } from './supabase.ts';
import { db, type LocalBooking, type LocalReminder } from './db.ts';

/**
 * Plays a short, pleasant audible chime and triggers device vibration
 * when a new booking request arrives.
 */
export function playAlertChime(): void {
  try {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      // Tone 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Tone 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12); // A5
      gain2.gain.setValueAtTime(0.2, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.4);
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.([150, 80, 150]);
    }
  } catch {
    // Ignore audio policy errors
  }
}

export function subscribeToBookings(
  shopId: string,
  onUpdate?: () => void
): () => void {
  // Realtime channel
  const channel = supabase
    .channel(`shop-bookings-${shopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `shop_id=eq.${shopId}`,
      },
      async (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = payload.new as Record<string, unknown>;
          const existing = await db.bookings.get(rec.id as string);

          const localRecord: LocalBooking = {
            id: rec.id as string,
            shopId: rec.shop_id as string,
            providerId: rec.provider_id as string,
            serviceId: rec.service_id as string,
            customerId: rec.customer_id as string,
            startsAt: rec.starts_at as string,
            endsAt: rec.ends_at as string,
            blockedUntil: rec.blocked_until as string,
            status: rec.status as LocalBooking['status'],
            source: rec.source as LocalBooking['source'],
            price: rec.price as number | null,
            note: rec.note as string | null,
            customerName: existing?.customerName || 'Customer',
            customerPhone: existing?.customerPhone || '',
            syncStatus: 'synced',
            version: rec.version as number,
            updatedAt: rec.updated_at as string,
          };

          if (rec.status === 'pending' && payload.eventType === 'INSERT') {
            playAlertChime();
          }

          await db.bookings.put(localRecord);
          onUpdate?.();
        } else if (payload.eventType === 'DELETE') {
          const rec = payload.old as Record<string, unknown>;
          if (rec.id) {
            await db.bookings.delete(rec.id as string);
            onUpdate?.();
          }
        }
      }
    )
    .subscribe();

  // Polling fallback every 10 seconds
  const intervalId = setInterval(async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, customer:customers(name, phone_e164)')
        .eq('shop_id', shopId);

      if (!error && data) {
        for (const item of data) {
          const customer = item.customer as { name?: string; phone_e164?: string } | null;
          const localRecord: LocalBooking = {
            id: item.id,
            shopId: item.shop_id,
            providerId: item.provider_id,
            serviceId: item.service_id,
            customerId: item.customer_id,
            startsAt: item.starts_at,
            endsAt: item.ends_at,
            blockedUntil: item.blocked_until,
            status: item.status,
            source: item.source,
            price: item.price,
            note: item.note,
            customerName: customer?.name || 'Customer',
            customerPhone: customer?.phone_e164 || '',
            syncStatus: 'synced',
            version: item.version,
            updatedAt: item.updated_at,
          };
          await db.bookings.put(localRecord);
        }
        onUpdate?.();
      }
    } catch {
      // Ignore network failures during polling
    }
  }, 10000);

  return () => {
    clearInterval(intervalId);
    void supabase.removeChannel(channel);
  };
}

export function subscribeToReminders(
  shopId: string,
  onUpdate?: () => void
): () => void {
  const channel = supabase
    .channel(`shop-reminders-${shopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reminders',
        filter: `shop_id=eq.${shopId}`,
      },
      async (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rec = payload.new as Record<string, unknown>;
          const existing = await db.reminders.get(rec.id as string);

          const localRecord: LocalReminder = {
            id: rec.id as string,
            bookingId: rec.booking_id as string,
            shopId: rec.shop_id as string,
            kind: rec.kind as LocalReminder['kind'],
            dueAt: rec.due_at as string,
            state: rec.state as LocalReminder['state'],
            doneBy: (rec.done_by as string) || undefined,
            doneAt: (rec.done_at as string) || undefined,
            customerName: existing?.customerName,
            customerPhone: existing?.customerPhone,
            serviceName: existing?.serviceName,
            providerName: existing?.providerName,
            startsAt: existing?.startsAt,
            syncStatus: 'synced',
          };

          await db.reminders.put(localRecord);
          onUpdate?.();
        } else if (payload.eventType === 'DELETE') {
          const rec = payload.old as Record<string, unknown>;
          if (rec.id) {
            await db.reminders.delete(rec.id as string);
            onUpdate?.();
          }
        }
      }
    )
    .subscribe();

  const intervalId = setInterval(async () => {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('shop_id', shopId)
        .eq('state', 'due');

      if (!error && data) {
        for (const item of data) {
          const existing = await db.reminders.get(item.id);
          const localRecord: LocalReminder = {
            id: item.id,
            bookingId: item.booking_id,
            shopId: item.shop_id,
            kind: item.kind,
            dueAt: item.due_at,
            state: item.state,
            doneBy: item.done_by || undefined,
            doneAt: item.done_at || undefined,
            customerName: existing?.customerName,
            customerPhone: existing?.customerPhone,
            serviceName: existing?.serviceName,
            providerName: existing?.providerName,
            startsAt: existing?.startsAt,
            syncStatus: 'synced',
          };
          await db.reminders.put(localRecord);
        }
        onUpdate?.();
      }
    } catch {
      // Ignore polling errors
    }
  }, 10000);

  return () => {
    clearInterval(intervalId);
    void supabase.removeChannel(channel);
  };
}
