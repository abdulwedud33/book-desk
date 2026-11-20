# 06. Implementation Plan

**Product:** Book Desk (working title). **Status:** Draft v0.1. **No code is written until the owner says "start building".**
**Estimate basis:** one developer part time with AI assistance. Ranges are re-planned after each milestone.

---

## 1. Approach

- **Milestones in value order,** each ending with something demonstrable on a real phone.
- **Correctness first.** The availability engine and the double-booking guard are built and tested before any screen depends on them.
- **Tests with every milestone:** pgTAP for rules, unit and property tests for slot maths, Playwright for journeys.
- **Review gates** after each UI milestone: Web Interface Guidelines review, axe, throttled-network check, offline check (staff app), three-language and Ethiopian-time check.
- **Pilot early:** a real business shares its link from M5.

## 2. Milestones

| # | Milestone | Weeks | Outcome |
|---|-----------|-------|---------|
| M0 | Decisions and repository | 0.5 | Assumptions confirmed; repo, CI, hosting skeleton, `/b/*` rewrite |
| M1 | Foundation: auth, business, slug, roles, onboarding | 1.5 | Sign up, create business by type with a link, invite team, language switch |
| M2 | Services, providers, hours, time off | 1.5 | Fast setup: templates, copy hours, time off with conflict list |
| M3 | Availability engine | 2 | `compute_slots` in SQL and in `domain/`, parity and property tests |
| M4 | Bookings core and staff calendar | 2.5 | Create, move, cancel, status; exclusion constraint; realtime; offline queue with conflicts |
| M5 | Public booking page | 2 | Four-step page, Edge Functions, abuse controls, budgets met |
| M6 | Customer manage page | 1 | View, reschedule, cancel, add to calendar |
| M7 | Reminders and approval mode | 1.5 | Reminders list with prepared messages; pending requests flow |
| M8 | Customers and no-shows | 1 | CRM, no-show counts, approval and block |
| M9 | Reports | 1 | Today and period reports, CSV |
| M10 | Staff assistant | 2 | Draft bookings from chat text, message drafts, insights, evals passing |
| M11 | Hardening and pilot | 2 | Security review, budgets, restore drill, pilot with 3 to 5 businesses |

Total about 18 to 19 weeks part time. A usable v1 without the assistant and reports is reachable after M7 (about 12 weeks).

## 3. Milestone details

### M0. Decisions and repository
- Confirm `01-prd.md` section 6 and answer the open questions (first pilot type, channels, Ethiopian time, providers' devices, reminders, cancellation window).
- Repo (strict TypeScript, linting, test runners), CI (typecheck, tests, pgTAP, build, bundle secret scan, dependency audit, history scan, bundle-size budgets).
- Static hosting with generated security headers and the `/b/*` and `/m/*` rewrites; Supabase projects (staging, production).
- **Exit:** a "hello" booking shell loads at `/b/test`; secret scan fails on a planted fake key.

### M1. Foundation
- Migrations 0001-0002 (enums, privileges, helpers, rate limiter, shops with slug, members, invites, audit, `create_shop`, `check_slug`, invites, `delete_shop`).
- UI: sign in and up, onboarding (3 fixed steps with live slug check), join with code, language switch, role-aware navigation, skeleton primitives, toasts, banners, error translation.
- **Tests:** RLS matrix for identity tables; slug rules and reserved words; invite single use and expiry; rate limits.
- **Exit:** a new owner has a working link in under 3 minutes.

### M2. Services, providers, hours, time off
- Migration 0003. UI: services quick add, providers with colors, service-to-provider mapping, weekly hours editor with split shifts and "Copy to weekdays", time off with affected-bookings list, rules screen.
- **Tests:** hours cannot overlap (constraint); owner-only writes; RLS for new tables; templates seed correctly per business type.
- **Exit:** a barber shop with 3 people and 6 services is set up in under 10 minutes.

### M3. Availability engine
- Migration 0004: customers table and `compute_slots`, `staff_slots`. TypeScript `domain/slots.ts` with identical behaviour.
- **Tests (the heart of correctness):** property tests over random schedules, breaks, time off and bookings: no returned slot overlaps anything or leaves the hours; lead time and horizon respected; buffers respected; DST fixture; "any provider" fairness; parity between SQL and TypeScript on shared fixtures.
- **Exit:** 10,000 random scenarios pass; 7-day search for 5 providers under 400 ms.

### M4. Bookings core and staff calendar
- Migration 0005: bookings with exclusion constraint, contacts, events, transitions, `book_slot`, `create_booking`, `reschedule_booking`, `cancel_booking`, `set_booking_status`, guard trigger.
- Client: local DB, outbox, calendar (agenda, day, week; tablet columns), Today, New booking with walk-in, booking detail and timeline, realtime with polling fallback, "Not confirmed yet" marks, conflict handling with alternatives.
- **Tests:** 50-way concurrency on one slot yields exactly one booking; transition matrix by role; provider sees own only (queries and realtime); idempotent replay; reschedule conflicts; offline Playwright test with a conflicting slot.
- **Exit:** two devices show the same calendar within 3 seconds; no double booking can be created by any path.

### M5. Public booking page
- Migration 0006: `public_*` functions and abuse controls. Edge Functions `public-shop`, `public-slots`, `public-book` with validation, per-IP, per-phone and per-business limits, honeypot, per-phone active cap, blocked list, approval mode.
- Booking page (own bundle): four steps, "Next available", date strip with ribbon, chips, details, confirmation, add to calendar, share; three languages, optional Ethiopian time; skeletons; fixed action bar (visual regression test).
- **Tests:** no personal data in any public response; rate limits (429, calm message); conflicts return alternatives; stale page errors handled; budgets (70 KB gzip, LCP 2.5 s throttled).
- **Exit (pilot starts):** a customer books on a slow phone in under 60 seconds; staff see it live.

### M6. Customer manage page
- Edge Functions `public-manage`, `public-reschedule`, `public-cancel`; page `/m/<token>`; cutoff rules; `.ics` generation.
- **Tests:** token guessing resistance and rate limits; cutoff enforced on the server; reschedule uses the same guard; expired tokens generic.
- **Exit:** a customer reschedules without calling; late changes show contact instructions.

### M7. Reminders and approval mode
- Migration 0007: reminder generation and re-timing, `complete_reminder`, approval flow. UI: Reminders list with prepared messages (three languages), Share and Copy, overdue highlighting; pending requests queue with Accept and Decline.
- **Tests:** reminders created, moved and skipped correctly; no reminders for cancelled bookings; approval transitions by role.
- **Exit:** reception clears the day's reminders in under 2 minutes using the share sheet.

### M8. Customers and no-shows
- CRM list and detail, no-show counts, warnings, require approval, block phone, export and delete (audited).
- **Tests:** counts equal the number of no-show bookings; blocked phones rejected at the public endpoint; deletion keeps times and statuses.

### M9. Reports
- Migration 0008 and UI: Today and period views, utilisation, popular services, peak hours, cancellations, no-show rate, CSV (formula-safe). Provider sees own numbers.
- **Exit:** numbers reconcile with raw bookings.

### M10. Staff assistant
- Migration 0009. Edge Functions `ai-parse-booking`, `ai-message-draft`, `ai-insights` with guardrails, phone redaction, grounded slots from `find_slots`, ambiguity handling (including Ethiopian time), limits, kill switch, memory screen.
- Evals per `evals.md` with at least 200 messages across the three languages.
- **Exit:** thresholds met per language; manual flow unaffected when the assistant is off.

### M11. Hardening and pilot
- Migration 0010: realtime audit, lockdown, nightly invariants. Full security checklist and abuse cases; performance and accessibility budgets; restore drill; native-speaker review; pilot with 3 to 5 businesses for 2 weeks.
- **Exit:** release criteria in `01-prd.md` section 12 met.

## 4. Definition of Done (every milestone)

- Requirements covered and acceptance criteria tested.
- RLS enabled on every new table with policies and tests for every role in the matrix.
- All inputs validated on client and server; database constraints in place; public endpoints validated and rate limited.
- No secrets in the client; bundle scan green.
- Skeleton loaders on every new screen (no spinners); instant feedback; optimistic staff actions with rollback; no backend errors visible.
- Booking steps and onboarding: no moving buttons (visual regression check).
- Five UX laws and psychology patterns reviewed against `04`.
- Speed rules respected: compressed responses, compact slot payloads, one RPC per action, no blocking dependency, static hosting.
- Accessibility, offline (staff), three-language and Ethiopian-time passes.
- Docs updated if behaviour changed.

## 5. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Slot maths bugs (time zones, buffers, breaks) | Property tests, SQL and TypeScript parity, constraint as final guard |
| Spam bookings | Rate limits, honeypot, per-phone cap, approval mode, block list; challenge in v1.1 |
| Setup too long | Templates, copy shortcuts, first service in two fields |
| Manual reminders neglected | Today list and badges, overdue highlighting, automatic Telegram in v1.1 |
| Ethiopian time confusion | Part-of-day words always; optional second clock; assistant asks when ambiguous |
| Public page slow on weak networks | 70 KB budget, no third-party scripts, compact payloads, CDN caching for shop info |
| Realtime reliability | Polling fallback; last-updated indicator |
| Assistant quality in Amharic and Afaan Oromo | Per-language thresholds; manual flow always available |

## 6. What the owner provides

- Answers to the open questions, a pilot business per type (at least one), a native Amharic and Afaan Oromo reviewer.
- Accounts: hosting, Supabase, model API; optionally a domain name.
- Willingness to run the final `CHECKLIST.md` (what only the owner can do).

## 7. Working agreement

No code until "start building". One milestone at a time with a plain report of what changed, what was verified and what could not be verified.
