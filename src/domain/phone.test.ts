import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.ts';

test('normalizePhone normalises Ethiopian local and international numbers', () => {
  // Ethiopian local with 09
  assert.equal(normalizePhone('0911223344'), '+251911223344');
  assert.equal(normalizePhone('09 11 22 33 44'), '+251911223344');
  assert.equal(normalizePhone('(0911) 22-33-44'), '+251911223344');

  // Ethiopian local with 07
  assert.equal(normalizePhone('0711223344'), '+251711223344');

  // Full E.164 Ethiopian
  assert.equal(normalizePhone('+251911223344'), '+251911223344');
  assert.equal(normalizePhone('+251711223344'), '+251711223344');

  // Other valid international E.164
  assert.equal(normalizePhone('+14155552671'), '+14155552671');
  assert.equal(normalizePhone('+447911123456'), '+447911123456');

  // Invalid numbers
  assert.equal(normalizePhone('123'), null); // too short
  assert.equal(normalizePhone('0911'), null); // too short
  assert.equal(normalizePhone('0811223344'), null); // invalid prefix
  assert.equal(normalizePhone('abcdefghij'), null); // non-digits
});
