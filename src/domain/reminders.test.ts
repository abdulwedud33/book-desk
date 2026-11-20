import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReminderTasks,
  retimeReminderTasks,
  skipRemindersOnCancel,
  isReminderOverdue,
  getOverdueDuration,
  formatPreparedMessage,
  formatAppointmentTimeString,
  type ReminderTask,
} from './reminders.ts';

test('computeReminderTasks creates confirmation, 24h, and 2h tasks when in future', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  // Starts 48h in future
  const booking = {
    id: 'b1',
    shop_id: 's1',
    starts_at: '2026-11-22T10:00:00Z',
    status: 'confirmed',
  };

  const tasks = computeReminderTasks(booking, now);
  assert.equal(tasks.length, 3);

  const confirmation = tasks.find((t) => t.kind === 'confirmation');
  assert.ok(confirmation);
  assert.equal(confirmation.due_at, now.toISOString());
  assert.equal(confirmation.state, 'due');

  const r24h = tasks.find((t) => t.kind === 'reminder_24h');
  assert.ok(r24h);
  assert.equal(r24h.due_at, '2026-11-21T10:00:00.000Z');
  assert.equal(r24h.state, 'due');

  const r2h = tasks.find((t) => t.kind === 'reminder_2h');
  assert.ok(r2h);
  assert.equal(r2h.due_at, '2026-11-22T08:00:00.000Z');
  assert.equal(r2h.state, 'due');
});

test('computeReminderTasks omits 24h reminder if booking is made within 24h', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  // Starts 10h in future
  const booking = {
    id: 'b2',
    shop_id: 's1',
    starts_at: '2026-11-20T20:00:00Z',
    status: 'confirmed',
  };

  const tasks = computeReminderTasks(booking, now);
  assert.equal(tasks.length, 2);
  assert.ok(tasks.find((t) => t.kind === 'confirmation'));
  assert.ok(tasks.find((t) => t.kind === 'reminder_2h'));
  assert.equal(tasks.find((t) => t.kind === 'reminder_24h'), undefined);
});

test('computeReminderTasks returns empty for cancelled or completed bookings', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const cancelledBooking = {
    id: 'b3',
    shop_id: 's1',
    starts_at: '2026-11-22T10:00:00Z',
    status: 'cancelled',
  };
  assert.deepEqual(computeReminderTasks(cancelledBooking, now), []);
});

test('retimeReminderTasks adjusts future reminders and skips past ones on move', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const existing: ReminderTask[] = [
    {
      booking_id: 'b1',
      shop_id: 's1',
      kind: 'confirmation',
      due_at: '2026-11-19T10:00:00Z',
      state: 'done',
    },
    {
      booking_id: 'b1',
      shop_id: 's1',
      kind: 'reminder_24h',
      due_at: '2026-11-21T10:00:00Z',
      state: 'due',
    },
    {
      booking_id: 'b1',
      shop_id: 's1',
      kind: 'reminder_2h',
      due_at: '2026-11-22T08:00:00Z',
      state: 'due',
    },
  ];

  // Move booking to 5 hours from now
  const newStart = new Date('2026-11-20T15:00:00Z');
  const retimed = retimeReminderTasks(existing, newStart, now);

  const conf = retimed.find((t) => t.kind === 'confirmation');
  assert.equal(conf?.state, 'done');

  // 24h reminder (5h - 24h = past) should now be skipped
  const r24 = retimed.find((t) => t.kind === 'reminder_24h');
  assert.equal(r24?.state, 'skipped');

  // 2h reminder (5h - 2h = 3h in future) should be retimed and due
  const r2 = retimed.find((t) => t.kind === 'reminder_2h');
  assert.equal(r2?.state, 'due');
  assert.equal(r2?.due_at, '2026-11-20T13:00:00.000Z');

  // Reschedule reminder added for staff
  const resched = retimed.find((t) => t.kind === 'reschedule');
  assert.ok(resched);
  assert.equal(resched.due_at, now.toISOString());
  assert.equal(resched.state, 'due');
});

test('skipRemindersOnCancel marks all due reminders as skipped', () => {
  const existing: ReminderTask[] = [
    {
      booking_id: 'b1',
      shop_id: 's1',
      kind: 'confirmation',
      due_at: '2026-11-19T10:00:00Z',
      state: 'done',
    },
    {
      booking_id: 'b1',
      shop_id: 's1',
      kind: 'reminder_24h',
      due_at: '2026-11-21T10:00:00Z',
      state: 'due',
    },
    {
      booking_id: 'b1',
      shop_id: 's1',
      kind: 'reminder_2h',
      due_at: '2026-11-22T08:00:00Z',
      state: 'due',
    },
  ];

  const skipped = skipRemindersOnCancel(existing);
  assert.equal(skipped.find((t) => t.kind === 'confirmation')?.state, 'done');
  assert.equal(skipped.find((t) => t.kind === 'reminder_24h')?.state, 'skipped');
  assert.equal(skipped.find((t) => t.kind === 'reminder_2h')?.state, 'skipped');
});

test('isReminderOverdue and getOverdueDuration calculate correctly', () => {
  const now = new Date('2026-11-20T12:00:00Z');

  // Overdue by 45 minutes
  const pastReminder = {
    due_at: '2026-11-20T11:15:00Z',
    state: 'due' as const,
  };
  assert.equal(isReminderOverdue(pastReminder, now), true);
  assert.equal(getOverdueDuration(pastReminder, now), '45m');

  // Overdue by 3 hours
  const pastReminder3h = {
    due_at: '2026-11-20T09:00:00Z',
    state: 'due' as const,
  };
  assert.equal(getOverdueDuration(pastReminder3h, now), '3h');

  // Future reminder
  const futureReminder = {
    due_at: '2026-11-20T13:00:00Z',
    state: 'due' as const,
  };
  assert.equal(isReminderOverdue(futureReminder, now), false);

  // Done reminder is never overdue
  const doneReminder = {
    due_at: '2026-11-20T10:00:00Z',
    state: 'done' as const,
  };
  assert.equal(isReminderOverdue(doneReminder, now), false);
});

test('formatPreparedMessage includes part of day and Ethiopian time across languages', () => {
  // 15:30 in Africa/Addis_Ababa (+03:00) -> 12:30 UTC
  const startsAt = new Date('2026-11-25T12:30:00Z');

  // English
  const msgEn = formatPreparedMessage({
    kind: 'confirmation',
    customerName: 'Abel',
    serviceName: 'Haircut',
    shopName: 'Addis Barber',
    startsAt,
    timeZone: 'Africa/Addis_Ababa',
    language: 'en',
    timeDisplay: 'both',
  });
  assert.match(msgEn, /Hello Abel/);
  assert.match(msgEn, /afternoon/);
  assert.match(msgEn, /9:30 Ethiopian time/);

  // Amharic
  const msgAm = formatPreparedMessage({
    kind: 'confirmation',
    customerName: 'አቤል',
    serviceName: 'የጸጉር መቆረጥ',
    shopName: 'አዲስ ባርበር',
    startsAt,
    timeZone: 'Africa/Addis_Ababa',
    language: 'am',
    timeDisplay: 'both',
  });
  assert.match(msgAm, /ሰላም አቤል/);
  assert.match(msgAm, /ተረጋግጧል/);

  // Afaan Oromo
  const msgOm = formatPreparedMessage({
    kind: 'confirmation',
    customerName: 'Caaltuu',
    serviceName: 'Qarooma',
    shopName: 'Addis Barber',
    startsAt,
    timeZone: 'Africa/Addis_Ababa',
    language: 'om',
    timeDisplay: 'both',
  });
  assert.match(msgOm, /Akkam Caaltuu/);
  assert.match(msgOm, /mirkanaa'eera/);
});
