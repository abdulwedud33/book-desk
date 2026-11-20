import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_TRANSITIONS,
  FINAL_STATUSES,
  isFinalStatus,
  canTransition,
  canRoleTransition,
  canCustomerTransition,
  getAvailableTransitions,
} from './status.ts';
import type { BookingStatus } from './status.ts';

test('Status machine: final statuses have no outgoing transitions', () => {
  for (const finalSt of FINAL_STATUSES) {
    assert.equal(isFinalStatus(finalSt), true);
    const outgoing = BOOKING_TRANSITIONS.filter((t) => t.from === finalSt);
    assert.equal(outgoing.length, 0, `Final status ${finalSt} must not have outgoing transitions`);
  }
});

test('Status machine: role permissions match spec matrix', () => {
  // Pending can be confirmed or cancelled by owner/reception, not provider
  assert.equal(canRoleTransition('pending', 'confirmed', 'owner', false), true);
  assert.equal(canRoleTransition('pending', 'confirmed', 'reception', false), true);
  assert.equal(canRoleTransition('pending', 'confirmed', 'provider', true), false);

  // Confirmed -> arrived: owner, reception, and provider (own only)
  assert.equal(canRoleTransition('confirmed', 'arrived', 'owner', false), true);
  assert.equal(canRoleTransition('confirmed', 'arrived', 'reception', false), true);
  assert.equal(canRoleTransition('confirmed', 'arrived', 'provider', true), true);
  assert.equal(canRoleTransition('confirmed', 'arrived', 'provider', false), false);

  // Customer can only cancel from confirmed
  assert.equal(canCustomerTransition('confirmed', 'cancelled'), true);
  assert.equal(canCustomerTransition('confirmed', 'arrived'), false);
  assert.equal(canCustomerTransition('pending', 'cancelled'), false);
  assert.equal(canCustomerTransition('arrived', 'cancelled'), false);

  // Arrived -> completed
  assert.equal(canRoleTransition('arrived', 'completed', 'provider', true), true);
  assert.equal(canRoleTransition('arrived', 'completed', 'provider', false), false);

  // Direct invalid transitions fail
  assert.equal(canTransition('pending', 'completed'), false);
  assert.equal(canTransition('in_service', 'arrived'), false);
  assert.equal(canTransition('cancelled', 'confirmed'), false);
});

test('getAvailableTransitions returns correct options for provider vs owner', () => {
  const ownerFromConfirmed = getAvailableTransitions('confirmed', 'owner', false);
  assert.deepEqual(
    ownerFromConfirmed.sort(),
    ['arrived', 'cancelled', 'completed', 'in_service', 'no_show'].sort()
  );

  const providerOwnFromConfirmed = getAvailableTransitions('confirmed', 'provider', true);
  // Provider cannot cancel confirmed bookings (cancellation is owner/reception per spec matrix)
  assert.deepEqual(
    providerOwnFromConfirmed.sort(),
    ['arrived', 'completed', 'in_service', 'no_show'].sort()
  );

  const providerOtherFromConfirmed = getAvailableTransitions('confirmed', 'provider', false);
  assert.deepEqual(providerOtherFromConfirmed, []);
});
