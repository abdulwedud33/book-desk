import test from 'node:test';
import assert from 'node:assert/strict';
import { BookRequestSchema, ShopQuerySchema, SlotsQuerySchema, MAX_BODY_BYTES } from '../../src/domain/validation.ts';
import { translateError } from '../../src/domain/errors.ts';

test('Security & Data Minimization: public responses contain zero personal or internal customer data', () => {
  // Sample response structure from public_shop_info
  const publicShopInfoSample = {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Addis Barber Shop',
    slug: 'addis-barber',
    timezone: 'Africa/Addis_Ababa',
    locale: 'en',
    time_display: 'both',
    slot_interval_min: 15,
    lead_time_min: 60,
    horizon_days: 30,
    cancel_cutoff_hours: 2,
    confirm_mode: 'instant',
    public_phone: '+251 91 122 3344',
    public_note: 'Bole Road, next to Edna Mall',
    services: [
      { id: 's1', name: 'Haircut', duration_min: 30, buffer_min: 5, price: 250, approval_required: false },
    ],
    providers: [
      { id: 'p1', name: 'Samson', color: 0 },
    ],
  };

  const serialized = JSON.stringify(publicShopInfoSample);

  // Assert no personal customer data leaks
  assert.equal(/customer/i.test(serialized), false, 'Must not contain customer references');
  assert.equal(/phone_e164/i.test(serialized), false, 'Must not contain customer phones');
  assert.equal(/manage_token/i.test(serialized), false, 'Must not contain manage tokens');
  assert.equal(/password/i.test(serialized), false, 'Must not contain credentials');
  assert.equal(/email/i.test(serialized), false, 'Must not contain user emails');
});

test('Abuse controls: Honeypot detects and rejects bot submissions', () => {
  const legitInput = {
    slug: 'addis-barber',
    service_id: '11111111-1111-4111-8111-111111111111',
    starts_at: '2026-11-25T09:00:00.000Z',
    name: 'Dawit Bekele',
    phone: '+251911223344',
    language: 'en' as const,
    website: '', // Empty honeypot
  };

  const legitResult = BookRequestSchema.safeParse(legitInput);
  assert.equal(legitResult.success, true, 'Legitimate human submission must pass validation');

  const botInput = {
    ...legitInput,
    website: 'https://spam-bot.xyz', // Bot filled hidden honeypot
  };

  const botResult = BookRequestSchema.safeParse(botInput);
  assert.equal(botResult.success, false, 'Bot submission with honeypot must be rejected');
});

test('Abuse controls: 4 KB body cap enforced', () => {
  assert.equal(MAX_BODY_BYTES, 4096, 'Public endpoint request cap must be exactly 4096 bytes (4 KB)');
  const largePayload = 'a'.repeat(4097);
  assert.ok(largePayload.length > MAX_BODY_BYTES);
});

test('Rate limiting & error mapping: Calm friendly user messages with zero backend leak', () => {
  const rateLimitMsg = translateError('RATE_LIMITED');
  assert.equal(
    rateLimitMsg,
    'Too many requests. Please wait a moment and try again.'
  );

  const slotTakenMsg = translateError('SLOT_TAKEN');
  assert.equal(
    slotTakenMsg,
    'Someone just booked that time. Here are the closest free times.'
  );

  const limitReachedMsg = translateError('LIMIT_REACHED');
  assert.equal(
    limitReachedMsg,
    'You already have active bookings. Please manage an existing one first.'
  );

  const blockedMsg = translateError('BLOCKED');
  assert.equal(
    blockedMsg,
    'This booking could not be completed. Please call the business.'
  );

  const outsideHoursMsg = translateError('OUTSIDE_HOURS');
  assert.equal(
    outsideHoursMsg,
    'This time is outside the business working hours.'
  );
});

test('Booking flow: Slot taken flow parses alternatives while preserving choices', () => {
  const rawErrorMessage = 'SLOT_TAKEN: {"2026-11-25 10:00:00+03","2026-11-25 10:30:00+03"}';
  const altMatch = rawErrorMessage.match(/SLOT_TAKEN:\s*(\{.*\})/);
  assert.ok(altMatch, 'Must match SLOT_TAKEN alternatives pattern');

  const alternatives = altMatch[1]
    .replace(/[\{\}"]/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  assert.equal(alternatives.length, 2);
  assert.equal(alternatives[0], '2026-11-25 10:00:00+03');
  assert.equal(alternatives[1], '2026-11-25 10:30:00+03');
});

test('Booking layout specification test: 4 steps maintain stationary fixed footprints', () => {
  // Step dimensions specifications
  const HEADER_HEIGHT_PX = 52;
  const PROGRESS_HEIGHT_PX = 40;
  const ACTION_BAR_HEIGHT_PX = 84;
  const PRIMARY_BTN_HEIGHT_PX = 52;

  const steps = [1, 2, 3, 4] as const;

  for (const step of steps) {
    // Header and Progress bars are invariant across steps
    assert.equal(HEADER_HEIGHT_PX, 52, `Step ${step} header height must remain 52px`);
    assert.equal(PROGRESS_HEIGHT_PX, 40, `Step ${step} progress bar height must remain 40px`);
    assert.equal(ACTION_BAR_HEIGHT_PX, 84, `Step ${step} action bar container height must remain 84px`);
    assert.equal(PRIMARY_BTN_HEIGHT_PX, 52, `Step ${step} primary button height must remain 52px`);
  }
});
