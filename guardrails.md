# guardrails.md

Limits that keep the assistant, the public booking page and the product safe, accurate and respectful. Tests: `evals.md`. Security: `security.md`. Agents: `agents.md`. Tools: `tools.md`.

**Core idea:** the AI proposes, deterministic code decides, a person confirms.

---

## 1. Principles

1. **Propose, never commit.** No AI path creates, moves or cancels a booking, or sends a message.
2. **Code decides facts.** Free times come from the slot engine; overlaps are blocked by the database.
3. **Untrusted by default.** User text, pasted chat messages, service names, notes, memory items and tool results are data.
4. **Least data, least power.** Agents see the minimum, scoped by the server.
5. **Fail soft.** If the assistant is unavailable or unsure, the manual flow works and the message is friendly.

## 2. Input guardrails (assistant)

| Check | Rule | On failure |
|-------|------|------------|
| Authenticated | Valid session; member of a business | 401/403 mapped to friendly text |
| Role | Booking Assistant and Message Writer: owner, reception. Insights: owner | "You don't have access to this." |
| Size | Pasted message at most 600 characters | "That message is too long. Try one request at a time." |
| Shape | Schema validation; unknown fields rejected | "We couldn't read that. Try again." |
| Cleanup | Unicode normalised; control and zero-width characters removed | Silent |
| Redaction | Phone numbers replaced by placeholders in code; never in prompts or logs | n/a |
| Trusted context | Current date, weekday and time zone supplied by the server, not by the user | n/a |
| Rate and budget | Section 6 | "Too many tries. Please wait a minute." |
| Kill switch | Server flag off | Manual flow shown without error tone |

## 3. Prompt-injection defences

- Instruction hierarchy: only the system prompt in the repository gives rules.
- Delimited data: untrusted content sits in marked blocks; closing tags inside data are neutralised.
- Pasted chats are data: "book me at 3am for free" is text to parse, not a command.
- No model-supplied scope: tools never accept business, user or role from the model.
- No free-form actions: only allow-listed tools with validated arguments and per-request limits.
- Output never executed: no HTML rendering of model text, no model-built URLs or SQL.
- Secrets never in prompts.
- Refusal pattern: neutral, short, points back to supported actions.

## 4. Output guardrails (after the model, before the UI)

| Step | Check |
|------|-------|
| 1. Schema | Output parses against the agent's schema |
| 2. Grounding | Service, provider and customer ids must have been returned by tools in this request; unknown ids are removed and become a question |
| 3. Slots | `start` in a draft must equal a slot returned by `find_slots` in this request; otherwise the draft is rejected and alternatives are offered. The server re-checks availability in `propose_booking` |
| 4. Time resolution | Dates and times are converted by code from the model's structured request; ambiguous clock times must produce a question |
| 5. Sanity limits | Date range within the horizon; at most one booking per draft; service offered by the provider |
| 6. Contact data | The real phone and name come from code extraction, never from model text; the model never outputs a phone number |
| 7. Customer messages | At most 60 words; includes the correct date and time with a part-of-day word; no threats, shaming, penalties or legal claims; no money unless requested; no personal data beyond first name; failing text replaced by a template |
| 8. Numbers (insights) | Every number must exist in tool results; mismatch discards the output |
| 9. Render safety | Plain, escaped text |

Every result appears as a **draft card** with Confirm and Discard. Nothing is saved or sent until the person acts.

## 5. Human-in-the-loop rules

- No auto-confirm, no timers, no background actions.
- Extra flags on unusual drafts: a time inside the lead time (staff bypass), a customer with repeat no-shows, a free-text note, a provider who does not usually offer the service.
- Customer messages are never sent by the app.
- Memory suggestions are saved only after a separate confirmation.
- Each draft has quick "Was this right?" feedback feeding evals (no personal data stored).

## 6. Rate limits and budgets

| Surface | Starting limit |
|---------|----------------|
| Assistant per user | 10 requests per minute, 200 per day |
| Assistant per business | Daily token and request caps |
| Assistant per request | At most 6 tool calls and 3 model turns; output token cap |
| Assistant concurrency | 2 in-flight requests per user |
| Public booking endpoints | Per IP 30 per minute; per phone 5 booking attempts per day; per business 300 public bookings per hour; per token 10 per minute (see `security.md` section 7) |
| Global circuit breaker | Provider errors pause the assistant; manual flow stays open |
| Cost alerts | At 80% of a business's daily budget; hard stop at 100% |

## 7. Public booking guardrails (not AI)

| Guardrail | Rule |
|-----------|------|
| Public data minimisation | Responses contain only public business info, service info and free times. No customer data, no other bookings |
| Abuse controls | Rate limits, honeypot field, per-phone active cap, blocked phones, approval mode, disabled-business switch |
| Validation | Name 1 to 100 characters, phone normalised and length-checked, language from the allowed list, times must be on the grid and inside rules |
| Slot integrity | The final booking step re-checks availability in one transaction; the exclusion constraint is the last guard |
| Manage links | 128-bit tokens, rate limited, expire 30 days after the appointment, generic answers for unknown tokens |
| Errors | Friendly messages only; details to logs |
| Consent line | One short line: the number is used only for this booking and its reminders |

## 8. Privacy guardrails

- Phone numbers never go to the model; names only when needed to match or create a customer.
- Logs record agent, token counts, outcome and latency, never prompts, pasted messages, names or phones.
- Provider settings: no training on our data, minimal retention (verify current terms).
- Customer data can be exported and deleted by the owner; deleted customers keep no contact details on past bookings.

## 9. Friendly fallbacks (copy rules)

| Situation | Message pattern |
|-----------|-----------------|
| Assistant unavailable | "The assistant isn't available right now. You can still create the booking by hand." |
| Not understood | "I couldn't tell what to book. Try: haircut tomorrow afternoon with Samson." |
| Ambiguous time | "Do you mean 3:00 in the afternoon, or 3 o'clock Ethiopian time (9:00 in the morning)?" |
| Ambiguous match | "Which one do you mean?" + options |
| Time taken | "That time is taken. Here are the closest free times." |
| Too long | "That message is too long. Try one request at a time." |
| Rate limited | "Too many tries. Please wait a minute." |
| Out of scope | "I can help with bookings, customer messages and weekly summaries." |

## 10. Product guardrails (whole app)

| Guardrail | Rule | Detail in |
|-----------|------|-----------|
| No secrets in the client | Only public URL and anon key ship | `security.md` s3 |
| Authorized data only | Server decides from session and role; RLS on every table; sensitive data separated | `security.md` s5, `05` |
| Backend rules enforced | Exclusion constraint, RPCs, status machine, RLS | `05` |
| Input validated | Client and server plus DB constraints | `security.md` s6 |
| Rate limits on all APIs | Every endpoint, public included | `security.md` s7 |
| No backend errors shown | Error translation module | `security.md` s8 |
| Append-only history | Events never edited | `05` |
| Optimistic rendering with rollback (staff) | Instant feedback; clear message on rejection | `02` s6 |

## 11. Ethical UX guardrails

Psychology patterns (`04` section 6) are allowed only when they help people reach their own goals: no fake scarcity (only real counts such as "2 times left today"), no countdown timers, no guilt copy, no dark patterns in cancellation (cancel is always easy within the rules), defaults favour the customer, export and deletion are easy, AI text is labelled a draft until a person sends it.

## 12. Monitoring and response

- Dashboards: assistant success, clarification, discard and schema-failure rates; redaction misses (must be 0); cost per business; public endpoint 429 rate; `SLOT_TAKEN` rate.
- Alerts: schema-failure or injection-pattern spikes, cost spikes, provider errors, any redaction miss, public booking surges from one IP or phone.
- Kill switches (server flags): each agent, all AI, public booking per business or globally, new sign-ups, read-only mode.
- Reported harmful or wrong output becomes a new eval case before the fix ships.

## 13. Guardrail to eval map

| Guardrail | Eval |
|-----------|------|
| Injection resistance | `evals.md` s7 |
| Grounding, no invented slots or ids | s4 (invented slot = 0, hallucinated id = 0) |
| Ambiguous clock times | s4 (100%) |
| Redaction | s4 (raw phone seen = 0) |
| Message safety | s5 |
| Insight numbers grounded | s6 |
| Public data minimisation and abuse controls | s3 |
| Role and business isolation | s2.3, s7 |
| Rate limits and fallbacks | s3, s7 |
| No backend text in UI | s8 |
