// tests/evals/assistant-contract.test.ts
// Contract tests for Staff Assistant schemas and outputs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  redactPhones,
  sanitizeUntrustedInput,
  detectTimeAmbiguity,
  validateSlotGrounding,
  validateMessageDraftSafety,
} from '../../src/domain/ai-guardrails.ts';

const BookingAssistantOutputSchema = z.object({
  status: z.enum(['draft_ready', 'needs_clarification', 'unsupported']),
  confidence: z.enum(['high', 'medium', 'low']),
  clarifications: z.array(
    z.object({
      field: z.enum(['service', 'provider', 'customer', 'date', 'time', 'clock_system', 'other']),
      question: z.string().max(160),
      options: z.array(z.object({ id: z.string().max(60), label: z.string().max(80) })).max(5),
    })
  ).max(4),
  slot_options: z.array(
    z.object({ start: z.string().max(40), provider_id: z.string(), label: z.string().max(80) })
  ).max(5),
  memory_suggestion: z
    .object({
      kind: z.literal('alias'),
      key: z.string().max(80),
      value: z.string().max(300),
      ref_id: z.string(),
    })
    .nullable(),
  note: z.string().max(140).nullable(),
});

const MessageWriterOutputSchema = z.object({
  message: z.string().max(400),
  tone: z.enum(['friendly', 'neutral', 'formal']),
  status: z.enum(['draft_ready', 'unsupported']),
});

const InsightsOutputSchema = z.object({
  summary: z.string().max(700),
  suggestions: z.array(
    z.object({
      kind: z.enum(['fill_gaps', 'reduce_no_shows', 'staffing', 'services', 'other']),
      text: z.string().max(160),
      ref: z.string().max(40).nullable(),
    })
  ).max(5),
  unavailable: z.array(z.string().max(60)).max(4),
});

describe('Staff Assistant - Contract Validation', () => {
  it('validates a conformant BookingAssistantOutput schema', () => {
    const validOutput = {
      status: 'draft_ready',
      confidence: 'high',
      clarifications: [],
      slot_options: [
        {
          start: '2026-11-21T09:00:00Z',
          provider_id: 'a0000000-0000-0000-0000-000000000001',
          label: 'Sat 9:00 AM',
        },
      ],
      memory_suggestion: null,
      note: 'Draft prepared from available slots',
    };

    const parsed = BookingAssistantOutputSchema.safeParse(validOutput);
    assert.equal(parsed.success, true);
  });

  it('validates a conformant MessageWriterOutput schema', () => {
    const validOutput = {
      message: 'Hello Abel, this is Super Cuts. Your haircut is confirmed for Saturday at 2:00 PM.',
      tone: 'friendly',
      status: 'draft_ready',
    };

    const parsed = MessageWriterOutputSchema.safeParse(validOutput);
    assert.equal(parsed.success, true);
  });

  it('validates a conformant InsightsOutput schema', () => {
    const validOutput = {
      summary: 'This week, your business scheduled 35 bookings with 30 completed.',
      suggestions: [
        {
          kind: 'services',
          text: 'Haircut is your top service.',
          ref: 'Haircut',
        },
      ],
      unavailable: [],
    };

    const parsed = InsightsOutputSchema.safeParse(validOutput);
    assert.equal(parsed.success, true);
  });

  it('enforces that slot options are grounded strictly in availability results', () => {
    const availableSlots = [{ start: '2026-11-21T10:00:00Z' }];
    assert.equal(validateSlotGrounding('2026-11-21T10:00:00Z', availableSlots), true);
    assert.equal(validateSlotGrounding('2026-11-21T11:00:00Z', availableSlots), false);
  });
});
