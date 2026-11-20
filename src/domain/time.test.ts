import test from 'node:test';
import assert from 'node:assert/strict';
import { toEthiopianHour, getPartOfDay } from './time.ts';

test('toEthiopianHour matches required test table from specification', () => {
  // Required unit-test table from master prompt:
  // 06:00->12:00, 07:00->1:00, 09:00->3:00, 12:00->6:00,
  // 15:00->9:00, 18:00->12:00, 21:00->3:00, 00:00->6:00
  const expectedTable: [number, number][] = [
    [6, 12],
    [7, 1],
    [9, 3],
    [12, 6],
    [15, 9],
    [18, 12],
    [21, 3],
    [0, 6],
  ];

  for (const [intlHour, expectedEthHour] of expectedTable) {
    const result = toEthiopianHour(intlHour);
    assert.equal(
      result,
      expectedEthHour,
      `Expected international hour ${intlHour}:00 to map to Ethiopian hour ${expectedEthHour}:00, got ${result}:00`
    );
  }
});

test('getPartOfDay categorizes hours correctly', () => {
  assert.equal(getPartOfDay(9), 'morning');
  assert.equal(getPartOfDay(14), 'afternoon');
  assert.equal(getPartOfDay(19), 'evening');
  assert.equal(getPartOfDay(23), 'night');
});
