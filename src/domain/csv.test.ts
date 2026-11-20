import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvCell, generateCsv } from './csv.ts';

test('sanitizeCsvCell neutralizes spreadsheet formula injection', () => {
  assert.equal(sanitizeCsvCell('=1+1'), "'=1+1");
  assert.equal(sanitizeCsvCell('+cmd|/c calc'), "'+cmd|/c calc");
  assert.equal(sanitizeCsvCell('-20'), "'-20");
  assert.equal(sanitizeCsvCell('@SUM(A1:A10)'), "'@SUM(A1:A10)");
  assert.equal(sanitizeCsvCell('%username%'), "'%username%");
});

test('sanitizeCsvCell escapes RFC 4180 quotes, commas, and newlines', () => {
  assert.equal(sanitizeCsvCell('Hello, World'), '"Hello, World"');
  assert.equal(sanitizeCsvCell('She said "hello"'), '"She said ""hello"""');
  assert.equal(sanitizeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
  assert.equal(sanitizeCsvCell(null), '');
  assert.equal(sanitizeCsvCell(undefined), '');
  assert.equal(sanitizeCsvCell(123), '123');
});

test('generateCsv generates valid formula-safe CSV output', () => {
  const headers = ['Customer Name', 'Phone', 'Formula Note', 'Price'];
  const rows = [
    ['Abel Tesfaye', '+251911223344', '=danger()', 250],
    ['Sara "Joy" Mengistu', '+251922334455', 'Normal note, with comma', 150],
  ];

  const csv = generateCsv(headers, rows);
  const lines = csv.split('\r\n');

  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'Customer Name,Phone,Formula Note,Price');
  // Second line has sanitized formula and escaped phone
  assert.match(lines[1], /'\+251911223344/);
  assert.match(lines[1], /'=danger\(\)/);
  // Third line has escaped double quotes
  assert.match(lines[2], /"Sara ""Joy"" Mengistu"/);
});
