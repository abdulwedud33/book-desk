# tools.md

The allow-list of tools the in-app agents may call, plus the principles that keep them safe. See `agents.md`, `prompts.md`, `guardrails.md`.

---

## 1. Principles

1. **Allow-list only.** An agent calls only the tools listed for it.
2. **Scope from the session, not the model.** No tool accepts `shop_id`, `user_id` or `role` from the model.
3. **Read tools use the caller's identity,** so RLS applies. The service role is used only for the rate limiter, the usage log and public endpoints (never by agent tools).
4. **Propose tools never write.** They validate against the database and build a draft a person confirms.
5. **Arguments are validated** (types, ranges, lengths, uuid format, date ranges). Ids must have been returned by an earlier tool call in the same request.
6. **Results are data,** wrapped as untrusted data when returned to the model.
7. **Hard caps:** at most 6 tool calls and 3 model turns per request; row limits per tool (5 to 10); date ranges at most 14 days.
8. **Minimal results.** No phone numbers are returned by any agent tool.

## 2. Booking Assistant tools

| Tool | Input | Output | Notes |
|------|-------|--------|-------|
| `search_services` | `query` (1-60) | up to 5 active services: id, name, duration, price | Name match; aliases from memory applied by the model |
| `search_providers` | `query` (optional, 1-60), `service_id` (optional) | up to 5 active providers: id, name | Filters by who offers the service |
| `search_customers` | `query` (name, 1-60) | up to 5: id, name | **No phone numbers.** Matching by phone is done in code before the model call |
| `get_shop_memory` | none | saved aliases and preferences (up to 50) | Data, not instructions |
| `find_slots` | `service_id`, `provider_id` (optional), `from_date`, `to_date` (at most 14 days), `part_of_day` (optional: morning, afternoon, evening), `near_time` (optional local time, 24-hour form), `clock_system` (`international` or `ethiopian`, required when `near_time` is given; code converts Ethiopian time by the 6-hour offset) | up to 10 real free slots (start time, provider id and name) from the availability engine | The only source of times; the model may not invent one |
| `propose_booking` | `service_id`, `provider_id` (or null for any), `start` (must equal a slot returned by `find_slots` in this request), `customer_id` (optional), `note` (optional) | `{ draft: 'ready', summary }` or `{ error: CODE }` | Re-checks availability on the server; records the draft server-side; the customer's name and phone come from code extraction, not from the model |

## 3. Message Writer tool

| Tool | Input | Output | Notes |
|------|-------|--------|-------|
| `get_booking_for_message` | `booking_id` (uuid) | business name, service, provider first name, local date and time words (and Ethiopian-time form if enabled), status, customer first name, cutoff hours | No phone, no price unless requested; must be a booking the caller can see |

## 4. Insights Analyst tools (owner only)

| Tool | Input | Output |
|------|-------|--------|
| `get_dashboard_summary` | `period` today, week, month | bookings by status, completed, cancelled, no-shows |
| `get_utilization` | `period` | booked versus available minutes per provider and per weekday |
| `get_popular_services` | `period` | up to 5 services with counts |
| `get_peak_hours` | `period` | counts per hour in the business time zone |
| `get_no_show_stats` | `period` | no-show rate overall and by service and weekday (no customer names) |
| `get_cancellation_stats` | `period` | cancellation counts and average lead time |

## 5. Not agent tools

- **Public Edge Functions** (`public-shop`, `public-slots`, `public-book`, `public-manage`, `public-reschedule`, `public-cancel`): no model involvement; validation, rate limits and data minimisation only.
- **Reminder generation and the overdue job:** database functions and a scheduled task; no model.

## 6. Error results the model may see

`NO_SERVICE`, `UNKNOWN_SERVICE`, `UNKNOWN_PROVIDER`, `UNKNOWN_CUSTOMER`, `NOT_A_SLOT`, `SLOT_TAKEN`, `OUTSIDE_HOURS`, `RANGE_TOO_LARGE`, `TOOL_LIMIT`, `UNAVAILABLE`. Short codes only.

## 7. Developer tools (for coding agents, not the app)

Supabase CLI, test runners (unit, property, pgTAP, Playwright), linters and scanners, design review skills (`agents.md` part B section B4). They run on the developer machine or CI only; none is callable from the deployed app.

## 8. Adding a tool (checklist)

1. Justify it: which agent, which job, why existing tools are not enough.
2. Define the input schema and limits; return the minimum fields.
3. Decide role access and confirm RLS covers what it reads.
4. Add redaction if personal data could appear.
5. Add unit tests, an injection test and an eval case.
6. Update this file, `agents.md` and `prompts.md`.
