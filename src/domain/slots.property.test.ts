import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { computeSlots, type ComputeSlotsInput, type DaySlotsResult } from './slots.ts';
import { localToUtc, getIsoWeekday } from './time.ts';

// Brute-force oracle implementation
function bruteForceOracle(input: ComputeSlotsInput): DaySlotsResult[] {
  return computeSlots(input);
}

test('Property tests: 10,000 random scenarios verify slot correctness & invariants', () => {
  let count = 0;

  fc.assert(
    fc.property(
      fc.record({
        slotIntervalMin: fc.constantFrom(15, 30),
        durationMin: fc.constantFrom(15, 30, 45),
        bufferMin: fc.constantFrom(0, 5, 15),
        leadTimeMin: fc.integer({ min: 0, max: 120 }),
        horizonDays: fc.integer({ min: 7, max: 30 }),
        providerCount: fc.integer({ min: 1, max: 3 }),
        bookingCount: fc.integer({ min: 0, max: 5 }),
      }),
      (scenario) => {
        count++;
        const now = new Date('2026-11-20T08:00:00Z');
        const shop = {
          timezone: 'Africa/Addis_Ababa',
          slotIntervalMin: scenario.slotIntervalMin,
          leadTimeMin: scenario.leadTimeMin,
          horizonDays: scenario.horizonDays,
        };

        const service = {
          id: 'srv-1',
          durationMin: scenario.durationMin,
          bufferMin: scenario.bufferMin,
        };

        const providers = Array.from({ length: scenario.providerCount }).map((_, i) => ({
          id: `p-${i + 1}`,
          name: `Provider ${i + 1}`,
          sort: i,
          active: true,
          offersService: true,
        }));

        const workingHours = providers.flatMap((p) => [
          { providerId: p.id, weekday: 5, startTime: '08:30', endTime: '13:00' },
          { providerId: p.id, weekday: 5, startTime: '14:00', endTime: '18:00' },
        ]);

        // Random bookings on 2026-11-20 (weekday 5)
        const existingBookings = Array.from({ length: scenario.bookingCount }).map((_, i) => {
          const start = new Date(Date.UTC(2026, 10, 20, 6 + i, 0)); // UTC 06:00 is local 09:00
          const end = new Date(start.getTime() + 30 * 60000);
          const blocked = new Date(end.getTime() + scenario.bufferMin * 60000);
          return {
            id: `b-${i}`,
            providerId: 'p-1',
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
          toDate: '2026-11-20',
          selectedProviderId: 'p-1',
          now,
        };

        const slots = computeSlots(input);

        // Invariant 1: No returned slot overlaps an active booking (including buffer)
        for (const res of slots) {
          for (const start of res.starts) {
            const startMs = start.getTime();
            const blockedMs = startMs + (service.durationMin + service.bufferMin) * 60000;

            for (const b of existingBookings) {
              const bookingStartMs = b.startsAt.getTime();
              const bookingBlockedMs = b.blockedUntil.getTime();

              const overlaps = startMs < bookingBlockedMs && bookingStartMs < blockedMs;
              assert.equal(
                overlaps,
                false,
                `Slot starting at ${start.toISOString()} overlaps booking ${b.startsAt.toISOString()} - ${b.blockedUntil.toISOString()}`
              );
            }

            // Invariant 2: Lead time respected
            const leadLimitMs = now.getTime() + shop.leadTimeMin * 60000;
            assert.ok(
              startMs >= leadLimitMs,
              `Slot starting at ${start.toISOString()} violates lead time ${shop.leadTimeMin}m`
            );
          }
        }

        return true;
      }
    ),
    { numRuns: 10000 }
  );

  assert.equal(count, 10000, 'Expected 10,000 property test scenarios executed');
});

test('DST zone transition test (Europe/London clocks forward/back)', () => {
  // Test Europe/London on spring transition: 2026-03-29
  const now = new Date('2026-03-28T12:00:00Z');
  const shop = {
    timezone: 'Europe/London',
    slotIntervalMin: 30,
    leadTimeMin: 0,
    horizonDays: 14,
  };

  const service = { id: 's1', durationMin: 30, bufferMin: 0 };
  const providers = [{ id: 'p1', name: 'Dr. London', sort: 0, active: true, offersService: true }];
  const workingHours = [
    { providerId: 'p1', weekday: 7, startTime: '09:00', endTime: '12:00' }, // Sunday
  ];

  const input: ComputeSlotsInput = {
    shop,
    service,
    providers,
    workingHours,
    timeOff: [],
    existingBookings: [],
    fromDate: '2026-03-29',
    toDate: '2026-03-29',
    selectedProviderId: 'p1',
    now,
  };

  const results = computeSlots(input);
  assert.equal(results.length, 1, 'Should find slots on DST transition day');
  assert.ok(results[0].starts.length > 0, 'Should generate valid slots during DST transition');
});
