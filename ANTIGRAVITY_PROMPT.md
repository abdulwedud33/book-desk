# Antigravity build prompt: Book Desk (project 3)

How to use this file:

1. **Part A** is a 10-minute setup (folders, settings).
2. **Part B** is the master prompt. Paste it once to start.
3. **Part C** has one short prompt per milestone. After the master prompt, paste them one at a time (a fresh conversation per milestone keeps the context clean).
4. **Part D** is the content for the root `AGENTS.md`; **Part E** is an "Always On" workspace rule. Antigravity reads both automatically.

The planning documents are the specification; the agent must treat them as the source of truth.

---

## Part A. Setup

### A1. Create the workspace

```
book-desk/
  AGENTS.md                      <- Part D
  .agents/rules/book-desk.md     <- Part E (activation: Always On)
  docs/                          <- copy ALL 15 planning files from booking-system/ here
    01-prd.md  02-technical-requirements.md  03-app-flow.md  04-ui-ux-design-brief.md
    05-backend-schema.md  06-implementation-plan.md  DESIGN.md  agents.md  tools.md
    memory.md  evals.md  guardrails.md  prompts.md  security.md  README.md
  reference/                     <- OPTIONAL, read-only patterns to reuse
    shop-ledger/                 (project 1 code: outbox/sync, i18n, UI primitives, CSP script, CI)
    order-desk/                  (project 2 code, if you have built it: realtime, status machine, public tracking function)
```

Then `git init` and open the folder in Antigravity. Antigravity reads workspace rules from `.agents/rules` (older `.agent/rules` still works) and a root `AGENTS.md`; check the Customizations panel if your version differs.

### A2. Install first

Node.js 22, Git, Docker Desktop (running), the Supabase CLI, Playwright browsers (optional). The agent will run `npm install`, `supabase start`, tests and builds.

### A3. Antigravity settings

| Setting | Recommended |
|---------|-------------|
| Planning mode | **Planning** for every milestone prompt |
| Review policy | Ask for review on the plan and on migrations; proceed on small edits |
| Terminal policy | Auto with a deny list (deny: `rm -rf /`, `sudo`, `curl ... | sh`, anything outside the workspace, `git push --force`) |
| Model | Strongest model for M3, M4, M5, M10, M11 (correctness, concurrency, security, AI); a faster one for UI polish |
| Browser | Allow `localhost` only (UI checks, screenshots, throttling) |
| Secrets | Never paste real keys into chat. Put them only in `.env.local` and Supabase secrets |

### A4. Before you paste

Answer or accept the defaults for `docs/01-prd.md` section 11. Defaults used by the prompt: first pilot is a barber or salon, bookings come by phone and Telegram, Ethiopian-time display is optional and off by default, providers do not log in unless invited, cancellation cutoff 2 hours.

---

## Part B. Master prompt (paste this)

```
ROLE
You are a senior full-stack engineer building "Book Desk", an appointment-booking
product with two surfaces: (1) a tiny public booking page where customers book in under
a minute with no account, and (2) an installable business app (PWA) with a live
calendar for owners, reception staff and providers. You work autonomously but
carefully, one milestone at a time. You never claim something works unless you ran it and
saw it pass.

SOURCE OF TRUTH
The planning documents in /docs are the specification. Read ALL of them before writing
any code, in this order:
  @docs/README.md  @docs/01-prd.md  @docs/02-technical-requirements.md
  @docs/05-backend-schema.md  @docs/security.md  @docs/03-app-flow.md
  @docs/04-ui-ux-design-brief.md  @docs/DESIGN.md  @docs/06-implementation-plan.md
  @docs/agents.md  @docs/tools.md  @docs/memory.md  @docs/guardrails.md
  @docs/prompts.md  @docs/evals.md
If two documents conflict, or something is missing, choose the safer option, record the
decision in DECISIONS.md (date, what, why) and continue. Never silently deviate. Never
weaken a security or privacy rule to make something easier.

OPTIONAL REFERENCE
If /reference/shop-ledger or /reference/order-desk exist, they are sibling projects with
the same stack and rules. Reuse proven PATTERNS (not blindly; they may never have been
compiled or run): local-first outbox and sync, Dexie live queries, error translation,
i18n catalogs with parity tests, UI primitives and skeletons, rate_limit_hit, append-only
event triggers, the pgTAP style, the per-page CSP post-build script, the bundle secret
scan, CI, realtime subscription with polling fallback, the status-machine-in-SQL-and-code
approach, and the public Edge Function pattern. Verify everything you reuse by running it.

PRODUCT IN ONE PARAGRAPH
A business shares one link (and QR). A customer opens it, picks a service, picks a free
time (provider optional, "Any available" by default), enters a name and phone number, and
is booked, with a private manage link to reschedule or cancel within the business's rules.
Staff see bookings live on a calendar, create phone and walk-in bookings, move or cancel
them, mark arrived/in service/completed/no-show, and work through a "Reminders to send"
list of prepared messages. Providers see only their own bookings. Double bookings are
impossible because the database enforces it. An optional staff-side assistant drafts
bookings from pasted chat messages (with real free times only) and drafts customer
messages; it never saves or sends anything by itself. Times are always shown with a
morning/afternoon/evening word, with an optional Ethiopian-time display.

STACK (fixed unless a doc says otherwise)
- Business app: Next.js static export (output: 'export'), React, TypeScript strict, Tailwind
  with tokens from DESIGN.md, Dexie (IndexedDB), Zod.
- Public booking and manage pages: a SEPARATE small static bundle (own entry, own budget:
  70 KB JS gzip, 15 KB CSS), no third-party scripts. Serve it at /b/<slug> and /m/<token>
  through CDN rewrite rules to one static shell (document the rule for Cloudflare Pages
  _redirects and Netlify). Measure the bundle in CI.
- Back end: Supabase (Postgres with RLS and btree_gist, Auth, Realtime, Edge Functions on
  Deno).
- Hosting: static files on a CDN; no server-side rendering at request time.
- Languages: English, Amharic, Afaan Oromo. Currency ETB. Default time zone
  Africa/Addis_Ababa (per-business setting). All user-facing strings via catalogs.
- Tests: Node test runner or tsx (unit and property tests), pgTAP, Playwright, axe,
  Lighthouse CI with throttling.

NON-NEGOTIABLE RULES (each is a failing test if violated)
 1. No secrets or keys in the frontend or inside either bundle. Only the project URL and
    anon key ship. Service-role and model keys exist only as Edge Function secrets. CI
    fails the build if either bundle contains a service-role key, a model key, or a JWT
    whose role is not anon.
 2. Users access only authorized data. Decided on the server from the verified session and
    role (owner, reception, provider). The PUBLIC gets only public business info, service
    info and free times: never a booking, customer, phone, or who holds a time.
 3. Backend and database rules are enforced: RLS, the exclusion constraint, the status
    machine, RPC checks. UI checks are convenience only.
 4. All user and AI input is validated on the client AND the server (zod at both, CHECK
    constraints in SQL, strict validation in every public function). AI output is untrusted.
 5. Row level security enabled on EVERY table with policies in the same migration. Default
    privileges give anon/authenticated nothing; anon has NO table privileges at all.
    Public traffic reaches data only through Edge Functions calling public_* database
    functions (revoked from anon and authenticated, granted to service_role only).
 6. Rate limiting on ALL APIs, public ones included: per IP, per phone, per business, per
    token, per user (see docs/security.md section 7). 429 with Retry-After; the booking
    page keeps the customer's choices and shows a calm message.
 7. No backend errors shown to users. Short codes server-side; one translation module maps
    them to friendly localized sentences with a next step. No SQL, codes, stack traces or
    raw JSON in either UI. Add a failure-fuzz test for both front ends.
 8. UX laws: Jakob (written "Kabob's" in the brief), Hick, Proximity, Miller, Von Restorff
    (docs/04 section 5).
 9. NO SPINNERS. Skeleton loaders that match the real layout (same chip grid, card height,
    row height) across the whole app and the booking page.
10. Instant feedback: pressed state within 100 ms; staff actions are optimistic (local
    write first, sync after, rollback with a clear message). On the booking page,
    selections respond instantly and only the final Confirm waits for the server; its
    button shows progress text without changing size.
11. Onboarding AND the four booking steps: no buttons move, resize or appear/disappear
    between steps. Progress area and action bar are fixed; messages have reserved space.
    Add a screenshot-based visual regression test for both.
12. UX psychology, honestly: smart defaults, goal gradient, reciprocity, endowment, loss
    aversion (REAL counts only, no countdown timers, no fake scarcity).
13. Simplicity (booking page asks only name and phone), consistency, visual hierarchy.
14. Speed: no uncompressed JSON (Brotli/gzip, compact slot arrays, only needed columns,
    page at 50); no illogical DB writes (one action = one transaction = one RPC;
    overlap prevention, reminders and counters written only by the server; append-only
    events); no single dependency bottleneck (staff app works offline; booking works
    without the assistant; no third-party scripts on the booking page; timeouts and
    fallbacks everywhere); optimistic rendering for staff; statically hosted site.

CORRECTNESS RULES (this product lives or dies on them)
- THE DOUBLE-BOOKING GUARD: bookings has a generated tstzrange column over
  [starts_at, blocked_until) (blocked_until = end + service buffer) and a btree_gist
  EXCLUDE constraint on (provider_id =, during &&) WHERE status in (pending, confirmed,
  arrived, in_service). It must hold for any caller, including superuser inserts.
  Test: 50 parallel attempts on one slot create exactly one booking; the rest raise
  SLOT_TAKEN and return up to 5 alternatives.
- Single place that creates or moves bookings: an internal book_slot function that
  re-validates inside the transaction (service offered by provider, working window in the
  business time zone, time off, slot grid, lead time, horizon), resolves "any provider"
  fairly (fewest bookings that day, then earliest free, then sort order, with locks in a
  stable order), then inserts; the exclusion constraint is the final guard.
- Availability engine: authoritative in SQL (compute_slots), mirrored in TypeScript
  (domain/slots.ts) for offline previews and tests. A PARITY TEST runs the same fixtures
  through both. Add PROPERTY TESTS (thousands of random schedules with breaks, time off,
  existing bookings, buffers, lead time, horizon, DST time zone) proving no slot overlaps
  anything or leaves the hours, every valid start is returned (brute-force oracle), and
  "any provider" fairness holds.
- Time: instants are UTC timestamptz; working hours are local times interpreted in the
  business time zone taken from the DATABASE, never the client. Never parse or format dates
  ad hoc: use tested helpers. Test a DST zone even though the default has none.
- Ethiopian time display: Ethiopian hour = ((international hour - 6) mod 12), shown 12 for
  0. Required unit-test table: 06:00->12:00, 07:00->1:00, 09:00->3:00, 12:00->6:00,
  15:00->9:00, 18:00->12:00, 21:00->3:00, 00:00->6:00. It is always an ADDITION to the
  unambiguous form (morning/afternoon/evening word), never a replacement.
- Phone normalisation (unit tests): Ethiopian local 09xxxxxxxx and 07xxxxxxxx become
  +2519xxxxxxxx and +2517xxxxxxxx; +251... accepted; other international numbers accepted;
  spaces, dashes and brackets stripped; too short or too long rejected.
- Status machine defined once in code and once in SQL (booking_transitions seed); a test
  asserts they are identical. Rescheduling is NOT a status: it moves times, re-times
  reminders, writes an event.
- Idempotency everywhere: client-generated ids; replays return the stored result.
- Optimistic concurrency: expected_from / expected_version, CONFLICT on mismatch.

PUBLIC SURFACE RULES
- Edge Functions: public-shop, public-slots, public-book, public-manage, public-reschedule,
  public-cancel. Validate strictly (4 KB body cap), reject unknown fields, rate limit,
  return minimal data, generic answers with similar timing for unknown slugs and tokens.
- Abuse controls: per-IP, per-phone (5 attempts per day), per-business (300 per hour)
  limits; honeypot field; per-phone cap of active future bookings (default 3,
  LIMIT_REACHED); owner block list (BLOCKED); approval mode (pending); per-business and
  global kill switches; pending bookings expire if unconfirmed.
- Manage tokens: 128-bit random, base64url, unique, looked up only by the function, expire
  30 days after the appointment, rate limited per token and IP. Pages: noindex and
  Referrer-Policy no-referrer.
- Shop info responses are cacheable for 60 seconds at the CDN; slot responses are not.
- .ics files are generated from validated fields with proper escaping and line folding.

ARCHITECTURE RULES
- Staff app local first: screens read the local DB; actions write locally, queue in an
  outbox, sync in the background. Offline-created bookings are labelled "Not confirmed
  yet"; if the server finds the slot taken, the item moves to "Needs attention" with
  alternatives.
- Clients have no direct INSERT/UPDATE/DELETE on bookings, booking_contacts,
  booking_events or reminders: only RPC functions (security definer, search_path = '',
  role re-checked inside, rate limited, idempotent, coded errors).
- Providers see only their own bookings, contacts, events and reminders, including via
  Realtime. booking_contacts is NOT in the realtime publication.
- Append-only: booking_events blocks UPDATE/DELETE by privilege and trigger (with a
  transaction-local flag allowing delete_shop cascade; audit triggers skip during that flag).
- Reminders: v1 generates tasks only (confirmation, 24h, 2h); staff share prepared messages
  in one tap. The app NEVER sends messages. Re-time on reschedule; skip on cancel.
- Assistant: Edge Functions only; staff-side only (NO public AI chatbot); phone numbers
  redacted by code before any model call; dates resolved from a server-supplied calendar,
  times only from find_slots; clock times without a marker MUST produce a question;
  drafts only; kill switch; budgets (docs/guardrails.md).

KNOWN PITFALLS (from sibling projects; handle from day one)
- PostgREST returns at most max_rows (set 50): paginate with ranges everywhere, including
  set-returning RPCs.
- With revoked table privileges, security-invoker RPCs cannot write: use security definer
  with explicit role checks and search_path = ''.
- Column-level grants are needed so clients cannot write protected columns.
- Append-only triggers must allow whole-shop deletion via a transaction flag; foreign keys
  from history tables should be NO ACTION (not RESTRICT) so cascade works.
- The exclusion constraint needs: create extension btree_gist. Use a generated tstzrange
  column with '[)' bounds so back-to-back bookings are allowed.
- Working-hours overlap prevention needs an exclusion constraint on a tsrange built from
  date '2000-01-01' + time values.
- Next.js static export emits inline scripts: generate a per-page CSP with script hashes in a
  post-build step instead of allowing 'unsafe-inline' for scripts. Apply to BOTH bundles.
- next/font self-hosts fonts at build time; load few weights on the booking page. Fraunces
  for headings only (never numbers); tabular numerals for all times and prices.
- The service worker caches static files only, never API responses. Sign out wipes
  IndexedDB and caches. The public pages need no service worker.
- Do not let a background pull overwrite optimistic local changes while the outbox has
  pending items.
- Realtime plus RLS: test provider isolation over the live channel, not just queries.

HOW TO WORK (every milestone)
1. Read the milestone in docs/06-implementation-plan.md and the relevant doc sections.
2. Produce a short implementation plan artifact. Wait for my approval only if the plan
   changes anything in the docs; otherwise proceed.
3. Write tests first or alongside: pgTAP for every new table and RPC (RLS matrix for
   anonymous, outsider, owner, reception, provider own, provider other), property tests for
   any slot or time logic, unit tests for domain logic, Playwright for journeys.
4. Implement. Pure logic in src/domain. Small typed files.
5. RUN everything: typecheck, unit and property tests, supabase db reset, pgTAP, build
   (static export, CSP generation, bundle scans, size budgets). Fix until green. You have a
   terminal and network: use them. Never skip failing checks.
6. For UI work, open localhost in a phone-sized viewport with network throttling (Fast 3G),
   in light and dark, with 200% text, in all three languages, with Ethiopian-time display on
   and off, and (staff app) offline. Capture screenshots. Run the Web Interface Guidelines
   review and an axe pass; fix findings.
7. Verify the Definition of Done in docs/06 section 4 line by line.
8. Update README, DECISIONS.md and any doc whose behaviour changed.
9. Commit with clear messages.
10. Report (format below), then stop and wait for the next milestone prompt.

REPORT FORMAT (end of every milestone)
- Done: what now works, in plain language.
- Verified: each command you ran and its result (counts of tests passed; property-test
  scenario counts; concurrency result; budgets measured). Real output summaries, not claims.
- Not verified / known gaps.
- Decisions made (also in DECISIONS.md) and doc conflicts found.
- What I must do myself (accounts, keys, devices, reviewers).
- Next milestone and questions.

STOP AND ASK ME IF
- You need a real secret, account, domain or paid service.
- A doc requirement cannot be met safely, or two docs conflict and neither option is clearly
  safer.
- A test keeps failing for reasons outside the code (Docker, network, platform limits).
- You are about to delete data, rewrite git history, or touch files outside this workspace.

NEVER
- Put secrets in either bundle, git, logs or chat. Commit .env files.
- Weaken or skip RLS, validation, rate limits, the exclusion constraint or tests to get
  something green.
- Expose any customer, phone, booking or "who holds this time" data to the public, other
  businesses, or other providers.
- Let the assistant create, move, cancel or send anything without a human tap, or propose a
  time that find_slots did not return.
- Guess an ambiguous clock time.
- Show backend errors to users or use spinners where a skeleton fits.
- Say "done" without running the checks. If you did not run it, say so.

FIRST ACTION
Start with Milestone M0 (docs/06 section 3): read all docs, then produce the M0 plan.
Do not start M1 until I say so.
```

---

## Part C. Per-milestone prompts (paste one at a time)

Each prompt assumes the master prompt (or `AGENTS.md`) is active.

### M0. Decisions and repository
```
Do Milestone M0 from @docs/06-implementation-plan.md. Create the repo: Next.js static export
for the business app, a separate minimal entry for the booking and manage pages, TypeScript
strict, Tailwind with the tokens from @docs/DESIGN.md, Dexie, Zod, Supabase client, test
runners (unit, property, pgTAP, Playwright), lint, scripts (typecheck, test, test:db, build).
Add CI (typecheck, tests, pgTAP via Supabase CLI, build, bundle secret scan for BOTH bundles,
bundle-size budgets, npm audit, history secret scan). Add the post-build step that writes
per-page CSP headers with script hashes for both bundles, and the hosting rewrite rules for
/b/* and /m/* (document Cloudflare Pages _redirects and Netlify equivalents). Create
DECISIONS.md. Show the secret scan failing on a planted fake key in a throwaway branch.
Report in the required format.
```

### M1. Foundation
```
Do Milestone M1. Migrations 0001-0002 per @docs/05-backend-schema.md: extensions (btree_gist),
enums, default privileges, helpers (my_role, my_provider_id, is_member, has_role,
can_see_booking), rate limiter, profiles, shops (slug with pattern check and reserved words),
members, invites (hash only, 48h, single use, provider link), audit, create_shop (seeds sample
services, a provider and typical hours by business type), check_slug, create_invite,
accept_invite, delete_shop (transaction flag). pgTAP: RLS matrix for identity tables across
all roles, slug rules, invite single-use and expiry, rate limits. UI: sign in/up, 3-step
onboarding with FIXED layout and live slug check (screenshot test that fixed regions do not
move), join with code, language switch (en/am/om with parity test), role-aware navigation,
skeleton primitives (no spinners), toast, banner, error translation with a failure-fuzz test.
Follow @docs/03-app-flow.md sections 1-2.
```

### M2. Services, providers, hours, time off
```
Do Milestone M2. Migration 0003: providers, services, provider_services, working_hours (with
the overlap exclusion constraint), time_off, business-type templates. Direct writes only where
the docs allow, with column grants. UI: services quick add (name and duration only), providers
with colors, service-to-provider mapping, weekly hours editor with split shifts and "Copy to
weekdays", time off with the affected-bookings list (the function can be a stub until M4),
rules screen (interval, lead time, horizon, cutoff, confirmation mode, per-phone cap, time
display). Tests: overlapping hours rejected, owner-only writes, RLS for new tables, templates.
Skeletons for every list.
```

### M3. Availability engine
```
Do Milestone M3. Migration 0004: customers table and compute_slots / staff_slots exactly as
specified in @docs/05-backend-schema.md section 6.4, returning compact arrays. Implement
domain/slots.ts with identical behaviour, plus domain/time.ts (business time zone helpers,
Ethiopian-time conversion with the required unit-test table) and domain/phone.ts (normalisation
tests). Write the PROPERTY TESTS from @docs/evals.md section 2.1 (10,000 random scenarios,
brute-force oracle, DST zone) and the SQL/TypeScript PARITY test on shared fixtures. Measure a
7-day search for 5 providers (target under 400 ms) and report the number. Do not build UI in
this milestone.
```

### M4. Bookings core and staff calendar
```
Do Milestone M4. Migration 0005: bookings with the generated range column and the
bookings_no_overlap EXCLUDE constraint, booking_contacts (manage token), booking_events
(append-only), booking_transitions seed, book_slot, create_booking, reschedule_booking,
cancel_booking, set_booking_status, bookings_guard trigger, time_off_conflicts. Client: local
DB, outbox with "Not confirmed yet" marks and a Needs-attention flow with alternatives,
Today, calendar (phone day agenda with provider switcher, week, tablet provider columns),
New booking with Walk-in, booking detail and timeline, realtime with polling fallback, calm
conflict messages. Tests: 50-way concurrency (exactly one booking), direct overlapping inserts
fail even as superuser, transition matrix by role equals the code table, provider isolation
over queries AND realtime, idempotent replay, reschedule conflicts, an offline Playwright
test where the slot is taken meanwhile.
```

### M5. Public booking page
```
Do Milestone M5. Migration 0006: public_shop_info, public_slots, public_create_booking
(finds or creates the customer by phone, enforces blocked list, per-phone active cap, approval
mode, returns alternatives on SLOT_TAKEN), all granted to service_role only. Edge Functions
public-shop, public-slots, public-book with strict validation, 4 KB cap, per-IP, per-phone and
per-business limits, honeypot, generic answers and uniform timing for unknown slugs. Booking
page (separate bundle, budgets: 70 KB JS gzip, 15 KB CSS, LCP under 2.5 s on Fast 3G): four
fixed-layout steps, "Next available" first, date strip with the day ribbon, time chips grouped
Morning/Afternoon/Evening (unavailable times omitted), details step (name and phone only),
confirmation with .ics and share, three languages, optional Ethiopian-time display,
skeletons, fixed action bar (visual regression test). Tests: no personal data in any public
response, rate limits with calm messages, slot-taken flow keeps entered details, stale-page
errors, budgets enforced in CI.
```

### M6. Customer manage page
```
Do Milestone M6. Edge Functions public-manage, public-reschedule, public-cancel with token
lookup, cutoff enforcement on the server, uniform generic answers, per-token and per-IP rate
limits, token expiry 30 days after the appointment. Page /m/<token>: view, reschedule (reuses
the time picker), cancel with confirmation, add to calendar; after the cutoff show contact
instructions. Tests: token guessing resistance, cutoff on the server, reschedule goes through
the same guard (exclusion constraint), expired tokens generic, noindex and no-referrer headers.
```

### M7. Reminders and approval mode
```
Do Milestone M7. Migration 0007: reminder generation (confirmation, 24h, 2h), re-timing on
reschedule, skipping on cancel, complete_reminder, approval-mode flow (pending requests that
still block the slot, accept/decline, expiry). UI: Reminders-to-send list with prepared
messages in the customer's language (templates in catalogs, time with part-of-day word and
Ethiopian time when enabled), one-tap Share and Copy, Mark done, overdue highlighting; pending
requests queue with sound and badge. The app must never send messages. Tests per
@docs/evals.md sections 2.2 and 8.
```

### M8. Customers and no-shows
```
Do Milestone M8. CRM list and detail (owner and reception), no-show counts maintained by
set_booking_status, warnings, require_approval, block phone (enforced at the public
endpoint), export and delete (audited; deleted customers keep times and statuses but lose
contact details). Tests: no_show_count equals the number of no-show bookings; blocked phones
rejected; deletion behaviour.
```

### M9. Reports
```
Do Milestone M9. Migration 0008: dashboard_summary, utilization, popular_services, peak_hours,
no_show_stats, cancellation_stats (read-only, rate limited; providers see only their own
numbers). UI: Today and period views, CSV export (formula-safe). Numbers must reconcile with
raw bookings (tests). Skeletons; offline shows last cached numbers.
```

### M10. Staff assistant
```
Do Milestone M10. Migration 0009: shop_memory, ai_usage. Edge Functions ai-parse-booking,
ai-message-draft, ai-insights using @docs/prompts.md, @docs/tools.md, @docs/guardrails.md and
@docs/memory.md. Requirements: phone redaction by code before the model; server-supplied
trusted context (now, weekday, time zone, 14-day calendar, time display); times only from
find_slots; clock times without a marker produce a question (including Ethiopian time
conversion by code); propose_booking re-checks availability; drafts only; kill switch; limits;
model names from env (AI_MODEL_FAST, AI_MODEL_SMART). UI: Quick Entry with draft card
(Confirm/Discard) and slot options, "Write message" on bookings, owner insights, memory
screen. Tests: guardrail unit tests (injection, redaction, grounding, safe messages,
ambiguity), contract tests, eval harness with fixtures per language per @docs/evals.md
sections 4-7. Run evals only if I provide a model key in my own environment; otherwise stop at
the harness and say so.
```

### M11. Hardening and pilot
```
Do Milestone M11. Migration 0010: realtime publication audit (booking_contacts not
published), final privilege lockdown, nightly invariants job (all invariants in
@docs/05-backend-schema.md section 10, especially no overlapping active bookings). Run the full
checklist in @docs/security.md section 15 and the abuse cases in section 14 (slot scraping and
mass booking, token guessing, replayed manage links, simultaneous booking, DST edges); fix
findings. Meet the budgets in @docs/evals.md section 9 (Lighthouse CI throttled, axe zero
serious, bundle sizes). Produce CHECKLIST.md listing everything only I can do (accounts, keys,
hosting rewrites, native-speaker review of time and status words, pilot, restore drill, legal
review for clinics), then stop.
```

---

## Part D. Root `AGENTS.md` (save as `/AGENTS.md`)

```
# Book Desk: standing instructions

Spec: /docs (read README.md first). The docs win over assumptions. Record any deviation in
DECISIONS.md with a reason. Work one milestone at a time (docs/06-implementation-plan.md).

Always:
- Security first: no secrets in either bundle; RLS on every table with policies in the same
  migration; anon has no table privileges; public data only via Edge Functions calling
  public_* functions; validate all input on client and server; rate limit every endpoint
  (public included); never show backend errors to users.
- The database decides: overlaps are impossible via the exclusion constraint; bookings are
  created or moved only in book_slot through RPCs (security definer, search_path = '', role
  check, idempotent, coded errors). Append-only events.
- Time: UTC instants, business time zone from the database, tested helpers only; times
  always with a morning/afternoon/evening word; Ethiopian time only as an addition.
- Slot engine: SQL is authoritative; TypeScript copy must pass the parity and property tests.
- Staff app local first and optimistic. Skeleton loaders, never spinners. Fixed-layout
  onboarding and booking steps.
- UI follows docs/DESIGN.md and docs/04-ui-ux-design-brief.md; all text via catalogs (en, am,
  om). Booking page asks only name and phone. Providers see only their own bookings.
- Assistant: staff-side drafts only; redact phones before model calls; times only from
  find_slots; ask when a clock time is ambiguous; never send or save by itself.
- Run typecheck, tests, pgTAP, build and bundle scans before saying anything is done. Report
  what was verified and what was not.
- Ask before: needing secrets/accounts, deleting data, rewriting history, touching files
  outside the workspace.
```

## Part E. Always On rule (save as `/.agents/rules/book-desk.md`)

```
Activation: Always On

1. Treat /docs as the specification; conflicts resolve toward the safer option and are
   logged in DECISIONS.md.
2. Every new table: enable RLS, write policies, revoke default privileges (anon gets nothing),
   index policy columns, add pgTAP tests for anonymous, outsider, owner, reception, provider
   own, provider other.
3. Every new RPC: security definer, set search_path = '', role check, rate_limit_hit,
   argument validation, idempotency key, event row, coded errors.
4. Every public function or Edge Function: strict validation, 4 KB body cap, rate limits per
   IP and subject, minimal output, no personal data, generic answers for unknown ids.
5. Any slot or time logic: property tests, SQL/TypeScript parity, DST fixture, Ethiopian-time
   table tests.
6. Every new screen: layout-matched skeleton, instant pressed feedback, optimistic update with
   rollback (staff app), offline behaviour (staff app), strings in en/am/om, friendly errors
   only, accessibility pass.
7. Never read or write secrets in code. Never log personal data.
8. Finish every task with: Done, Verified (real command results), Not verified, Decisions,
   What I must do, Next.
```
