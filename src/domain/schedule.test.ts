import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalsOverlap, validateDayShifts, parseMinutes } from './schedule.ts';

test('parseMinutes converts HH:MM to total minutes correctly', () => {
  assert.equal(parseMinutes('00:00'), 0);
  assert.equal(parseMinutes('08:30'), 510);
  assert.equal(parseMinutes('13:00'), 780);
  assert.equal(parseMinutes('23:59'), 1439);
});

test('intervalsOverlap accurately handles half-open intervals [start, end)', () => {
  // Back-to-back shifts: 09:00-13:00 and 13:00-17:00 (do not overlap!)
  assert.equal(
    intervalsOverlap({ start: '09:00', end: '13:00' }, { start: '13:00', end: '17:00' }),
    false,
    'Back-to-back shifts must NOT overlap'
  );

  // Clearly separated shifts: 08:30-12:30 and 14:00-18:30 (do not overlap)
  assert.equal(
    intervalsOverlap({ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:30' }),
    false,
    'Separated split shifts must NOT overlap'
  );

  // Partially overlapping shifts: 09:00-13:00 and 12:30-15:00 (overlap!)
  assert.equal(
    intervalsOverlap({ start: '09:00', end: '13:00' }, { start: '12:30', end: '15:00' }),
    true,
    'Overlapping intervals must return true'
  );

  // Fully containing shift: 08:00-18:00 contains 10:00-14:00 (overlap!)
  assert.equal(
    intervalsOverlap({ start: '08:00', end: '18:00' }, { start: '10:00', end: '14:00' }),
    true,
    'Contained intervals must return true'
  );
});

test('validateDayShifts correctly validates split shifts and catches conflicts', () => {
  const validSplitShift = [
    { start: '08:30', end: '13:00' },
    { start: '14:00', end: '18:30' },
  ];
  assert.deepEqual(validateDayShifts(validSplitShift), { valid: true });

  const overlappingSplitShift = [
    { start: '08:30', end: '13:30' },
    { start: '13:00', end: '18:30' },
  ];
  const invalidResult = validateDayShifts(overlappingSplitShift);
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.error?.includes('overlaps with'));
});
