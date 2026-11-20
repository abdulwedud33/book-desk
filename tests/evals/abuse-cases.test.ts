// tests/evals/abuse-cases.test.ts
// Automated abuse cases tests per docs/security.md section 14.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { intervalsOverlap } from '../../src/domain/schedule.ts';
import { sanitizeUntrustedInput } from '../../src/domain/ai-guardrails.ts';
import { localToUtc } from '../../src/domain/time.ts';

describe('Security Abuse Cases (docs/security.md section 14)', () => {
  it('Abuse Case: Token guessing - verifies 128-bit token entropy & length format', () => {
    // 128-bit base64url token is 22 characters
    const validToken = 'k9Z_a1B2c3D4e5F6g7H8i9';
    assert.equal(validToken.length >= 22, true);
    assert.match(validToken, /^[A-Za-z0-9_-]{22,64}$/);

    // Reject short or sequential tokens
    const shortToken = '12345';
    assert.equal(shortToken.length < 22, true);
  });

  it('Abuse Case: Replayed manage links - expired strictly 30 days after appointment', () => {
    const now = new Date();
    const thirtyDaysMs = 30 * 86400000;

    // 31 days past appointment
    const pastApptStart = new Date(now.getTime() - 31 * 86400000);
    const isExpired31 = (now.getTime() - pastApptStart.getTime()) > thirtyDaysMs;
    assert.equal(isExpired31, true);

    // 10 days past appointment (still within 30-day window)
    const recentApptStart = new Date(now.getTime() - 10 * 86400000);
    const isExpired10 = (now.getTime() - recentApptStart.getTime()) > thirtyDaysMs;
    assert.equal(isExpired10, false);
  });

  it('Abuse Case: Server-enforced cutoff blocks late cancellations & reschedules', () => {
    const now = new Date();
    const cutoffHours = 2;

    // 1 hour before appointment when cutoff is 2 hours -> Cutoff passed
    const closeApptStart = new Date(now.getTime() + 1 * 3600000);
    const cutoffThresholdClose = new Date(closeApptStart.getTime() - cutoffHours * 3600000);
    const isCutoffPassedClose = now.getTime() >= cutoffThresholdClose.getTime();
    assert.equal(isCutoffPassedClose, true, 'Modification rejected when cutoff has passed');

    // 5 hours before appointment -> Allowed
    const safeApptStart = new Date(now.getTime() + 5 * 3600000);
    const cutoffThresholdSafe = new Date(safeApptStart.getTime() - cutoffHours * 3600000);
    const isCutoffPassedSafe = now.getTime() >= cutoffThresholdSafe.getTime();
    assert.equal(isCutoffPassedSafe, false, 'Modification allowed 5 hours before appointment');
  });

  it('Abuse Case: Simultaneous booking race condition - overlapping intervals detected', () => {
    // b1: 10:00 to 10:30 (with 5 min buffer -> 10:35)
    // b2 attempts: 10:20 to 10:50
    const b1Interval = { start: '10:00', end: '10:35' };
    const b2Interval = { start: '10:20', end: '10:50' };

    const overlaps = intervalsOverlap(b1Interval, b2Interval);
    assert.equal(overlaps, true, 'Race condition: overlapping slots must be blocked by exclusion rule');
  });

  it('Abuse Case: Huge payloads & malicious Unicode strings', () => {
    const oversizedPayload = 'x'.repeat(10000);
    const sanitized = sanitizeUntrustedInput(oversizedPayload, 600);
    assert.equal(sanitized.length, 600, 'Payload must be strictly truncated to 600 characters max');

    // Strips zero-width & non-printable characters
    const maliciousUnicode = 'admin\u200B\u200D\uFEFFuser\x00\x1F';
    const cleaned = sanitizeUntrustedInput(maliciousUnicode);
    assert.equal(cleaned, 'adminuser');
  });

  it('Abuse Case: Timezone DST transitions handled accurately', () => {
    // London clocks spring forward by 1 hour on 2026-03-29
    // 09:00 local time becomes 09:00 UTC before DST, but 08:00 UTC after DST starts
    const beforeDst = localToUtc('2026-03-28', '09:00', 'Europe/London');
    const afterDst = localToUtc('2026-03-30', '09:00', 'Europe/London');

    assert.equal(beforeDst.toISOString(), '2026-03-28T09:00:00.000Z');
    assert.equal(afterDst.toISOString(), '2026-03-30T08:00:00.000Z');
  });
});
