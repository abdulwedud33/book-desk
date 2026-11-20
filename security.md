# security.md

Security baseline for Book Desk (working title). This file is the single source of truth for security rules. Every milestone in `06-implementation-plan.md` must meet it before it is "done".

**Status:** planning. Rules apply from the first line of code.

---

## 1. What we protect

| Asset | Why it matters | Who must never see it |
|-------|----------------|-----------------------|
| Bookings and schedules | The business's day-to-day; also reveal when people are away or busy | Other businesses; the public (only free times are public) |
| Customer names and phone numbers | Personal data | The public, other businesses, other providers, logs, the AI model (phones) |
| Manage tokens | Grant view, reschedule and cancel of one booking | Anyone but the customer and the business team |
| Invite codes and sessions | Account takeover | Anyone but the intended person |
| Service-role key, model API key | Full access / money | The browser, git, logs |

## 2. Non-negotiables

| # | Rule | Where enforced |
|---|------|----------------|
| 1 | **No secrets or keys in the frontend or inside the app.** Only the public project URL and anon key ship | Section 3, CI bundle scan |
| 2 | **Users access only authorized data**, decided on the server from session and role; the public gets only public business info and free times | Sections 4, 5, 9 |
| 3 | **Backend and database rules are enforced:** RLS, exclusion constraint, status machine, RPC checks. UI checks are convenience | Sections 5, 6 |
| 4 | **All user and AI input is validated** on the client and again on the server, then constrained in the database | Section 6, `guardrails.md` |
| 5 | **Row level security on every table, policies in the same migration** | Section 5 |
| 6 | **Rate limiting on all APIs,** including every public endpoint | Section 7 |
| 7 | **No backend errors shown to users** | Section 8 |

## 3. Secrets management

**Allowed in the client:** project URL, public anon key, public config. **Never in the client or git:** service-role key, model API key, database password, JWT secret, any real `.env`.

| Practice | Detail |
|----------|--------|
| Where secrets live | Edge Function secrets, CI secret store, hosting dashboard (public build vars only) |
| Local development | `.env.local` git-ignored; committed `.env.example` has placeholders |
| Scanning | Secret scan on every pull request and weekly on full history |
| Bundle check | CI fails the build if either static bundle (staff app or booking page) contains a service-role key, a model key, or a JWT whose role is not `anon` |
| Model calls | Only from Edge Functions |
| Service role | Used by Edge Functions only to call `public_*` functions, the rate limiter and the usage log; never to answer a staff request on staff data |
| Rotation | On staff change, suspected leak, and at least every 6 months |
| Logs | Never log tokens, keys, pasted messages, names, phone numbers or raw prompts |

If a secret is ever committed: revoke and rotate first, then clean history.

## 4. Authentication, sessions and roles

- Supabase Auth, email and password; our code never handles passwords. Minimum length 10; common passwords rejected.
- Sign-in, sign-up and reset are rate limited; no account enumeration.
- Short-lived access token with refresh; sign out wipes local data (section 10).
- Roles (`owner`, `reception`, `provider`) are stored in `shop_members`, never in client-editable metadata; a provider member is linked to a provider profile by the owner.
- Invites: single use, 48 h expiry, owner only, role fixed at creation, hash only stored.
- Sensitive owner actions (slug change, member removal, customer block, export and delete, price change) are audited.
- **Customers have no accounts.** Their access is a manage token for one booking (section 9).
- Optional later: owner MFA, app PIN on shared reception devices.

## 5. Authorization and row level security

**Every table has RLS enabled. A migration that adds a table without RLS and policies fails review and CI.**

1. Default deny. `anon` has no table privileges and no policies.
2. Never `using (true)` or `with check (true)` on business data.
3. Policies use helper functions (`my_role`, `my_provider_id`, `is_member`, `has_role`, `can_see_booking`) with `(select auth.uid())`; policy columns are indexed.
4. Security-definer functions set `search_path = ''`, use qualified names and re-check the caller's role inside.
5. **Provider scoping:** providers read only their own bookings, contacts, events and reminders, including through realtime.
6. **Separation of sensitive data:** names and phones for bookings live in `booking_contacts`; the CRM `customers` table is for owner and reception only.
7. Business tables allow no direct client writes for bookings, contacts, events and reminders; writes happen in RPC functions. `booking_events` is append-only (privileges and trigger).
8. A guard trigger stops status changes outside the status-machine RPC.
9. **The exclusion constraint on bookings makes overlaps impossible,** regardless of caller.
10. Realtime publishes only tables safe under their RLS for every subscriber; `booking_contacts` is not published.
11. The client never sends `shop_id`, `user_id` or `role` to an assistant tool.

**Required test matrix** (CI, blocking): every table and action for anonymous, outsider, owner, reception, provider (own), provider (other). Cross-business reads and writes always fail.

## 6. Input validation and output encoding

| Layer | Mechanism |
|-------|-----------|
| Client | Zod schemas shared with Edge Functions |
| Edge Functions | Parse every request; reject unknown fields; body size limit (4 KB for public endpoints) |
| RPC and public functions | Argument shape, range, length and enum checks; coded errors |
| Database | CHECK constraints, NOT NULL, foreign keys, unique keys, exclusion constraints |
| AI input and output | `guardrails.md`; AI output is untrusted input |

Specific rules:

- **Names** 1 to 100 characters; Unicode normalised; control and zero-width characters stripped; rendered as plain text.
- **Phone numbers** normalised (Ethiopian local forms such as 09 or 07 converted to the international form; other international numbers accepted), length-checked, stored once per booking contact and in the CRM.
- **Dates and times:** must parse, be on the slot grid, inside the horizon and rules; instants stored as UTC; the business time zone is taken from the database, never from the client.
- **Slugs** match the pattern, avoid reserved words, are unique; changes are audited.
- **Language** from an allow-list (`en`, `am`, `om`).
- **IDs** are UUIDs belonging to the business (RLS and lookups).
- **XSS:** React escaping only; no `dangerouslySetInnerHTML`; strict CSP. Public notes and service descriptions are plain text.
- **Calendar files (.ics):** generated from validated fields with proper escaping of text and line folding; never from raw user input.
- **Links:** `tel:` and map links are built from validated fields with encoding.
- **CSV export:** cells starting with `=`, `+`, `-` or `@` are prefixed with `'`.
- **SQL:** parameterised only.

## 7. Rate limiting (all APIs)

Every endpoint has a limit; "no limit" is not allowed.

| Surface | Starting limit | Key | Enforced by |
|---------|----------------|-----|-------------|
| Sign-in, sign-up, reset | 5 per 15 min per IP and identifier | IP, identifier | Auth limits plus CDN rule |
| Invite create and accept | 10 per hour; accept 10 per 15 min | user | RPC limiter |
| Staff write RPCs | 240 per minute per user | user | RPC limiter, CDN rule |
| Staff reads and lists | 300 per minute per user; page size at most 50 | user | PostgREST max rows, limiter |
| Staff slot search | 60 per minute per user | user | RPC limiter |
| Reports | 30 per minute per user | user | RPC limiter |
| **Public shop info and slots** | 60 per minute per IP; 120 per minute per business | IP, business | CDN/WAF plus function limiter; shop info cached 60 s at the CDN |
| **Public booking attempts** | 10 per hour per IP; 5 per day per phone; 300 per hour per business | IP, phone, business | Function and database limiter |
| **Manage page (view, reschedule, cancel)** | 10 per minute per token; 30 per minute per IP | token, IP | Function limiter |
| Assistant | 10 per minute and 200 per day per user; token cap per business | user, business | Edge limiter |
| Export | 5 per hour per business | business | Edge limiter |
| Anything unauthenticated | 60 per minute per IP | IP | CDN/WAF |

Notes: layered limits (CDN, function, database, max rows). 429 responses carry `Retry-After`; the booking page keeps the customer's choices and shows a calm message; the staff offline queue backs off with jitter. Alerts on sustained 429 spikes, repeated auth failures and booking surges from one IP or phone.

## 8. Error handling: never show backend errors

1. Users never see stack traces, SQL, table or column names, status codes, request ids or raw JSON.
2. Server errors carry short internal codes; one translation module maps each to a localized sentence and next step; unknown codes map to a generic message.
3. Details go to logs with a request id; no personal data in logs.
4. Permission errors are generic and never confirm that a record exists.
5. `SLOT_TAKEN`, `TOO_SOON`, `CUTOFF_PASSED` and similar are explained in human terms with the next step.
6. CI includes a failure-fuzz test asserting no code, SQL or stack text reaches the DOM on either front end.

## 9. Public booking surface (special attention)

**What is public:** business name, public note and contact, active services (name, duration, price, description), provider names, rules needed for the page, and free times. **What is never public:** any booking, customer, phone, or who holds a time.

- The booking page talks only to Edge Functions; `anon` cannot reach the database.
- **Abuse resistance:** rate limits (section 7), honeypot field, per-phone cap on active future bookings, per-business hourly cap, owner block list, approval mode, per-business switch to disable public booking, global kill switch. A stronger challenge (for example a privacy-friendly proof-of-work or a CAPTCHA) is a v1.1 option; it must not become a single point of failure.
- **Slot-blocking attacks** (booking many slots to deny others): the per-phone cap, approval mode and rate limits bound the damage; pending bookings expire if not confirmed within the business's window; staff can bulk-cancel by phone.
- **Manage tokens:** 128-bit random, base64url, unique, looked up only by the Edge Function; unknown or expired tokens return the same generic answer with similar timing; rate limited per token and per IP; expire 30 days after the appointment time; never put in URLs shared by the app except to the customer; `noindex` and `Referrer-Policy: no-referrer` on `/m/*` and `/b/*` confirmation views.
- **Enumeration:** slugs are public by design; booking and customer existence is never revealed; phone numbers are never confirmed or denied to the public.
- **Pages ship as a small bundle** with no third-party scripts and no analytics that carry personal data.
- **Consent:** a one-line notice that the number is used only for this booking and its reminders.

## 10. Transport, browser and device

- HTTPS only; HSTS; TLS 1.2+.
- Security headers generated per page: CSP with script hashes (no `unsafe-inline` for scripts), `connect-src` limited to our API origins, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CORS on functions: allow-list of our own origins (the public functions allow the booking page origin only).
- Third-party scripts: none by default; any addition needs review and Subresource Integrity.
- Service worker caches static files only, never API responses.
- **Data on the device (staff app):** sign out wipes the local database and caches; no tokens or keys in IndexedDB; provider sessions cache only their own bookings; optional app PIN for shared reception devices; honest limit: browser storage is not a vault, so we store as little as possible.

## 11. Privacy and personal data

- Collect only what is needed: customer name and phone; staff email.
- Contact data belongs to the business; the owner can export and delete a customer; deleted customers' bookings keep times and statuses but not contact details.
- AI: phone numbers are redacted before the model call and never appear in logs; minimum fields; provider settings must disable training on our data (verify current terms).
- Analytics and error reports exclude names, phones and appointment details tied to a person.
- Health-related businesses (clinics): the app must not collect symptoms or medical details in v1 (service names and notes are the business's responsibility; the notes field warns against sensitive details). Confirm applicable local rules with a qualified advisor before launching for clinics.
- Confirm applicable local data-protection requirements before public launch; this document is an engineering baseline, not legal advice.

## 12. Supply chain and build

Lockfile committed and reproducible installs; weekly dependency updates; audit and licence checks on every pull request (high severity blocks merge); CI actions pinned to commit SHAs; least-privilege tokens; branch protection with required checks; production migrations applied by CI only; few dependencies, each justified (also protects the booking page budget).

## 13. Monitoring and incident response

| Signal | Alert when |
|--------|-----------|
| Auth failures | Spike per IP or account |
| 429 responses (public and staff) | Sustained spike |
| Public booking rate per IP, phone, business | Surge |
| `SLOT_TAKEN` rate | Above baseline (possible scraping or bots) |
| RPC errors by code | Above baseline; `FORBIDDEN` spikes |
| Invariant job | Any mismatch (especially an overlap) |
| Assistant cost, schema failures, redaction misses | Above budget or any redaction miss |
| Secret scan | Any finding |

**Incident steps:** contain (kill switches), assess (what data, which businesses), restore (backups and point-in-time recovery), notify affected owners plainly, write a blameless post-mortem and add a test.

Kill switches: assistant, public booking (global and per business), exports, new sign-ups, read-only mode.

## 14. Security testing

| Test | Frequency | Blocking |
|------|-----------|----------|
| RLS matrix (every table, every role) | Every PR | Yes |
| Overlap and concurrency tests | Every PR | Yes |
| Status machine and permission tests | Every PR | Yes |
| Public endpoint data-minimisation tests | Every PR | Yes |
| Invariants | Nightly and on PR | Yes |
| Secret scan and bundle grep (both bundles) | Every PR | Yes |
| Dependency and licence audit | Every PR | High severity |
| Failure-fuzz (no backend text in UI) | Every PR | Yes |
| Rate-limit tests including public and manage endpoints | Every PR | Yes |
| Assistant adversarial suite | Prompt, tool or model change | Yes |
| DAST baseline against staging | Weekly | Reviewed |
| Manual review against OWASP Top 10 and ASVS-style checklist | Before launch, each major release | Yes |

Abuse cases to test by hand: IDOR on every id; forged `shop_id`; provider reading another provider's bookings (queries and realtime); public endpoints returning any personal data; slot scraping and mass booking from one IP or many phones; guessing manage tokens; replaying manage links after the appointment; booking at the exact same instant from many clients; huge payloads; Unicode edge cases; pasted-message injection; time zone and DST edge cases; reschedule into a taken slot.

## 15. Launch security checklist

- [ ] RLS enabled on every table; matrix tests green for all roles
- [ ] `anon` has no table privileges; public data only through Edge Functions
- [ ] The exclusion constraint is present; 50-way concurrency test green
- [ ] Providers see only their own bookings (tables and realtime)
- [ ] `booking_events` is append-only; status guard works
- [ ] Secret scan and bundle scan clean for both bundles; keys only in server secrets
- [ ] Validation everywhere; DB constraints in place
- [ ] Rate limits live and tested on every endpoint, public included
- [ ] Error translation covers all codes; failure-fuzz green
- [ ] Public responses contain no personal data; unknown tokens generic; tokens expire
- [ ] Abuse controls tested (caps, honeypot, block list, approval mode, disable switch)
- [ ] Security headers and CSP deployed and verified on both front ends
- [ ] Sign out wipes local data
- [ ] Backups and point-in-time recovery tested with a restore drill
- [ ] Kill switches tested
- [ ] Incident runbook written; key rotation rehearsed
- [ ] Dependency audit clean; branch protection on
- [ ] Privacy notice, export and delete working

## 16. Requirement traceability

| Requirement | Enforced here | Also see |
|-------------|---------------|----------|
| No secrets in frontend or app | Section 3 | `02` s7 |
| Users access only authorized data | Sections 4, 5, 9 | `05` |
| Backend and DB rules enforced | Sections 5, 6 | `06` Definition of Done |
| User and AI input validated | Section 6 | `guardrails.md` |
| RLS on every table with policies | Section 5 | `05` |
| Rate limiting on all APIs | Section 7 | `guardrails.md` s6 |
| No backend errors shown | Section 8 | `04` s7 |
