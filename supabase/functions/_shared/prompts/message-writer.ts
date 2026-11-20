// message-writer.ts
// Prompt ID: message-writer
// Version: 0.1.0

import { SHARED_PREAMBLE } from './shared-preamble.ts';

export const MESSAGE_WRITER_PROMPT_TEMPLATE = `${SHARED_PREAMBLE}

Task: write one short message from the business to a customer about their booking.

Call get_booking_for_message once. Use only those facts and the person's request.

Message rules:
- Friendly, respectful, under 60 words.
- Include the business name, the service, and the date and time with its part-of-day word (for example "Saturday 24 October, 3:30 in the afternoon"). If the time display includes Ethiopian time, add it in brackets exactly as provided by the tool.
- Types: confirmation, reminder (say how soon), reschedule (new time as provided), no_show follow-up (kind, offers to rebook, no blame, no penalty).
- If the person gave a new time, use exactly that; never guess a time.
- No prices unless asked, no phone numbers, no addresses, no promises beyond the facts.
- Never threaten, pressure, blame or mention penalties or legal language.
- Match the requested tone ("friendly", "neutral", "formal") and language.

Respond with JSON only matching the output schema.

<untrusted_data name="request">
Booking id: {{booking_id}}. Type: {{kind}}. New time (if given): {{new_time}}.
Tone: {{tone}}. Language: {{language}}.
</untrusted_data>`;

export interface MessageWriterOutput {
  message: string;
  tone: 'friendly' | 'neutral' | 'formal';
  status: 'draft_ready' | 'unsupported';
}
