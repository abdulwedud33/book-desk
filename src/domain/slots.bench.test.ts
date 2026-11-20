import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, type ComputeSlotsInput } from './slots.ts';

test('Availability engine benchmark: 7-day search for 5 providers under 400 ms', () => {
  const now = new Date('2026-11-20T08:00:00Z');

  const shop = {
    timezone: 'Africa/Addis_Ababa',
    slotIntervalMin: 15,
    leadTimeMin: 60,
    horizonDays: 30,
  };

  const service = {
    id: 'srv-standard',
    durationMin: 30,
    bufferMin: 5,
  };

  const providers = Array.from({ length: 5 }).map((_, i) => ({
    id: `provider-${i + 1}`,
    name: `Barber ${i + 1}`,
    sort: i,
    active: true,
    offersService: true,
  }));

  // Weekly split shifts for all 5 providers (Mon-Sat, 08:30-13:00 and 14:00-18:30)
  const workingHours = providers.flatMap((p) =>
    [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { providerId: p.id, weekday, startTime: '08:30', endTime: '13:00' },
      { providerId: p.id, weekday, startTime: '14:00', endTime: '18:30' },
    ])
  );

  // 50 realistic active bookings scattered across the 7-day window
  const existingBookings = Array.from({ length: 50 }).map((_, i) => {
    const dayOffset = i % 7;
    const providerIndex = i % 5;
    const hour = 9 + (i % 6);
    const start = new Date(Date.UTC(2026, 10, 20 + dayOffset, hour, (i % 4) * 15));
    const end = new Date(start.getTime() + 30 * 60000);
    const blocked = new Date(end.getTime() + 5 * 60000);

    return {
      id: `b-${i}`,
      providerId: providers[providerIndex].id,
      startsAt: start,
      endsAt: end,
      blockedUntil: blocked,
      status: 'confirmed',
    };
  });

  const input: ComputeSlotsInput = {
    shop,
    service,
    providers,
    workingHours,
    timeOff: [],
    existingBookings,
    fromDate: '2026-11-20',
    toDate: '2026-11-26', // 7 days
    selectedProviderId: null, // "Any available"
    now,
  };

  // Measure execution time
  const t0 = performance.now();
  const results = computeSlots(input);
  const durationMs = performance.now() - t0;

  console.log(`\n[Benchmark Result] 7-day search for 5 providers took: ${durationMs.toFixed(2)} ms (target: < 400 ms)`);
  console.log(`Total days with slots: ${results.length}, Total slot starts returned: ${results.reduce((acc, r) => acc + r.starts.length, 0)}`);

  assert.ok(
    durationMs < 400,
    `7-day search took ${durationMs.toFixed(2)} ms, exceeding target of 400 ms`
  );
  assert.ok(results.length > 0, 'Should return available days');
});
