import Dexie, { type EntityTable } from 'dexie';
import type { BookingStatus } from '../domain/status.ts';

export interface LocalBooking {
  id: string;
  shopId: string;
  providerId: string;
  serviceId: string;
  customerId?: string;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  status: BookingStatus;
  source: 'public' | 'staff' | 'walk_in';
  price: number | null;
  note: string | null;
  customerName: string;
  customerPhone: string;
  syncStatus: 'pending' | 'synced' | 'conflict';
  conflictReason?: string;
  version: number;
  updatedAt: string;
}

export interface OutboxAction {
  id: string; // client_id uuid
  shopId: string;
  type: 'create_booking' | 'reschedule_booking' | 'cancel_booking' | 'set_booking_status' | 'complete_reminder';
  payload: Record<string, unknown>;
  status: 'queued' | 'syncing' | 'failed' | 'conflict';
  errorMessage?: string;
  attempts: number;
  createdAt: string;
}

export interface LocalReminder {
  id: string;
  bookingId: string;
  shopId: string;
  kind: 'confirmation' | 'reminder_24h' | 'reminder_2h' | 'reschedule' | 'followup';
  dueAt: string;
  state: 'due' | 'done' | 'skipped';
  doneBy?: string;
  doneAt?: string;
  customerName?: string;
  customerPhone?: string;
  serviceName?: string;
  providerName?: string;
  startsAt?: string;
  syncStatus?: 'synced' | 'pending';
}

export interface LocalProvider {
  id: string;
  shopId: string;
  name: string;
  color: number;
  active: boolean;
  sort: number;
}

export interface LocalService {
  id: string;
  shopId: string;
  name: string;
  durationMin: number;
  bufferMin: number;
  price: number | null;
}

export interface LocalCustomer {
  id: string;
  shopId: string;
  name: string;
  phoneE164: string;
  language: 'en' | 'am' | 'om';
  notes?: string | null;
  noShowCount: number;
  requireApproval: boolean;
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export class BookDeskDatabase extends Dexie {
  bookings!: EntityTable<LocalBooking, 'id'>;
  outbox!: EntityTable<OutboxAction, 'id'>;
  providers!: EntityTable<LocalProvider, 'id'>;
  services!: EntityTable<LocalService, 'id'>;
  reminders!: EntityTable<LocalReminder, 'id'>;
  customers!: EntityTable<LocalCustomer, 'id'>;

  constructor() {
    super('BookDeskDB');
    this.version(1).stores({
      bookings: 'id, shopId, providerId, startsAt, status, syncStatus',
      outbox: 'id, shopId, status, createdAt',
      providers: 'id, shopId, sort',
      services: 'id, shopId',
      reminders: 'id, bookingId, shopId, state, dueAt',
      customers: 'id, shopId, phoneE164, name, noShowCount, blocked',
    });
  }
}

export const db = new BookDeskDatabase();
