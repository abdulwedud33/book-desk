import { supabase } from './supabase.ts';
import { db, type LocalBooking } from './db.ts';

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
