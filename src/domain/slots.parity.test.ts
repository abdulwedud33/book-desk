import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, type ComputeSlotsInput } from './slots.ts';

test('SQL/TypeScript Parity test on shared test fixtures', () => {
  const now = new Date('2026-11-20T05:00:00Z'); // 08:00 local Addis time

  // Shared test fixture matching Migration 0003 template
  const fixture: ComputeSlotsInput = {
    shop: {
      timezone: 'Africa/Addis_Ababa',
      slotIntervalMin: 15,
      leadTimeMin: 60,
      horizonDays: 14,
    },
    service: {
      id: 'srv-haircut',
      durationMin: 30,
      bufferMin: 5,
    },
    providers: [
      { id: 'p-samson', name: 'Samson T.', sort: 0, active: true, offersService: true },
    ],
    workingHours: [
      // Friday (weekday 5): 08:30-13:00 and 14:00-18:30
      { providerId: 'p-samson', weekday: 5, startTime: '08:30', endTime: '13:00' },
      { providerId: 'p-samson', weekday: 5, startTime: '14:00', endTime: '18:30' },
    ],
    timeOff: [
      // Provider lunch break extra closure 12:30-13:00 local (09:30-10:00 UTC)
      {
        providerId: 'p-samson',
        startsAt: new Date('2026-11-20T09:30:00Z'),
        endsAt: new Date('2026-11-20T10:00:00Z'),
      },
    ],
    existingBookings: [
      // Existing booking at 10:00 local (07:00 UTC) for 30m + 5m buffer -> blocked until 10:35 local (07:35 UTC)
      {
        id: 'b-1',
        providerId: 'p-samson',
        startsAt: new Date('2026-11-20T07:00:00Z'),
        endsAt: new Date('2026-11-20T07:30:00Z'),
        blockedUntil: new Date('2026-11-20T07:35:00Z'),
        status: 'confirmed',
      },
    ],
    fromDate: '2026-11-20',
    toDate: '2026-11-20',
    selectedProviderId: 'p-samson',
    now,
  };

  const results = computeSlots(fixture);
  assert.equal(results.length, 1);
  assert.equal(results[0].day, '2026-11-20');

  const startTimesUtc = results[0].starts.map((d) => d.toISOString().slice(11, 16));

  // Lead time is 60m from 08:00 local (05:00 UTC) -> earliest start is 09:00 local (06:00 UTC)
  assert.ok(startTimesUtc.includes('06:00'), '09:00 local (06:00 UTC) should be free');
  assert.ok(startTimesUtc.includes('06:15'), '09:15 local (06:15 UTC) should be free (ends 09:45 + 5m buffer = 09:50 <= 10:00)');

  // 09:30 local (06:30 UTC) + 30m duration + 5m buffer = 10:05 local, which overlaps booking starting at 10:00 local (07:00 UTC) -> BLOCKED
  assert.equal(startTimesUtc.includes('06:30'), false, '09:30 local should be blocked by service buffer overlapping 10:00 booking');

  // At 07:00 UTC (10:00 local), there is an existing booking blocked until 07:35 UTC.
  // 06:45 UTC slot (ends at 07:15 + 5m buffer = 07:20) overlaps booking (starts at 07:00) -> BLOCKED
  assert.equal(startTimesUtc.includes('06:45'), false, '09:45 local should be blocked by 10:00 booking');

  // 07:00 UTC slot starts at booking -> BLOCKED
  assert.equal(startTimesUtc.includes('07:00'), false, '10:00 local should be blocked');

  // 07:15 UTC slot starts inside booking -> BLOCKED
  assert.equal(startTimesUtc.includes('07:15'), false, '10:15 local should be blocked');

  // 07:30 UTC slot (ends 08:00) overlaps booking blockedUntil (07:35) -> BLOCKED
  assert.equal(startTimesUtc.includes('07:30'), false, '10:30 local should be blocked by buffer');

  // 07:45 UTC slot (10:45 local) starts after 07:35 UTC -> FREE!
  assert.ok(startTimesUtc.includes('07:45'), '10:45 local (07:45 UTC) should be free');

  // Split shift break between 13:00 (10:00 UTC) and 14:00 (11:00 UTC)
  assert.equal(startTimesUtc.includes('10:15'), false, 'Inside split shift break must be blocked');

  // Afternoon shift starts at 14:00 local (11:00 UTC) -> FREE!
  assert.ok(startTimesUtc.includes('11:00'), '14:00 local (11:00 UTC) afternoon shift should be free');
});
