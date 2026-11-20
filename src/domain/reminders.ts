/**
 * Reminders domain utilities for Book Desk.
 * - Pure logic for calculating, re-timing, and skipping reminder tasks.
 * - Formats prepared messages with localized part-of-day words and Ethiopian time.
 * - Checks overdue state and formats overdue durations.
 */

import { formatTimeWithPartOfDay, toEthiopianHour, formatDateInTz } from './time.ts';

export type ReminderKind =
  | 'confirmation'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'reschedule'
  | 'followup';

export type ReminderState = 'due' | 'done' | 'skipped';

export interface ReminderTask {
  id?: string;
  booking_id: string;
  shop_id: string;
  kind: ReminderKind;
  due_at: string; // ISO UTC
  state: ReminderState;
  done_by?: string | null;
  done_at?: string | null;
}

/**
 * Computes scheduled reminder tasks for a new booking.
 * 1. Confirmation: due immediately (now).
 * 2. 24h reminder: due 24h before starts_at (only if in the future).
 * 3. 2h reminder: due 2h before starts_at (only if in the future).
 */
export function computeReminderTasks(
  booking: { id: string; shop_id: string; starts_at: string; status: string },
  now: Date = new Date()
): ReminderTask[] {
  if (booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'no_show') {
    return [];
  }

  const tasks: ReminderTask[] = [];
  const startsAt = new Date(booking.starts_at);
  const nowMs = now.getTime();

  // 1. Confirmation (due immediately)
  tasks.push({
    booking_id: booking.id,
    shop_id: booking.shop_id,
    kind: 'confirmation',
    due_at: now.toISOString(),
    state: 'due',
  });

  // 2. 24h reminder
  const due24h = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  if (due24h.getTime() > nowMs) {
    tasks.push({
      booking_id: booking.id,
      shop_id: booking.shop_id,
      kind: 'reminder_24h',
      due_at: due24h.toISOString(),
      state: 'due',
    });
  }

  // 3. 2h reminder
  const due2h = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);
  if (due2h.getTime() > nowMs) {
    tasks.push({
      booking_id: booking.id,
      shop_id: booking.shop_id,
      kind: 'reminder_2h',
      due_at: due2h.toISOString(),
      state: 'due',
    });
  }

  return tasks;
}

/**
 * Re-times existing reminder tasks when a booking is rescheduled.
 * Future tasks are adjusted; past tasks become skipped; a reschedule task is added.
 */
export function retimeReminderTasks(
  existingTasks: ReminderTask[],
  newStartsAt: Date,
  now: Date = new Date()
): ReminderTask[] {
  const nowMs = now.getTime();
  const startsMs = newStartsAt.getTime();
  const updated: ReminderTask[] = [];

  let hasReschedule = false;

  for (const task of existingTasks) {
    if (task.kind === 'confirmation' && task.state === 'done') {
      updated.push(task);
      continue;
    }

    if (task.kind === 'reminder_24h') {
      const newDue = new Date(startsMs - 24 * 60 * 60 * 1000);
      if (newDue.getTime() > nowMs) {
        updated.push({
          ...task,
          due_at: newDue.toISOString(),
          state: 'due',
        });
      } else {
        updated.push({
          ...task,
          state: 'skipped',
        });
      }
      continue;
    }

    if (task.kind === 'reminder_2h') {
      const newDue = new Date(startsMs - 2 * 60 * 60 * 1000);
      if (newDue.getTime() > nowMs) {
        updated.push({
          ...task,
          due_at: newDue.toISOString(),
          state: 'due',
        });
      } else {
        updated.push({
          ...task,
          state: 'skipped',
        });
      }
      continue;
    }

    if (task.kind === 'reschedule') {
      hasReschedule = true;
      updated.push({
        ...task,
        due_at: now.toISOString(),
        state: 'due',
      });
      continue;
    }

    updated.push(task);
  }

  if (!hasReschedule && existingTasks.length > 0) {
    const first = existingTasks[0];
    updated.push({
      booking_id: first.booking_id,
      shop_id: first.shop_id,
      kind: 'reschedule',
      due_at: now.toISOString(),
      state: 'due',
    });
  }

  return updated;
}

/**
 * Marks all open 'due' reminders as 'skipped' when a booking is cancelled.
 */
export function skipRemindersOnCancel(existingTasks: ReminderTask[]): ReminderTask[] {
  return existingTasks.map((t) => (t.state === 'due' ? { ...t, state: 'skipped' } : t));
}

/**
 * Checks whether a reminder task is overdue (due_at < now and state is 'due').
 */
export function isReminderOverdue(
  reminder: { due_at?: string | Date; dueAt?: string | Date; state: ReminderState },
  now: Date = new Date()
): boolean {
  if (reminder.state !== 'due') return false;
  const rawDue = reminder.due_at ?? reminder.dueAt;
  if (!rawDue) return false;
  const due = typeof rawDue === 'string' ? new Date(rawDue) : rawDue;
  return due.getTime() < now.getTime();
}

/**
 * Formats how long a task has been overdue (e.g. "15m", "2h", "1d").
 */
export function getOverdueDuration(
  reminder: { due_at?: string | Date; dueAt?: string | Date },
  now: Date = new Date()
): string {
  const rawDue = reminder.due_at ?? reminder.dueAt;
  if (!rawDue) return '0m';
  const due = typeof rawDue === 'string' ? new Date(rawDue) : rawDue;
  const diffMs = Math.max(0, now.getTime() - due.getTime());
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Formats a formatted appointment time string with part-of-day word
 * and optional Ethiopian time in brackets.
 */
export function formatAppointmentTimeString(
  date: Date,
  timeZone: string,
  timeDisplay: 'gregorian' | 'both' = 'gregorian'
): string {
  const timeWithPart = formatTimeWithPartOfDay(date, timeZone);
  const dateStr = formatDateInTz(date, timeZone);

  if (timeDisplay === 'both') {
    const hour24 = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date),
      10
    );
    const minute = new Intl.DateTimeFormat('en-US', { timeZone, minute: '2-digit' }).format(date);
    const ethHour = toEthiopianHour(hour24);
    return `${dateStr} at ${timeWithPart} (${ethHour}:${minute} Ethiopian time)`;
  }

  return `${dateStr} at ${timeWithPart}`;
}

export interface PreparedMessageParams {
  kind: ReminderKind;
  customerName: string;
  serviceName: string;
  shopName: string;
  startsAt: Date;
  timeZone: string;
  language?: 'en' | 'am' | 'om';
  timeDisplay?: 'gregorian' | 'both';
}

/**
 * Formats a polite, localized prepared message for the customer.
 * Uses exact catalogs with part-of-day words and Ethiopian time display when enabled.
 */
export function formatPreparedMessage(params: PreparedMessageParams): string {
  const lang = params.language ?? 'en';
  const timeDisplay = params.timeDisplay ?? 'gregorian';
  const timeFormatted = formatAppointmentTimeString(params.startsAt, params.timeZone, timeDisplay);

  if (lang === 'am') {
    switch (params.kind) {
      case 'confirmation':
        return `ሰላም ${params.customerName}፣ በ${params.shopName} ለ${params.serviceName} ያደረጉት ቀጠሮ ለ${timeFormatted} ተረጋግጧል። በሰዓቱ ይጠበቃሉ!`;
      case 'reminder_24h':
        return `ሰላም ${params.customerName}፣ ነገ በ${params.shopName} ለ${params.serviceName} ያለዎትን ቀጠሮ በ${timeFormatted} እናስታውስዎታለን።`;
      case 'reminder_2h':
        return `ሰላም ${params.customerName}፣ ዛሬ በ${params.shopName} ለ${params.serviceName} በ${timeFormatted} ያለዎትን ቀጠሮ እናስታውስዎታለን።`;
      case 'reschedule':
        return `ሰላም ${params.customerName}፣ በ${params.shopName} ለ${params.serviceName} የነበረዎት ቀጠሮ ወደ ${timeFormatted} ተቀይሯል።`;
      case 'followup':
        return `ሰላም ${params.customerName}፣ በ${params.shopName} ስላገለገልንዎት እናመሰግናለን። ደህና ይሁኑ!`;
    }
  }

  if (lang === 'om') {
    switch (params.kind) {
      case 'confirmation':
        return `Akkam ${params.customerName}, beellamni kee ${params.serviceName} bakka ${params.shopName} yeroo ${timeFormatted} mirkanaa'eera. Nagaan koottaa!`;
      case 'reminder_24h':
        return `Akkam ${params.customerName}, beellama kee borii ${params.serviceName} bakka ${params.shopName} yeroo ${timeFormatted} si yaadachiisna.`;
      case 'reminder_2h':
        return `Akkam ${params.customerName}, beellama kee har'aa ${params.serviceName} bakka ${params.shopName} yeroo ${timeFormatted} si yaadachiisna.`;
      case 'reschedule':
        return `Akkam ${params.customerName}, beellamni kee ${params.serviceName} bakka ${params.shopName} gara ${timeFormatted} jijjiirameera.`;
      case 'followup':
        return `Akkam ${params.customerName}, bakka ${params.shopName} nu bira dhufuu keetiif galatoomi!`;
    }
  }

  // Default English
  switch (params.kind) {
    case 'confirmation':
      return `Hello ${params.customerName}, your booking for ${params.serviceName} at ${params.shopName} is confirmed for ${timeFormatted}. See you then!`;
    case 'reminder_24h':
      return `Hello ${params.customerName}, this is a reminder about your appointment for ${params.serviceName} at ${params.shopName} tomorrow at ${timeFormatted}.`;
    case 'reminder_2h':
      return `Hello ${params.customerName}, this is a reminder about your appointment for ${params.serviceName} at ${params.shopName} today at ${timeFormatted}.`;
    case 'reschedule':
      return `Hello ${params.customerName}, your appointment for ${params.serviceName} at ${params.shopName} has been rescheduled to ${timeFormatted}.`;
    case 'followup':
      return `Hello ${params.customerName}, thank you for visiting ${params.shopName}. We hope to see you again soon!`;
  }
}
