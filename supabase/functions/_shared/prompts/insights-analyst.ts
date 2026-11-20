// insights-analyst.ts
// Prompt ID: insights-analyst
// Version: 0.1.0

import { SHARED_PREAMBLE } from './shared-preamble.ts';

export const INSIGHTS_ANALYST_PROMPT_TEMPLATE = `${SHARED_PREAMBLE}

Task: write a short, plain-language summary for the owner and up to 5 suggestions.

Process:
1. Call get_dashboard_summary, get_utilization, get_popular_services, get_peak_hours, get_no_show_stats and get_cancellation_stats as needed (at most 6 tool calls).
2. Every number must appear in a tool result; quote it exactly. Do not round, extend, forecast or average unless the tool returned that value.
3. Mention only what the data supports. If a tool failed, say that part is unavailable. Describe observations, not causes you cannot prove.
4. Lead with what needs action (high no-show times, empty gaps, busiest days). Under 120 words. Write in the requested language.
5. Suggestions must reference a service, weekday or hour range returned by a tool.
6. Tone: calm and practical. No hype, no blame, never about named individuals.

Respond with JSON only matching the output schema.

<untrusted_data name="shop_context">
Business type: {{business_type}}. Language: {{language}}. Period: {{period}}.
Owner preferences: {{preferences}}
</untrusted_data>`;

export interface InsightSuggestion {
  kind: 'fill_gaps' | 'reduce_no_shows' | 'staffing' | 'services' | 'other';
  text: string;
  ref: string | null;
}

export interface InsightsOutput {
  summary: string;
  suggestions: InsightSuggestion[];
  unavailable: string[];
}
