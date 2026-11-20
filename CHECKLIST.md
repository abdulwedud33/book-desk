# Book Desk: Production Launch Checklist

This document details all deployment, infrastructure, legal, and operational actions that **only the business owner / operator can perform**. All software, database schemas, security rules, guardrails, and automated tests have been implemented and verified.

---

## 1. Hosting & CDN Configuration

### Cloudflare Pages / Netlify Routing Rules
The public booking flow (`/b/<slug>`) and appointment management flow (`/m/<token>`) use an ultra-lightweight static shell (70 KB JS / 15 KB CSS gzip budget) served via SPA rewrites.
- [ ] Deploy the `out/` export folder to Cloudflare Pages or Netlify.
- [ ] Ensure `public/_redirects` is deployed with the following rewrite rules:
  ```text
  /b/*    /booking/index.html   200
  /m/*    /manage/index.html    200
  /*      /index.html           200
  ```
- [ ] Verify `public/_headers` enforces security headers:
  ```text
  /m/*
    X-Robots-Tag: noindex, nofollow, noarchive
    Referrer-Policy: no-referrer
    Cache-Control: private, no-cache, no-store, must-revalidate

  /b/*
    X-Robots-Tag: index, follow
    Referrer-Policy: strict-origin-when-cross-origin
  ```
- [ ] Configure custom domain (e.g., `bookdesk.et` or `appointments.yourdomain.com`) with automated SSL/TLS certificates.

---

## 2. Supabase Infrastructure & Production Secrets

- [ ] Create a production Supabase project with Postgres and pgvector/btree_gist extensions enabled.
- [ ] Apply database migrations in sequential order (`0001` through `0011` in `supabase/migrations/`).
- [ ] Deploy Deno Edge Functions from `supabase/functions/`:
  - `public-shop`
  - `public-slots`
  - `public-book`
  - `public-manage`
  - `public-reschedule`
  - `public-cancel`
  - `ai-parse-booking`
  - `ai-message-draft`
  - `ai-insights`
- [ ] Set production secrets in Supabase Edge Functions:
  ```bash
  supabase secrets set \
    AI_MODEL_FAST="gemini-1.5-flash" \
    AI_MODEL_SMART="gemini-1.5-pro" \
    GEMINI_API_KEY="<YOUR_GEMINI_API_KEY>" \
    AI_ENABLED="true"
  ```
- [ ] Verify that `anon` key is strictly restricted (anon has zero direct table privileges; public traffic accesses data only via rate-limited Edge Functions).
- [ ] Set up a nightly scheduled cron job (via Supabase pg_cron or GitHub Actions) calling:
  ```sql
  select * from public.check_nightly_invariants();
  ```
  Ensure alerts fire if any invariant returns `pass = false`.

---

## 3. Native Speaker Localization Review

While translation key parity across English, Amharic (`am`), and Afaan Oromo (`om`) is tested, native speaker sign-off is required before public launch:
- [ ] **Amharic (`am`) review**:
  - Part-of-day indicators: `ጠዋት` (morning), `ከሰዓት` (afternoon), `ማታ` (evening).
  - Ethiopian clock conversion wording: `የኢትዮጵያ ሰዓት` / `የሀበሻ ሰዓት`.
  - Booking statuses: `የተረጋገጠ` (confirmed), `ደርሰዋል` (arrived), `በአገልግሎት ላይ` (in service), `የተጠናቀቀ` (completed), `ያልመጡ` (no-show), `የተሰረዘ` (cancelled).
- [ ] **Afaan Oromo (`om`) review**:
  - Part-of-day indicators: `ganama` (morning), `waaree booda` (afternoon), `galgala` (evening).
  - Ethiopian clock phrasing: `sa'aatii Itoophiyaa`.
  - Booking statuses: `Mirkanaa'e` (confirmed), `Gaheera` (arrived), `Hojii irra jira` (in service), `Xumurame` (completed), `Hafaniiru` (no-show), `Haqameera` (cancelled).

---

## 4. Disaster Recovery & Backup Drill

- [ ] Execute a live restore drill on a staging database from automated daily snapshot or Point-in-Time Recovery (PITR) WAL logs.
- [ ] Verify that after restore:
  - Database exclusion constraints (`bookings_no_overlap`, `working_hours_no_overlap`) remain intact.
  - Append-only `booking_events` history is preserved.
  - Rate limiter table can be truncated without impacting user operations.
- [ ] Test key rotation procedure for Supabase `service_role` and Gemini API keys without downtime.

---

## 5. Legal & Privacy Review (Especially Clinics & Health Services)

- [ ] **Data Minimization**: Public booking collects only customer name and phone number. Confirm compliance with applicable Ethiopian data protection laws and international privacy frameworks.
- [ ] **Health & Clinical Services**:
  - For dental practices, clinics, or therapists, the app **must not collect symptoms or diagnosis information** in v1.
  - Verify that the customer notes field and service descriptions display warnings against entering sensitive medical records.
  - Confirm with qualified legal counsel before onboarding medical or clinical pilot businesses.

---

## 6. Pilot Rollout (3 to 5 Businesses for 2 Weeks)

Per Section 12 of `docs/01-prd.md`, conduct a 2-week pilot with real businesses:
- [ ] **Select Pilot Businesses**:
  - 1-2 Barber shops / Salons (`salon` template)
  - 1 Tutoring or Professional service (`tutor` template)
  - 1 General appointment business
- [ ] **Operational Pilot Verification**:
  - Verify zero double bookings over the entire 2-week period.
  - Observe real-world customer traffic on 3G mobile connections.
  - Verify staff reminder workflow ("Reminders to send" queue copied to SMS or Telegram).
  - Verify that offline staff booking creates optimistic local records that sync seamlessly upon reconnect.
- [ ] Gather customer and provider feedback on the morning/afternoon/evening part-of-day labels and Ethiopian time display.
