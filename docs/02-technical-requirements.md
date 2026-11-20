# 02. Technical Requirements Document

**Product:** Book Desk (working title). **Status:** Draft v0.1.
**Reads with:** `01-prd.md`, `05-backend-schema.md`, `security.md`, `06-implementation-plan.md`.

---

## 1. Architecture at a glance

```
Customers (any phone)                         Business team (installable PWA)
  Public booking page  --(HTTPS)-->  Edge Functions        Staff app <-> Local DB (IndexedDB) <-> Sync engine
  (tiny static page)                 public-shop, public-slots,                        |
                                     public-book, public-manage         ------------- | HTTPS, compressed JSON
                                            |                                          v
                                            +--> Supabase Postgres (RLS, exclusion constraint, RPC) + Realtime + Auth
Static hosting + CDN: HTML, JS, CSS, fonts, icons (rewrite /b/* to the booking page shell)
```

- **Two static front ends:** the business app and the public booking page (separate bundle, separate budget).
- **Public traffic goes through Edge Functions only.** The booking page never reads or writes tables directly; anonymous users have no database privileges.
- **The database is the judge.** Slot rules, overlap prevention, status changes, reminder tasks and counters live in SQL.
- **Local first for staff.** Calendar reads come from the local cache; actions are queued and synced.
- **Realtime** keeps every staff device fresh; polling is the fallback.

## 2. Technology choices

| Layer | Choice | Reason |
|-------|--------|--------|
| Staff app | React with Next.js static export, TypeScript strict, Tailwind with `DESIGN.md` tokens | Known stack; static hosting rule |
| Booking page | Separate minimal static page (React or lighter), same tokens, own bundle | Speed on slow phones |
| Local data | IndexedDB via Dexie | Offline calendar, outbox |
| Server | Supabase Postgres (RLS, `btree_gist` exclusion constraints), Auth, Realtime, Edge Functions | Overlap prevention in the database |
| Validation | Zod on client and Edge Functions; SQL constraints as the last line | One source of truth |
| Dates | `Intl` plus a small tested date library or in-house helpers; all instants stored as UTC `timestamptz`; business time zone used for slot generation | Avoid time zone bugs |
| Assistant | Model API from Edge Functions only | Keys never in the browser |
| Hosting | Static host with CDN; generated per-page CSP; rewrite rule for `/b/*` | Static hosting rule |
| Tests | Node test runner, pgTAP, Playwright, axe, Lighthouse CI | See section 11 |

## 3. Code structure

```
src/
  app/              staff routes: today, calendar, new booking, booking detail, customers, services, team, reminders, reports, more, sync
  components/       primitives, calendar grid, slot chips, booking card, skeletons
  domain/           pure logic: slots, overlap math, status machine, reminders, time display (incl. Ethiopian time), phone normalisation, search, csv, outbox, i18n
  lib/              api wrappers, db (Dexie), sync, realtime, session, error translation
  i18n/             en, am, om
booking-page/       separate entry: public booking and manage pages (tiny bundle)
supabase/
  migrations/       SQL per milestone
  functions/        public-*, ai-*, reminders-cron
  tests/            pgTAP
```

`domain/` has no network or React imports and is unit tested. The slot engine exists **once in SQL** (the authority) and **once in `domain/` for offline previews and tests**; a parity test runs the same fixtures through both.

## 4. Core flows

### 4.1 Public booking

1. Page loads `public-shop(slug)`: business name, active services, providers, rules, time zone. Cacheable for 60 seconds at the CDN.
2. Customer picks a service. The page calls `public-slots(slug, service, provider|any, from, to)` for 7 days at a time; the response is a compact list of start times per day.
3. Customer picks a time, enters name and phone (honeypot field hidden), taps Confirm.
4. `public-book(...)` validates input, rate limits, finds or creates the customer by phone, and calls the database function `book_slot` in **one transaction**: re-check availability, choose provider if "any", insert booking (the exclusion constraint is the final guard), create reminder tasks, insert events, return a manage token.
5. On `SLOT_TAKEN` the response includes up to 5 nearby alternatives; the page shows them without losing the entered details.
6. The confirmation page shows the booking and manage link. Staff devices receive the booking through Realtime.

### 4.2 Staff creates or changes a booking (offline safe)

1. The form builds the request with a client UUID. One local transaction saves it with a "Not confirmed yet" mark and queues it.
2. The sync engine calls the RPC (`create_booking`, `reschedule_booking`, `cancel_booking`, `set_booking_status`). The server validates role, availability and transitions.
3. Success replaces the local mark with the real state. `SLOT_TAKEN` or `INVALID_TRANSITION` moves the item to "Needs attention" with alternatives and a plain message.
4. Replays with the same UUID return the stored booking unchanged.

### 4.3 Customer reschedule or cancel

`public-manage(token)` shows the booking. `public-reschedule` and `public-cancel` check the token, the business cutoff and availability on the server, then write through the same RPC functions with a customer actor. Tokens are rate limited per IP and per token.

### 4.4 Reminders

A database function creates tasks when a booking is confirmed or moved. A scheduled job marks tasks overdue and prepares the staff list. In v1 nothing is sent by the app: the list shows prepared messages; staff share or copy and mark done. v1.1 adds a Telegram worker for customers who opt in via a deep link.

### 4.5 Availability engine

Inputs: provider schedule (weekly hours with breaks), time off (business and provider), existing active bookings (including buffers), service duration and buffer, slot interval, lead time, horizon, business time zone, `now`.
Algorithm (in SQL, set-based): for each date in range, build free windows = working windows minus time off minus occupied ranges; generate candidate starts on the slot grid where `[start, start + duration)` fits inside a free window and `start >= now + lead` and `start <= now + horizon`; the buffer after the service must not overlap the next booking. "Any provider" returns the union of providers' slots with a fairness-chosen provider for each start. Output is a compact array of starts per day.

## 5. Status machine (single source of truth)

Defined in `domain/status.ts` and mirrored in SQL (`booking_transitions`); a test asserts both agree.

| From | To | Who |
|------|----|-----|
| pending | confirmed, cancelled (declined) | owner, reception |
| confirmed | arrived, in_service, completed, no_show, cancelled | owner, reception; provider for own bookings (arrived, in_service, completed, no_show); customer: cancelled (before cutoff) |
| arrived | in_service, completed, cancelled | owner, reception, provider (own) |
| in_service | completed | owner, reception, provider (own) |
| completed, cancelled, no_show | none | final |

Rescheduling is not a status: it changes the time of a pending or confirmed booking and writes an event; reminders are re-timed. A booking cannot move to a time that conflicts; the exclusion constraint decides.

## 6. Performance and speed rules

| Rule | How it is met |
|------|---------------|
| No uncompressed JSON | CDN and functions use Brotli or gzip; slot responses are compact arrays (start offsets), not objects per slot; list calls paged at 50 |
| No illogical DB writes | One action is one RPC and one transaction. Overlap prevention, reminder tasks, counters and status changes are written only by the server. No client loops of dependent writes. Append-only timelines |
| No single dependency bottleneck | Staff app works offline; the booking page works without the assistant; assistant failure never blocks booking; no third-party scripts on the booking page; timeouts and fallbacks on external calls; reminders do not depend on a messaging provider in v1 |
| No un-optimistic rendering | Staff taps update the screen first and reconcile after; on the booking page selections respond instantly and only the final Confirm waits for the server, with the button showing progress text without changing size |
| No non-statically hosted site | Both front ends are static files on a CDN; `/b/*` uses a rewrite to the static booking shell; no server-side rendering at request time |

Budgets (CI, throttled mobile profile):

| Metric | Budget |
|--------|--------|
| Booking page JS (gzip) | 70 KB; CSS 15 KB |
| Booking page LCP / interactive slots | under 2.5 s on Fast 3G |
| Staff app JS on first load (gzip) | 170 KB |
| Interaction to Next Paint | under 200 ms |
| Calendar render with 200 bookings in view | under 100 ms |
| `public-slots` (7 days, 5 providers) | under 400 ms server time |

## 7. Security requirements (summary; full rules in `security.md`)

1. **No secrets or keys in the frontend or inside the app.** Only the public URL and anon key; model and service keys live in server secrets.
2. **Users access only authorized data**: decided on the server from session and role; providers only their own bookings; the public gets only public business info and slot times.
3. **Backend and database rules are enforced**: RLS, exclusion constraint, status machine, RPC checks.
4. **All user and AI input is validated** on the client and again on the server, then constrained in the database.
5. **RLS on every table, policies written in the same migration.**
6. **Rate limiting on all APIs**, including every public endpoint (per IP, per phone, per business, per token).
7. **No backend errors shown to users.**

## 8. Error handling

- Codes: `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `SLOT_TAKEN`, `OUTSIDE_HOURS`, `TOO_SOON`, `TOO_FAR`, `INVALID_TRANSITION`, `CUTOFF_PASSED`, `LIMIT_REACHED`, `BLOCKED`, `RATE_LIMITED`, `SESSION_EXPIRED`, `OFFLINE`, `AI_UNAVAILABLE`, `UNKNOWN`.
- One translation module maps codes to localized sentences with a next step (for example `SLOT_TAKEN`: "Someone just booked that time. Here are the closest free times.").
- Booking page errors keep the customer's entered details and offer retry. No SQL, codes, stack traces or raw JSON ever shown.
- Details go to logs with a request id and no personal data.

## 9. Time handling (important)

- Store instants as UTC `timestamptz`. Store working hours as local times with the business time zone.
- All slot maths runs in the business time zone; the booking page shows times in the business time zone with a label.
- Display: 12-hour with "morning/afternoon/evening" words by default; optional **Ethiopian-time display** (clock shifted by 6 hours, for example 8:00 morning international = 2:00 in Ethiopian time) shown alongside, never instead of the unambiguous form, until pilot users confirm preference.
- Ethiopian calendar date display is a v1.1 candidate; v1 uses Gregorian dates with weekday names in the chosen language.
- Daylight saving: the default time zone has none, but code and tests handle it generally.

## 10. Localization and formats

English, Amharic (Ge'ez script), Afaan Oromo (Latin). Message catalogs lazy loaded; booking page loads only the chosen language. Phone normalisation for Ethiopian local formats (leading 09 or 07) and international numbers. ETB with two decimals. Native speakers review time and status words before launch.

## 11. Testing strategy

| Layer | Tool | What |
|-------|------|------|
| Domain | Node test runner | Slot maths, status machine, time display, phone normalisation, reminder timing, outbox, search, CSV, i18n completeness |
| Database | pgTAP | RLS matrix (anonymous, outsider, owner, reception, provider own, provider other); exclusion constraint; `book_slot` concurrency; transitions; idempotency; invariants; slot engine property tests and parity with domain code |
| Edge Functions | Node and contract tests | Validation, rate limits, honeypot, per-phone cap, no personal data in public responses, token behaviour |
| UI flows | Playwright | Public booking end to end, conflict path, manage page, staff offline queue, provider view, onboarding fixed layout |
| Accessibility | axe plus manual | Booking page and staff app |
| Performance | Lighthouse CI throttled | Budgets above |
| AI | Eval suite (`evals.md`) | Date parsing, ambiguity, grounding, redaction |

## 12. Environments and delivery

Local (Supabase CLI), staging, production. CI per pull request: typecheck, unit tests, pgTAP, build, bundle secret scan, dependency audit, history secret scan, bundle-size budgets. Feature flags (server side): public booking on or off per business, assistant, new sign-ups, read-only mode. Backups and point-in-time recovery; restore drill before launch.

## 13. Observability

Error reporting without personal data. Metrics: bookings per day, `SLOT_TAKEN` rate, public endpoint 429 rate, booking page funnel (step reached, anonymous counts only), sync queue age, reminder overdue count, assistant success and cost. Nightly invariants: no overlapping active bookings; every confirmed future booking has reminder tasks; no booking outside the provider's hours at creation time; counters consistent.

## 14. Open technical questions

1. Is a per-business link preview (Open Graph image) needed for Telegram sharing in v1, or generic is enough?
2. Is the Realtime load acceptable for many small businesses on one project? Load test in M5.
3. Should the slot engine ever run on the client for the public page (fewer calls) or always on the server (authoritative)? Default: always server.
