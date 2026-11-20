import test from 'node:test';
import assert from 'node:assert/strict';
import { translateError, sanitizeUserMessage } from './errors.ts';
import { setLocale } from '../i18n/index.ts';

const LEAK_CHECK_PATTERNS = [
  /select\s+/i,
  /insert\s+/i,
  /update\s+/i,
  /delete\s+/i,
  /from\s+[a-z_]+/i,
  /errcode/i,
  /P000\d/i,
  /42501/i,
  /23505/i,
  /at\s+[a-z0-9_\/\\.]+\.js/i,
  /at\s+[a-z0-9_\/\\.]+\.ts/i,
  /\{[\s\S]*"[\s\S]*:[\s\S]*\}/,
  /syntax\s+error/i,
  /violates\s+foreign\s+key/i,
];

test('translateError maps standard codes to friendly strings across locales', () => {
  for (const locale of ['en', 'am', 'om'] as const) {
    setLocale(locale);

    const slotTaken = translateError('SLOT_TAKEN');
    assert.ok(slotTaken.length > 5);
    assert.doesNotMatch(slotTaken, /SLOT_TAKEN/);

    const rateLimited = translateError('RATE_LIMITED');
    assert.ok(rateLimited.length > 5);
    assert.doesNotMatch(rateLimited, /RATE_LIMITED/);

    const forbidden = translateError('FORBIDDEN');
    assert.ok(forbidden.length > 5);
    assert.doesNotMatch(forbidden, /FORBIDDEN/);
  }
  setLocale('en');
});

test('failure-fuzz test: zero SQL, codes, stack traces, or raw JSON leak to user', () => {
  const adversarialInputs = [
    'SELECT * FROM shops WHERE id = "123"',
    'Postgres error: P0001 in function book_slot',
    'Error: fatal\n at Object.run (/app/node_modules/pg/client.js:42:15)',
    '{"error": "InternalServerError", "code": 500, "details": "column \"owner_id\" of relation \"shops\" does not exist"}',
    'Error: violates check constraint "shops_slug_check"',
    'syntax error at or near "FROM" at character 14',
    new Error('Uncaught TypeError: Cannot read property "name" of undefined at renderPage (src/app/page.tsx:10:5)'),
    { message: 'UPDATE shop_members SET role = "owner" WHERE user_id = 999' },
    { code: '42501', message: 'permission denied for table shops' },
    { code: '23505', detail: 'Key (slug)=(addis-cuts) already exists.' },
    null,
    undefined,
    12345,
    '',
    '    ',
    '<!DOCTYPE html><html><head><title>500 Internal Server Error</title></head></html>',
  ];

  for (const input of adversarialInputs) {
    const userMessage = translateError(input);

    assert.ok(
      typeof userMessage === 'string' && userMessage.trim().length > 0,
      'User message must always be a non-empty string'
    );

    for (const pattern of LEAK_CHECK_PATTERNS) {
      assert.doesNotMatch(
        userMessage,
        pattern,
        `Leaked technical pattern "${pattern}" found in user message: "${userMessage}" from input: ${JSON.stringify(input)}`
      );
    }
  }
});
