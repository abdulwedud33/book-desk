// booking-assistant.ts
// Prompt ID: booking-assistant
// Version: 0.1.0

import { SHARED_PREAMBLE } from './shared-preamble.ts';

export const BOOKING_ASSISTANT_PROMPT_TEMPLATE = `${SHARED_PREAMBLE}

Task: read the message and work out which booking the person wants.

Process:
1. Call get_shop_memory first if the message uses nicknames.
2. Identify: service, provider (optional), customer name (optional), date or date range, part of the day (morning, afternoon, evening) and/or a clock time.
3. Use search_services (and search_providers, search_customers) to match. Choose a match only if exactly one clearly fits. If two or more fit, or none fit, ask with options.
4. Resolve dates ONLY from the 14-day calendar in <trusted_context>. "Tomorrow" and "next Tuesday" must be looked up there. If the date is further away than the calendar or unclear, ask.
5. Clock times: apply rule 5. If the person gave a clear marker, pass near_time (24-hour form) with clock_system "international" or "ethiopian"; the app converts.
6. Call find_slots with the resolved service, provider (or none), date range (at most 14 days) and the part of the day or near_time. Offer at most 5 of the returned slots as options. Never create a time that find_slots did not return.
7. When the person's message clearly names one of the returned slots, call propose_booking with that exact start. Otherwise ask which slot they want.
8. If several separate requests are in one message, ask to split them.

Respond with JSON only matching the output schema. No extra text.

<trusted_context>
Now: {{local_datetime}} ({{timezone}}), {{weekday}}. Calendar: {{calendar_14_days}}.
Time display: {{time_display}}. Business type: {{business_type}}. Language: {{language}}.
</trusted_context>
<untrusted_data name="message">
{{redacted_message}}
</untrusted_data>`;

export interface BookingAssistantClarificationOption {
  id: string;
  label: string;
}

export interface BookingAssistantClarification {
  field: 'service' | 'provider' | 'customer' | 'date' | 'time' | 'clock_system' | 'other';
  question: string;
  options: BookingAssistantClarificationOption[];
}

export interface BookingAssistantSlotOption {
  start: string;
  provider_id: string;
  label: string;
}

export interface BookingAssistantMemorySuggestion {
  kind: 'alias';
  key: string;
  value: string;
  ref_id: string;
}

export interface BookingAssistantOutput {
  status: 'draft_ready' | 'needs_clarification' | 'unsupported';
  confidence: 'high' | 'medium' | 'low';
  clarifications: BookingAssistantClarification[];
  slot_options: BookingAssistantSlotOption[];
  memory_suggestion: BookingAssistantMemorySuggestion | null;
  note: string | null;
  draft?: {
    service_id: string;
    service_name: string;
    provider_id: string | null;
    provider_name: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    start: string;
    end: string;
    note?: string | null;
  } | null;
}
