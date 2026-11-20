# agents.md

Two audiences:

- **Part A:** the in-app staff assistant (what it may do for a business).
- **Part B:** instructions for coding agents working on this repository.

Companions: `tools.md`, `prompts.md`, `guardrails.md`, `memory.md`, `evals.md`, `security.md`.

---

# Part A. In-app staff assistant

## A1. Principles

1. **Propose, never commit.** The assistant drafts; people confirm. It cannot create, move, cancel or message anything by itself.
2. **Code decides facts.** Free slots come from the availability engine; the database enforces no overlaps. The assistant never invents a time, a slot, a provider, a price or a status.
3. **Least data, least power.** Each agent gets only the tools it needs, scoped by the server to the caller's business and role.
4. **Staff-side only.** There is no public AI chatbot in v1: public text would add abuse, cost and injection risk without being needed for a four-step booking.
5. **Optional.** The business works fully without it. If it fails or is off, nothing else is affected.
6. **Respectful.** Customer messages are polite drafts a person sends.

## A2. Agents

| Agent | Who can use it | Job | Output |
|-------|----------------|-----|--------|
| Booking Assistant | Owner, reception | Turn a pasted or typed customer request into a **draft booking** with real free times to choose from | A draft card (service, provider, customer, chosen slot) or a question with options |
| Message Writer | Owner, reception | Draft a short confirmation, reminder, reschedule or no-show follow-up in the customer's language | Text to copy or share |
| Insights Analyst | Owner | Weekly summary: utilisation, no-show patterns, empty gaps, suggested hours | Short summary with up to 5 suggestions tied to real numbers |

Providers and customers do not use the assistant.

### Booking Assistant details

- Input: one message up to 600 characters. Longer messages are asked to be split.
- **Redaction before the model:** phone numbers are detected and replaced with placeholders by code; the real number is put back into the draft by code. Customer names are passed as data only to match or create a customer.
- **Dates and times are resolved by code, not guessed.** The prompt receives the current date, weekday and time zone; the model returns a structured request (a date or range, a part of the day or a clock time, a flag for the clock system). The server converts it and calls the slot engine.
- **Ambiguity rule:** a clock time without a morning/afternoon/evening word or an "Ethiopian time" marker (for example "3 o'clock") must trigger a question, because it can mean two different hours. The assistant never picks silently.
- It matches the service and provider via search tools; two plausible matches mean a question with options.
- The draft comes from `propose_booking`, which re-checks availability on the server and returns real alternatives if the time is not free.

### Message Writer details

- Facts come from `get_booking_for_message` (business name, service, provider first name, date and time words, status, customer first name). No phone, no price unless the person asks.
- Types: confirmation, reminder (24 hours or 2 hours), reschedule, no-show follow-up. Tone options: friendly, neutral, formal. Under 60 words. No threats, shaming or penalties.
- The message always states the time with its part-of-day word, and the Ethiopian-time form when the business has that display on.
- Drafts only; the app never sends.

### Insights Analyst details

- Report tools only; every number must appear in a tool result (checked in code).
- Suggestions are phrased as observations and options, not orders ("Tuesday mornings are empty; a promotion could fill them").

## A3. Request lifecycle

1. Client calls the Edge Function with the session token and a small, validated body.
2. Function verifies the session, loads the business and role, checks the kill switch, rate limits and budget.
3. Input is cleaned; phone numbers are redacted; untrusted data is wrapped in marked blocks; current date, weekday and time zone are added as trusted context.
4. The model runs with allow-listed tools (at most 6 tool calls, 3 turns).
5. Output passes the pipeline in `guardrails.md` section 4.
6. The client shows a draft card with Confirm and Discard. Confirm calls the normal booking RPC (all rules apply again).

## A4. Failure behaviour

| Situation | Behaviour |
|-----------|-----------|
| Provider down, slow or over budget | Friendly message and the manual screen; nothing blocked |
| Ambiguous request | Question with tappable options |
| Time not free | Real alternatives from the slot engine |
| Output fails validation | One retry, then fallback (template for messages) |
| Injection inside a pasted message | Treated as data; ignored; metric recorded |
| Rate limited | "Too many tries. Please wait a minute." |

## A5. Quality bar

Per-language thresholds in `evals.md`: correct date and time resolution, zero invented slots, zero silent guesses on ambiguous clock times, zero leaked contact data, zero threatening drafts. A language below the bar ships without the assistant.

---

# Part B. Instructions for coding agents

Read in this order before changing anything: `README.md`, `01-prd.md`, `02-technical-requirements.md`, `05-backend-schema.md`, `security.md`, `DESIGN.md`, `04-ui-ux-design-brief.md`.

## B1. Ground rules

1. **No code until the owner says "start building."** One milestone at a time (`06-implementation-plan.md`).
2. **Security first.** No secrets in client code or the bundle. RLS on every table with policies in the same migration. Validate all input. Rate limit every endpoint, including public ones. Never show backend errors.
3. **The database is the judge.** Overlap prevention, slot rules, status machine and reminder generation live in SQL. UI checks are convenience.
4. **Public traffic only through Edge Functions** calling `public_*` functions. `anon` has no table privileges.
5. **One action = one transaction = one RPC.** Idempotent with client-generated ids.
6. **Local first, optimistic UI for staff.** On the booking page only the final Confirm waits for the server.
7. **No spinners.** Skeleton loaders that match the real layout.
8. **Time is hard.** UTC instants, business time zone for slot maths, tests for DST and the Ethiopian-time display; never parse or format dates ad hoc.
9. **Honest reporting.** Say what was verified by a test or run and what was not.

## B2. Commands (to be created in M0)

```bash
npm run dev          # staff app and booking page locally
npm run typecheck    # strict TypeScript
npm test             # unit and property tests (domain)
npm run test:db      # pgTAP against the local Supabase stack
npm run build        # static export, per-page CSP, bundle scan, size budgets
```

## B3. Conventions

- TypeScript strict; pure logic in `domain/` with no framework imports.
- Slot engine: SQL is the authority; the TypeScript copy must pass the same fixtures (parity test).
- Migrations: one file per milestone, forward-only, applied by CI.
- Every new table: RLS, policies, matrix tests for all roles, revoked default privileges, indexes for policy columns.
- Every new RPC: `security definer`, `set search_path = ''`, role check, rate limit, validation, idempotency, event, coded errors.
- Every public function and Edge Function: strict input validation, rate limits per IP and per subject, minimal output, no personal data.
- All user-facing text through message catalogs (English, Amharic, Afaan Oromo); never concatenate sentences; times always with a part-of-day word.
- Commits imperative and scoped; pull requests describe behaviour and tests.

## B4. Design skills for coding agents

Read `DESIGN.md` first for any UI work, then `04-ui-ux-design-brief.md`. These community skills may be installed as extra checks. Commands come from each project's public docs; confirm against the current README and review any skill's contents before trusting it.

| Skill | Use it for | Install (from its docs) |
|-------|-----------|-------------------------|
| Awesome DESIGN.md (VoltAgent) | Reference DESIGN.md files for structure; adapt, do not copy | Clone `github.com/VoltAgent/awesome-design-md` |
| impeccable | Generating and auditing a DESIGN.md; anti-generic design commands | `/plugin install pbakaus-impeccable@pbakaus/impeccable` (Claude Code) |
| Taste Skill | Premium, non-generic frontend; dials: variance 3, motion 2, density 3 (booking page) and 7 (staff calendar) | `npx skills add https://github.com/Leonxlnx/taste-skill` |
| Web Interface Guidelines (`web-design-guidelines`) | Review UI code for accessibility, forms, focus, performance | `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines` |
| UI UX Pro Max | Palette, font pairing and booking-pattern checks | `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max` |

Rules: `DESIGN.md` wins over any skill's default taste; run the Web Interface Guidelines review and an accessibility pass at the end of each UI milestone; ignore suggestions on the "Don't" list; check bundle budgets and licences before adding assets or dependencies.

## B5. Definition of done for a task

Tests written and passing (including property tests for any slot or time logic), RLS and role tests for new data, public endpoint tests for any public change, validation and rate limits in place, skeletons and instant feedback on new screens, strings in all three languages, accessibility check, docs updated, and a plain statement of what was and was not verified.
