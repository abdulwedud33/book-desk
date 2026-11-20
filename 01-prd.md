# 01. Product Requirements Document

**Product (working title):** Book Desk
**Project:** 3 of 3 (General Projects)
**Status:** Draft v0.1. Planning only; no code until the owner says "start building".
**Related:** `02-technical-requirements.md`, `03-app-flow.md`, `04-ui-ux-design-brief.md`, `DESIGN.md`, `05-backend-schema.md`, `security.md`

---

## 1. Summary

Book Desk lets a customer **book an appointment in under a minute from their phone, with no account and no app to install**, and gives the business a calendar that can never be double-booked. The business shares one link (or a QR code) on Telegram, WhatsApp, Instagram or a door poster. The customer picks a service, a time and enters a name and phone number. The business sees the booking at once on a live calendar, gets a prepared reminder to send, and can see who tends to miss appointments.

Two products in one:

| Part | Who uses it | What it is |
|------|-------------|-----------|
| **Booking page** (public) | Customers | A tiny, fast, three-language web page at the business's own link. No login |
| **Business app** (PWA) | Owner, reception staff, providers | Calendar, services, schedules, bookings, customers, reminders, reports |

Typical businesses: salons and barbers, clinics and dentists, tutors and coaches, garages and service workshops, photographers, spas, driving schools, consultants.

## 2. Problem

- Customers book by phone call or chat message and wait for an answer. If nobody replies, they go elsewhere.
- Staff keep appointments in a notebook, a phone calendar or memory. Double bookings and forgotten appointments happen.
- Nobody reminds customers, so many do not show up and the slot is wasted.
- Working hours, breaks, days off and different service lengths are hard to juggle by hand.
- Owners cannot see how busy each person is, which services sell, or which customers repeatedly miss appointments.
- Times are easy to misread: many people say "3 o'clock" meaning a different hour depending on whether they use the Ethiopian or the international clock.

## 3. Users

| Role | Who | Needs |
|------|-----|-------|
| Customer (no account) | Person booking | Find a free time quickly, book in a few taps, get a confirmation they can keep, change or cancel without calling |
| Owner | Runs the business | Sets up services, people and hours; sees everything; reports; controls rules (lead time, cancellations, approval) |
| Reception (staff) | Front desk | Sees all calendars; creates, moves and cancels bookings; handles walk-ins; sends reminders |
| Provider | Barber, dentist, tutor, mechanic | Sees only their own day and customers; marks arrived, in service, done, no-show; manages own time off if allowed |

## 4. Goals and non-goals

**Goals (v1)**
1. A customer can book in under 60 seconds and 4 steps, on a slow connection, with no account.
2. **Double bookings are impossible.** The database enforces it, not just the screen.
3. Staff see new bookings on every device within a few seconds, and can work offline.
4. Every booking gets a prepared confirmation and reminders, so no-shows fall.
5. Customers can reschedule or cancel themselves through a private link, within the rules the owner sets.
6. Works in English, Amharic and Afaan Oromo, with unambiguous times.

**Non-goals (v1)**
- Online payments and deposits (v1.1; prices are shown, payment is at the venue).
- Automatic reminders by SMS, Telegram or WhatsApp (v1: prepared messages that staff send in one tap; automatic Telegram reminders are v1.1).
- Group classes with seats, rooms and equipment scheduling (v1.1).
- Customer accounts, loyalty points, marketplace listing of many businesses.
- A public AI chatbot for customers (abuse and cost risk; staff-side assistant only).
- Multi-branch management.

## 5. Success metrics (to validate in the pilot)

| Metric | Target |
|--------|--------|
| Time for a customer to book | Median under 60 s; 80% complete in 4 taps after choosing a service |
| Booking page completion (started to confirmed) | 60% or higher |
| Double bookings | 0 |
| No-show rate | Down 30% from the shop's baseline after reminders |
| Share of bookings made through the link | 40% after 4 weeks |
| Time for staff to add a phone or walk-in booking | Under 20 s |
| Booking page load on Fast 3G | Under 2.5 s to interactive slots |
| Activation | 60% of new businesses share their link within 24 hours of signup |

## 6. Decisions to confirm (assumptions)

| # | Decision | My default | Why |
|---|----------|------------|-----|
| 1 | Platform | Business app: installable PWA. Booking page: separate tiny static page | No app-store friction; customers need no install |
| 2 | Backend | Supabase (Postgres with RLS, Auth, Realtime, Edge Functions) | Same stack as projects 1 and 2; exclusion constraints stop double booking |
| 3 | Public access | Booking page talks to Edge Functions only; it never touches the database directly | Rate limits, validation and data minimisation in one place |
| 4 | Customer identity | None. A private manage link per booking; phone number as the contact | Lowest friction |
| 5 | Confirmation mode | Instant by default; owner can switch to "approval required" | Most small businesses want instant; approval protects against abuse |
| 6 | Reminders | v1: prepared messages in a "Reminders to send" list, shared in one tap. v1.1: automatic Telegram | No messaging provider cost or contract in v1 |
| 7 | Provider model | A "provider" is a bookable person; they need no login unless the owner invites them | Many providers do not use the app |
| 8 | Time display | Gregorian time with morning, afternoon and evening words; optional Ethiopian-time display (the 6-hour offset clock) per business and per customer | Avoids misread appointments; confirm with pilot users |
| 9 | Languages and currency | English, Amharic, Afaan Oromo; ETB | Same as projects 1 and 2 |
| 10 | Slot grid | Default 15 minutes; lead time 60 minutes; horizon 30 days; cancel cutoff 2 hours; all per-business settings | Sensible defaults |
| 11 | Slot holds | None in v1; the final booking step re-checks and offers alternatives if taken | Simplicity |
| 12 | Abuse protection | Rate limits, honeypot field, cap of 3 active future bookings per phone, owner can block a phone; stronger challenge in v1.1 | Public forms attract spam |

## 7. Scope

| Module | v1 | v1.1 | Later |
|--------|----|------|-------|
| Accounts, business, roles, invites | Yes | | |
| Services, providers, weekly hours, breaks, time off | Yes | Seasonal templates | |
| Availability engine (slots) | Yes | Slot holds | Resources and rooms |
| Public booking page with own link and QR | Yes | Per-business link previews | Custom domain |
| Customer manage page (view, reschedule, cancel, add to calendar) | Yes | Delete my data | |
| Staff calendar (day, week, list) | Yes | Drag and drop on tablets | |
| Walk-ins and phone bookings | Yes | | |
| Approval mode | Yes | | |
| Reminders list with prepared messages | Yes | Automatic Telegram | SMS gateway |
| Customers and no-show tracking | Yes | Blocklist rules | |
| Reports | Yes | | |
| Staff assistant (draft bookings, message drafts, insights) | Yes | | |
| Waitlist | | Yes | |
| Deposits and payments | | Yes | |
| Group classes | | Yes | |

## 8. Functional requirements

IDs are stable; acceptance criteria are testable.

### Accounts and business
- **FR-A1** Sign up and in with email and password. *AC:* session persists; wrong credentials show a friendly message.
- **FR-A2** Create a business in onboarding with a type (Salon or barber, Clinic, Tutor or coach, Garage or workshop, Other). The type loads sample services and typical hours. *AC:* first service and weekly hours exist after step 2.
- **FR-A3** Each business has a unique booking link (`/b/<slug>`) and a QR code. *AC:* slug rules (3 to 40 lowercase letters, digits, hyphens), reserved words blocked, change allowed with a warning that the old link stops working.
- **FR-A4** Invite reception staff and providers by single-use code (48 h). Owner picks the role; a provider invite links the person to a provider profile.
- **FR-A5** Language switch (English, Amharic, Afaan Oromo) for staff; the booking page has its own switch.
- **FR-A6** Owner can delete the business and all its data.

### Services, providers and schedules
- **FR-S1** Create a service: name, duration (5 to 480 min), buffer after (0 to 120), optional price, optional short description, active flag. *AC:* quick add needs only name and duration.
- **FR-S2** Create providers (name, color) and choose which services each offers. *AC:* a business with one person gets one provider by default.
- **FR-S3** Weekly working hours per provider with split shifts (breaks). *AC:* "Copy Monday to all weekdays" in one tap.
- **FR-S4** Time off: whole business (holiday) or one provider, with start and end and an optional reason. *AC:* existing bookings inside the range are listed so staff can move or cancel them.
- **FR-S5** Business rules: slot interval, lead time, horizon, cancel cutoff, confirmation mode (instant or approval), maximum active bookings per phone.

### Availability and booking
- **FR-B1** Available slots are computed from working hours, breaks, time off, existing bookings, service duration plus buffer, lead time and horizon. *AC:* property tests prove no returned slot overlaps anything.
- **FR-B2** "Any available provider" is the default; the system assigns a provider fairly (fewest bookings that day, then earliest free, then sort order).
- **FR-B3** Booking creation re-checks availability inside the database transaction. *AC:* 50 simultaneous attempts on one slot produce exactly one booking; the others get `SLOT_TAKEN` with nearby alternatives.
- **FR-B4** The database exclusion constraint makes overlapping active bookings for the same provider impossible, whatever any client or function does.
- **FR-B5** Statuses: Pending (approval mode), Confirmed, Arrived, In service, Completed, Cancelled, No-show. Valid transitions only, by role (`02` section 5).
- **FR-B6** Staff and providers can create bookings (phone, walk-in), reschedule, cancel with a reason, and change status. Every change is recorded in a timeline.
- **FR-B7** Walk-in quick add: pick a service, optionally a provider; the system places it at the earliest free time from now.
- **FR-B8** Offline: staff can view the cached calendar and queue new bookings and status changes. *AC:* queued bookings are labelled "Not confirmed yet"; if the server finds the slot taken, the item moves to "Needs attention" with alternatives.

### Public booking page
- **FR-P1** Steps: service, time (provider optional), your details, confirmation. Progress is shown; the action bar never moves. *AC:* 4 steps, no account.
- **FR-P2** The "Next available" time is shown first for the chosen service (value before questions).
- **FR-P3** Date strip with a small availability ribbon per day; time chips grouped into morning, afternoon and evening; unavailable times are not shown.
- **FR-P4** Details: name and phone only (email optional later). Phone numbers are normalised (Ethiopian local formats and international).
- **FR-P5** Confirmation shows date, time (unambiguous), service, provider, price, address or instructions, a manage link, add to calendar (.ics) and share. *AC:* works without JavaScript errors on slow networks.
- **FR-P6** Page shows only public business info: name, services, provider names, hours. No customer data, no other people's bookings.
- **FR-P7** Three languages and optional Ethiopian-time display.

### Customer manage page
- **FR-M1** Private link per booking (unguessable). Shows details and status.
- **FR-M2** Reschedule and cancel until the cutoff set by the business; after the cutoff the page shows how to contact the business. *AC:* rules enforced on the server.
- **FR-M3** Add to calendar (.ics), directions or instructions text.

### Reminders
- **FR-R1** For each confirmed booking the system creates reminder tasks (confirmation now, reminder 24 hours before, reminder 2 hours before; times adjustable per business). *AC:* no reminders for cancelled bookings; tasks re-timed when a booking moves.
- **FR-R2** "Reminders to send" list: each task shows a prepared message in the customer's language and a one-tap Share or Copy; staff marks it done. *AC:* overdue tasks are highlighted.
- **FR-R3** Messages are drafts; the app never sends them in v1.

### Customers and no-shows
- **FR-C1** Customers are created or matched by phone when a booking is made; history is visible to owner and reception.
- **FR-C2** No-show count per customer; reception sees a warning on repeat no-shows; the owner can require approval for specific customers or block a phone number.
- **FR-C3** Owner can export and delete a customer's data.

### Reports
- **FR-X1** Today: bookings by status, next up, empty gaps, no-shows.
- **FR-X2** Period reports: bookings, utilisation per provider, popular services, peak hours, cancellations and their lead time, no-show rate, new versus returning customers.
- **FR-X3** CSV export (formula-safe).

### Staff assistant (optional)
- **FR-I1** Paste a customer's chat message; get a draft booking with real available slots to choose from. Never saves automatically.
- **FR-I2** Draft confirmation, reminder, reschedule and no-show follow-up messages in the customer's language.
- **FR-I3** Weekly insights for the owner: utilisation, no-show patterns, suggested hours.

## 9. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | Booking page interactive in under 2.5 s on Fast 3G, JS under 70 KB gzip; staff calendar interactions under 100 ms; slot search under 400 ms server time for 7 days |
| Correctness | No overlapping bookings per provider (database constraint); time zones handled in the business time zone; slot and booking maths covered by property tests |
| Reliability | Staff actions saved locally before any network call; retries are idempotent; public endpoints degrade gracefully |
| Offline (staff) | View calendar, create and change bookings queued with clear labels |
| Security | See `security.md`. RLS on every table; public access only through rate-limited Edge Functions; providers see only their own bookings; no secrets in the client |
| Privacy | Customer name and phone only; stored in a protected table; public pages expose none; manage links are unguessable |
| Accessibility | WCAG 2.2 AA; 48 px targets; date and time pickers usable with a screen reader and one hand; never color alone |
| Localization | English, Amharic, Afaan Oromo; unambiguous times; optional Ethiopian-time display; ETB |
| Observability | Errors without personal data; nightly invariants (no overlaps, reminder consistency) |

## 10. UX principles (summary; details in `04`)

- Standing rules: skeleton loaders instead of spinners everywhere; instant feedback on every tap; no moving buttons in onboarding or in the booking steps; no backend errors shown.
- UX laws: Jakob, Hick, Proximity, Miller, Von Restorff.
- Psychology used honestly: smart defaults, goal gradient, reciprocity, endowment, loss aversion.
- Simplicity, consistency, visual hierarchy.

## 11. Risks and open questions

| Risk | Mitigation |
|------|-----------|
| Spam or fake bookings fill the calendar | Rate limits per IP, phone and business; honeypot; cap of active bookings per phone; approval mode; block list; stronger challenge in v1.1 |
| Double booking through a race | Exclusion constraint plus transactional re-check; conflict returns alternatives |
| Customers misread times (Ethiopian versus international clock) | Always show morning, afternoon or evening words; optional Ethiopian-time display; assistant asks when a time is ambiguous |
| Reminders are not sent because it is manual | Overdue highlighting, today's list on the home screen, v1.1 automatic Telegram |
| Setup is too long for small businesses | Business-type templates, copy-hours shortcuts, first service in two fields |
| Offline bookings conflict | Labelled "Not confirmed yet"; conflict flow with alternatives |
| Phone numbers are sensitive | Protected table, role-based access, redaction before AI, minimal public data |

Open questions:
1. Which business type is the first pilot (barber or salon, clinic, tutor, garage)?
2. Do customers mostly book by phone call, Telegram or in person?
3. Is Ethiopian-time display wanted by customers, staff, or both?
4. Do providers have their own phones and should they log in?
5. Is automatic Telegram reminder important enough to do first in v1.1?
6. What cancellation window do pilot businesses want by default?

## 12. Release criteria (v1)

- All v1 requirements pass their acceptance criteria.
- Concurrency test: 50 parallel bookings for one slot yield exactly one confirmed booking.
- Property tests: slots never overlap bookings, breaks, time off, or fall outside hours, lead time or horizon.
- RLS matrix tests pass for anonymous, outsider, owner, reception, provider (own), provider (other) on every table.
- Public endpoints return no personal data; rate limits verified.
- Booking page budgets met (load, size, accessibility).
- Pilot with 3 to 5 businesses for 2 weeks with zero double bookings.
