/**
 * Booking Status Machine & Transition Rules
 * Defined in @docs/02-technical-requirements.md Section 5
 * Single source of truth for both TypeScript domain and PostgreSQL schema
 */

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type MemberRole = 'owner' | 'reception' | 'provider';

export interface StatusTransition {
  from: BookingStatus;
  to: BookingStatus;
  roles: MemberRole[];
  customerAllowed: boolean;
}

export const BOOKING_TRANSITIONS: readonly StatusTransition[] = [
  { from: 'pending', to: 'confirmed', roles: ['owner', 'reception'], customerAllowed: false },
  { from: 'pending', to: 'cancelled', roles: ['owner', 'reception'], customerAllowed: false },
  { from: 'confirmed', to: 'arrived', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
  { from: 'confirmed', to: 'in_service', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
  { from: 'confirmed', to: 'completed', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
  { from: 'confirmed', to: 'no_show', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
  { from: 'confirmed', to: 'cancelled', roles: ['owner', 'reception'], customerAllowed: true },
  { from: 'arrived', to: 'in_service', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
  { from: 'arrived', to: 'completed', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
  { from: 'arrived', to: 'cancelled', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
  { from: 'in_service', to: 'completed', roles: ['owner', 'reception', 'provider'], customerAllowed: false },
] as const;

export const FINAL_STATUSES: readonly BookingStatus[] = ['completed', 'cancelled', 'no_show'] as const;

export function isFinalStatus(status: BookingStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/**
 * Checks if a transition from `from` to `to` is theoretically allowed by any actor
 */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Validates whether a staff member with `role` is permitted to perform the transition
 */
export function canRoleTransition(
  from: BookingStatus,
  to: BookingStatus,
  role: MemberRole,
  isOwnBooking: boolean
): boolean {
  const match = BOOKING_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!match) return false;

  if (role === 'owner' || role === 'reception') {
    return match.roles.includes(role);
  }

  if (role === 'provider') {
    // Provider can only change status on their own bookings
    return isOwnBooking && match.roles.includes('provider');
  }

  return false;
}

/**
 * Validates whether a customer (via manage link) is permitted to perform the transition
 */
export function canCustomerTransition(from: BookingStatus, to: BookingStatus): boolean {
  const match = BOOKING_TRANSITIONS.find((t) => t.from === from && t.to === to);
  return Boolean(match?.customerAllowed);
}

/**
 * Returns all possible next statuses from the current status for a given actor
 */
export function getAvailableTransitions(
  from: BookingStatus,
  role: MemberRole,
  isOwnBooking: boolean
): BookingStatus[] {
  return BOOKING_TRANSITIONS
    .filter((t) => t.from === from && canRoleTransition(t.from, t.to, role, isOwnBooking))
    .map((t) => t.to);
}
