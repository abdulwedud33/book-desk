import { t } from '../i18n/index.ts';

export type ErrorCode =
  | 'GENERIC'
  | 'SLOT_TAKEN'
  | 'RATE_LIMITED'
  | 'INVALID_SLUG'
  | 'SLUG_TAKEN'
  | 'INVALID_INVITE'
  | 'FORBIDDEN'
  | 'CUTOFF_PASSED'
  | 'OUTSIDE_HOURS'
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'LIMIT_REACHED'
  | 'BLOCKED'
  | 'SESSION_EXPIRED';

// List of technical patterns that must NEVER leak to users
const FORBIDDEN_LEAK_PATTERNS = [
  /select\s+/i,
  /insert\s+/i,
  /update\s+/i,
  /delete\s+/i,
  /from\s+[a-z_]+/i,
  /where\s+/i,
  /errcode/i,
  /p\d{4}/i, // Postgres error codes like P0001
  /42[a-z0-9]{3}/i,
  /23[a-z0-9]{3}/i,
  /at\s+[a-z0-9_\/\\.]+\.js/i, // stack traces
  /at\s+[a-z0-9_\/\\.]+\.ts/i,
  /\{[\s\S]*"[\s\S]*:[\s\S]*\}/, // Raw JSON
  /syntax\s+error/i,
  /violates\s+foreign\s+key/i,
  /violates\s+check\s+constraint/i,
  /violates\s+unique\s+constraint/i,
  /column\s+"[^"]+"/i,
  /table\s+"[^"]+"/i,
];

export function sanitizeUserMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return t().errors.generic;
  }

  // Check if the message contains any leaking technical jargon
  for (const pattern of FORBIDDEN_LEAK_PATTERNS) {
    if (pattern.test(message)) {
      return t().errors.generic;
    }
  }

  return message;
}

export function translateError(error: unknown): string {
  const catalog = t();

  if (!error) {
    return catalog.errors.generic;
  }

  // Extract raw error string or code
  let raw = '';
  if (typeof error === 'string') {
    raw = error;
  } else if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, any>;
    raw = String(err.code || err.message || err.error || '');
  }

  const normalized = raw.toUpperCase();

  if (normalized.includes('SLOT_TAKEN') || normalized.includes('EXCLUSION_VIOLATION')) {
    return catalog.errors.slotTaken;
  }
  if (normalized.includes('RATE_LIMITED') || normalized.includes('P0001') || normalized.includes('429')) {
    return catalog.errors.rateLimited;
  }
  if (normalized.includes('SLUG_UNAVAILABLE') || normalized.includes('SLUG_TAKEN')) {
    return catalog.errors.slugTaken;
  }
  if (normalized.includes('INVALID_SLUG')) {
    return catalog.errors.invalidSlug;
  }
  if (normalized.includes('INVALID_OR_EXPIRED_INVITE') || normalized.includes('INVALID_INVITE') || normalized.includes('P0003')) {
    return catalog.errors.invalidInvite;
  }
  if (normalized.includes('FORBIDDEN') || normalized.includes('42501')) {
    return catalog.errors.forbidden;
  }
  if (normalized.includes('CUTOFF_PASSED')) {
    return catalog.errors.cutoffPassed;
  }
  if (normalized.includes('OUTSIDE_HOURS')) {
    return catalog.errors.outsideHours;
  }
  if (normalized.includes('TOO_SOON')) {
    return catalog.errors.tooSoon;
  }
  if (normalized.includes('TOO_FAR')) {
    return catalog.errors.tooFar;
  }
  if (normalized.includes('LIMIT_REACHED')) {
    return catalog.errors.limitReached;
  }
  if (normalized.includes('BLOCKED')) {
    return catalog.errors.blocked;
  }
  if (normalized.includes('SESSION_EXPIRED') || normalized.includes('JWT_EXPIRED')) {
    return catalog.errors.sessionExpired;
  }

  // Fallback sanitized generic message
  return sanitizeUserMessage(catalog.errors.generic);
}
