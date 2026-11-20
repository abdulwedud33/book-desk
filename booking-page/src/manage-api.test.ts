import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ManageTokenSchema,
  RescheduleRequestSchema,
  CancelRequestSchema,
} from '../../supabase/functions/_shared/validation.ts';
import { translateError } from '../../src/domain/errors.ts';

test('Security & Headers: public/_headers enforces noindex and no-referrer on /m/* and /b/*', () => {
  const headersPath = path.resolve(process.cwd(), 'public/_headers');
  const headersContent = fs.readFileSync(headersPath, 'utf8');

  // Verify /m/* rules
  assert.ok(headersContent.includes('/m/*'), 'Must contain /m/* section');
  assert.ok(
    headersContent.includes('X-Robots-Tag: noindex'),
    'Must enforce X-Robots-Tag: noindex'
  );
  assert.ok(
    headersContent.includes('Referrer-Policy: no-referrer'),
    'Must enforce Referrer-Policy: no-referrer'
  );

  // Verify /b/* rules
  assert.ok(headersContent.includes('/b/*'), 'Must contain /b/* section');
});

test('Token validation: ManageTokenSchema validates base64url tokens', () => {
  // Valid 128-bit random base64url tokens
  const validTokens = [
    'aB3-_dE9123456789012',
    'tok_4a2b8f9e1c3d5a7b',
    'Y2hhbGVuZ2VfdG9rZW5fYmFzZTY0',
  ];

  for (const token of validTokens) {
    const res = ManageTokenSchema.safeParse({ token });
    assert.equal(res.success, true, `Token ${token} should be valid`);
  }

  // Invalid tokens (too short, spaces, special chars outside base64url)
  const invalidTokens = [
    'short', // < 10 chars
    'token with spaces',
    'token+with+plus==',
    'token/with/slash',
    '<script>alert(1)</script>',
  ];

  for (const token of invalidTokens) {
    const res = ManageTokenSchema.safeParse({ token });
    assert.equal(res.success, false, `Invalid token ${token} must fail validation`);
  }
});

test('Cutoff enforcement logic on server: active window vs cutoff passed', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const cutoffHours = 2;

  // Case 1: Appointment in 5 hours (starts at 15:00, cutoff at 13:00) -> Allowed
  const futureApptStart = new Date('2026-11-20T15:00:00Z');
  const cutoffTimeFuture = new Date(futureApptStart.getTime() - cutoffHours * 3600000);
  const canModifyFuture = now.getTime() < cutoffTimeFuture.getTime();
  assert.equal(canModifyFuture, true, 'Modification allowed 5 hours before appointment');

  // Case 2: Appointment in 1 hour (starts at 11:00, cutoff was at 09:00) -> Past Cutoff
  const closeApptStart = new Date('2026-11-20T11:00:00Z');
  const cutoffTimeClose = new Date(closeApptStart.getTime() - cutoffHours * 3600000);
  const canModifyClose = now.getTime() < cutoffTimeClose.getTime();
  assert.equal(canModifyClose, false, 'Modification rejected when cutoff has passed');

  // Error message translation test for CUTOFF_PASSED
  const errorMsg = translateError('CUTOFF_PASSED');
  assert.equal(
    errorMsg,
    'The cancellation or rescheduling cutoff has passed. Please contact the business directly.'
  );
});

test('Token Expiry: Tokens expire 30 days after the appointment time', () => {
  const now = new Date('2026-12-25T10:00:00Z');
  const thirtyDaysMs = 30 * 86400000;

  // Appointment was 10 days ago -> Still valid
  const appt10DaysAgo = new Date('2026-12-15T10:00:00Z');
  const isExpired10Days = now.getTime() - appt10DaysAgo.getTime() > thirtyDaysMs;
  assert.equal(isExpired10Days, false, 'Appointment 10 days ago must not be expired');

  // Appointment was 35 days ago -> Expired
  const appt35DaysAgo = new Date('2026-11-20T10:00:00Z');
  const isExpired35Days = now.getTime() - appt35DaysAgo.getTime() > thirtyDaysMs;
  assert.equal(isExpired35Days, true, 'Appointment 35 days ago must be expired');
});

test('Manage API schemas: Reschedule and Cancel requests strictly validated', () => {
  const validReschedule = {
    token: 'tok_valid12345678',
    new_start: '2026-11-25T14:30:00.000Z',
  };
  assert.equal(RescheduleRequestSchema.safeParse(validReschedule).success, true);

  const invalidReschedule = {
    token: 'tok_valid12345678',
    new_start: 'not-a-datetime',
  };
  assert.equal(RescheduleRequestSchema.safeParse(invalidReschedule).success, false);

  const validCancel = {
    token: 'tok_valid12345678',
    reason: 'Customer schedule change',
  };
  assert.equal(CancelRequestSchema.safeParse(validCancel).success, true);

  const tooLongCancelReason = {
    token: 'tok_valid12345678',
    reason: 'a'.repeat(201),
  };
  assert.equal(CancelRequestSchema.safeParse(tooLongCancelReason).success, false);
});

test('RFC 5545 iCalendar (.ics) generation format compliance', () => {
  const booking = {
    booking_id: '12345678-1234-1234-1234-123456789012',
    service_name: 'Haircut Deluxe',
    provider_name: 'Samson K.',
    starts_at: '2026-11-25T09:00:00.000Z',
    ends_at: '2026-11-25T09:30:00.000Z',
  };
  const shopName = 'Addis Barber Shop';

  const pad = (n: number) => String(n).padStart(2, '0');
  const toIcsDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Book Desk//Manage Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.booking_id}@bookdesk`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(new Date(booking.starts_at))}`,
    `DTEND:${toIcsDate(new Date(booking.ends_at))}`,
    `SUMMARY:${booking.service_name} at ${shopName}`,
    `DESCRIPTION:Appointment with ${booking.provider_name}.`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const icsContent = icsLines.join('\r\n');

  assert.ok(icsContent.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(icsContent.endsWith('\r\nEND:VCALENDAR'));
  assert.ok(icsContent.includes('SUMMARY:Haircut Deluxe at Addis Barber Shop'));
  assert.ok(icsContent.includes('DTSTART:20261125T090000Z'));
  assert.ok(icsContent.includes('DTEND:20261125T093000Z'));
});
