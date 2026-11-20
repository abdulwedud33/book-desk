import { db, type LocalBooking, type OutboxAction } from './db.ts';
import { supabase } from './supabase.ts';
import type { BookingStatus } from '../domain/status.ts';

let isFlushing = false;

export async function queueCreateBooking(params: {
  shopId: string;
  id: string;
  serviceId: string;
  providerId: string;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  customerName: string;
  customerPhone: string;
  note?: string | null;
  price: number | null;
  source?: 'staff' | 'walk_in';
}): Promise<LocalBooking> {
  const localBooking: LocalBooking = {
    id: params.id,
    shopId: params.shopId,
    providerId: params.providerId,
    serviceId: params.serviceId,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    blockedUntil: params.blockedUntil,
    status: 'confirmed',
    source: params.source ?? 'staff',
    price: params.price,
    note: params.note ?? null,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    syncStatus: 'pending',
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  const action: OutboxAction = {
    id: crypto.randomUUID(),
    shopId: params.shopId,
    type: 'create_booking',
    payload: {
      p_shop: params.shopId,
      p_id: params.id,
      p_service: params.serviceId,
      p_provider: params.providerId,
      p_starts_at: params.startsAt,
      p_contact: {
        name: params.customerName,
        phone: params.customerPhone,
        language: 'en',
      },
      p_note: params.note ?? null,
      p_source: params.source ?? 'staff',
    },
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  // Optimistic local transaction
  await db.transaction('rw', [db.bookings, db.outbox], async () => {
    await db.bookings.put(localBooking);
    await db.outbox.put(action);
  });

  // Trigger background flush
  void flushOutbox();

  return localBooking;
}

export async function queueRescheduleBooking(params: {
  shopId: string;
  bookingId: string;
  newStart: string;
  newProviderId?: string;
  expectedVersion?: number;
}): Promise<void> {
  const existing = await db.bookings.get(params.bookingId);
  if (existing) {
    await db.bookings.update(params.bookingId, {
      startsAt: params.newStart,
      providerId: params.newProviderId ?? existing.providerId,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });
  }

  const action: OutboxAction = {
    id: crypto.randomUUID(),
    shopId: params.shopId,
    type: 'reschedule_booking',
    payload: {
      p_shop: params.shopId,
      p_booking: params.bookingId,
      p_new_start: params.newStart,
      p_new_provider: params.newProviderId ?? null,
      p_expected_version: params.expectedVersion ?? null,
    },
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await db.outbox.put(action);
  void flushOutbox();
}

export async function queueStatusChange(params: {
  shopId: string;
  bookingId: string;
  toStatus: BookingStatus;
  expectedFrom?: BookingStatus;
}): Promise<void> {
  const existing = await db.bookings.get(params.bookingId);
  if (existing) {
    await db.bookings.update(params.bookingId, {
      status: params.toStatus,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });
  }

  const action: OutboxAction = {
    id: crypto.randomUUID(),
    shopId: params.shopId,
    type: 'set_booking_status',
    payload: {
      p_shop: params.shopId,
      p_booking: params.bookingId,
      p_to: params.toStatus,
      p_expected_from: params.expectedFrom ?? null,
    },
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await db.outbox.put(action);
  void flushOutbox();
}

export async function queueCancelBooking(params: {
  shopId: string;
  bookingId: string;
  reason?: string;
}): Promise<void> {
  const existing = await db.bookings.get(params.bookingId);
  if (existing) {
    await db.bookings.update(params.bookingId, {
      status: 'cancelled',
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });
  }

  const action: OutboxAction = {
    id: crypto.randomUUID(),
    shopId: params.shopId,
    type: 'cancel_booking',
    payload: {
      p_shop: params.shopId,
      p_booking: params.bookingId,
      p_reason: params.reason ?? null,
    },
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await db.outbox.put(action);
  void flushOutbox();
}

export async function queueCompleteReminder(params: {
  shopId: string;
  reminderId: string;
}): Promise<void> {
  const existing = await db.reminders.get(params.reminderId);
  if (existing) {
    await db.reminders.update(params.reminderId, {
      state: 'done',
      syncStatus: 'pending',
    });
  }

  const action: OutboxAction = {
    id: crypto.randomUUID(),
    shopId: params.shopId,
    type: 'complete_reminder',
    payload: {
      p_shop: params.shopId,
      p_reminder: params.reminderId,
    },
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await db.outbox.put(action);
  void flushOutbox();
}

export async function flushOutbox(): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;

  try {
    const queued = await db.outbox
      .where('status')
      .equals('queued')
      .sortBy('createdAt');

    for (const action of queued) {
      await db.outbox.update(action.id, {
        status: 'syncing',
        attempts: action.attempts + 1,
      });

      try {
        const { error } = await supabase.rpc(
          action.type,
          {
            ...action.payload,
            p_client_id: action.id,
          }
        );

        if (error) {
          const msg = error.message || '';
          if (msg.includes('SLOT_TAKEN') || msg.includes('CONFLICT') || msg.includes('OUTSIDE_HOURS')) {
            // Unrecoverable business conflict: mark conflict and require user attention
            await db.outbox.update(action.id, {
              status: 'conflict',
              errorMessage: msg,
            });

            const bookingId = (action.payload.p_id || action.payload.p_booking) as string;
            if (bookingId) {
              await db.bookings.update(bookingId, {
                syncStatus: 'conflict',
                conflictReason: msg,
              });
            }
          } else {
            // Transient or connection failure: keep queued
            await db.outbox.update(action.id, {
              status: 'queued',
              errorMessage: msg,
            });
          }
        } else {
          // Success!
          const bookingId = (action.payload.p_id || action.payload.p_booking) as string;
          if (bookingId) {
            await db.bookings.update(bookingId, {
              syncStatus: 'synced',
              conflictReason: undefined,
            });
          }
          await db.outbox.delete(action.id);
        }
      } catch (err: unknown) {
        const error = err as Error;
        await db.outbox.update(action.id, {
          status: 'queued',
          errorMessage: error.message,
        });
      }
    }
  } finally {
    isFlushing = false;
  }
}
