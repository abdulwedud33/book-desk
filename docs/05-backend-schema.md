# 05. Backend Schema

**Product:** Book Desk (working title). **Status:** Draft v0.1. Postgres (Supabase) with row level security.
**Reads with:** `02-technical-requirements.md` (slot engine, status machine), `security.md`, `06-implementation-plan.md`.

---

## 1. Principles

1. **Row level security is on for every table, and policies are written in the same migration.** Default privileges give the API roles nothing; each migration grants exactly what is needed. `anon` has no table privileges at all.
2. **Public access goes through Edge Functions only.** They call `public_*` database functions with the service role. Those functions are revoked from `anon` and `authenticated`.
3. **Overlaps are impossible by construction.** A `btree_gist` exclusion constraint on `(provider_id, time range)` stops any two active bookings of one provider from overlapping, whatever any client, function or admin does.
4. **All business writes go through RPC functions** (one action = one transaction). They are `security definer`, set `search_path = ''`, re-check the caller's role, rate limit, validate, are idempotent and write an event. Clients have no direct INSERT, UPDATE or DELETE on bookings, contacts, events or reminders.
5. **Append-only history** for `booking_events` (privileges revoked and triggers block UPDATE and DELETE).
6. **Sensitive data is separate:** customer name and phone for a booking live in `booking_contacts`, readable only by owner, reception and the booking's provider.
7. **Idempotency:** every write carries a client-generated UUID (`id` or `client_id`); a replay returns the stored result.
8. **Optimistic concurrency:** edits pass `expected_version` or `expected_from`; a mismatch raises `CONFLICT`.
9. Instants are `timestamptz` (UTC). Working hours are local `time` values interpreted in the business time zone. Money is `numeric(14,2)`.

## 2. Extensions and enumerations

```sql
create extension if not exists btree_gist;     -- needed for the exclusion constraints

create type member_role    as enum ('owner', 'reception', 'provider');
create type business_type  as enum ('salon', 'clinic', 'tutor', 'garage', 'other');
create type booking_status as enum ('pending', 'confirmed', 'arrived', 'in_service',
                                    'completed', 'cancelled', 'no_show');
create type booking_source as enum ('public', 'staff', 'walk_in');
create type confirm_mode   as enum ('instant', 'approval');
create type time_display   as enum ('gregorian', 'both');          -- 'both' adds Ethiopian time
create type reminder_kind  as enum ('confirmation', 'reminder_24h', 'reminder_2h', 'reschedule', 'followup');
create type reminder_state as enum ('due', 'done', 'skipped');
create type event_type     as enum ('created', 'confirmed', 'moved', 'status_changed',
                                    'cancelled', 'note', 'reminder_done');
create type actor_kind     as enum ('staff', 'customer', 'system');
```

## 3. Tables

### 3.1 Identity and business

```sql
profiles      (id uuid pk -> auth.users, full_name text, locale text)
shops         (id uuid pk, owner_id uuid, name text, slug text unique, business_type business_type,
               locale text default 'en', timezone text default 'Africa/Addis_Ababa',
               slot_interval_min int default 15 check (slot_interval_min in (5,10,15,20,30,60)),
               lead_time_min int default 60 check (between 0 and 10080),
               horizon_days int default 30 check (between 1 and 180),
               cancel_cutoff_hours int default 2 check (between 0 and 168),
               confirm_mode confirm_mode default 'instant',
               max_active_per_phone int default 3 check (between 1 and 10),
               time_display time_display default 'gregorian',
               public_enabled boolean default true,
               public_note text check (char_length(public_note) <= 300),      -- address and instructions
               public_phone text check (char_length(public_phone) <= 30),     -- business contact shown publicly
               providers_manage_time_off boolean default false,
               created_at timestamptz,
               check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'))
shop_members  (shop_id, user_id, role member_role, display_name text, created_at, pk(shop_id, user_id))
shop_invites  (id, shop_id, code_hash bytea unique, role member_role check (role <> 'owner'),
               provider_id uuid null, expires_at, created_by, used_at, used_by)   -- hash only
audit_log     (id bigint, shop_id, actor, action, entity, entity_id, meta jsonb, created_at)
rate_limits   (key text, window_start timestamptz, hits int, pk(key, window_start))      -- no client access
shop_memory   (id, shop_id, kind in ('alias','preference','fact'), key, value, unique(shop_id, kind, key))
ai_usage      (id bigint, shop_id, user_id, agent, input_tokens, output_tokens, ok, created_at)
```

Reserved slugs (blocked in `create_shop` and `change_slug`): `admin`, `api`, `app`, `auth`, `b`, `m`, `book`, `login`, `www`, `support`, and similar. Changing a slug is audited.

### 3.2 Services, providers, schedules

```sql
providers (id uuid pk, shop_id, name text (1-60), color smallint (0-7), member_user_id uuid null,
           active boolean default true, sort int default 0, unique (shop_id, member_user_id))
services  (id uuid pk, shop_id, name text (1-80), description text (<=300),
           duration_min int check (between 5 and 480), buffer_min int default 0 check (between 0 and 120),
           price numeric(14,2) null check (>= 0), category text null, active boolean default true,
           approval_required boolean default false, sort int default 0, created_at, updated_at)
provider_services (provider_id, service_id, shop_id, pk(provider_id, service_id))
working_hours (id, shop_id, provider_id, weekday smallint check (between 1 and 7),   -- ISO: 1 = Monday
               start_time time, end_time time check (end_time > start_time),
               exclude using gist (provider_id with =, weekday with =,
                 tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&))
time_off  (id, shop_id, provider_id null,     -- null means the whole business is closed
           starts_at timestamptz, ends_at timestamptz check (ends_at > starts_at),
           reason text (<=120), created_by)
```

### 3.3 Customers

```sql
customers (id uuid pk, shop_id, name text (1-100), phone_e164 text, language text, notes text (<=500),
           no_show_count int default 0, require_approval boolean default false, blocked boolean default false,
           created_at, updated_at, unique (shop_id, phone_e164))
```

`customers` is the business's contact book (owner and reception only). Public bookings create or match a customer by phone inside the booking function.

### 3.4 Bookings

```sql
bookings (
  id uuid primary key,
  shop_id uuid not null references shops on delete cascade,
  provider_id uuid not null references providers,
  service_id uuid not null references services,
  customer_id uuid not null references customers,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  blocked_until timestamptz not null,           -- ends_at + service buffer
  during tstzrange generated always as (tstzrange(starts_at, blocked_until, '[)')) stored,
  status booking_status not null default 'confirmed',
  source booking_source not null,
  price numeric(14,2),                          -- snapshot at booking time
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users,        -- null for public bookings
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by actor_kind,
  cancel_reason text check (char_length(cancel_reason) <= 200),
  check (ends_at > starts_at),
  check (blocked_until >= ends_at),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  -- THE double-booking guard:
  constraint bookings_no_overlap
    exclude using gist (provider_id with =, during with &&)
    where (status in ('pending', 'confirmed', 'arrived', 'in_service'))
);

booking_contacts (booking_id uuid pk -> bookings on delete cascade, shop_id,
                  name text (1-100), phone_e164 text, language text,
                  manage_token text unique not null)   -- 128-bit random, base64url; never shown to the public except to its owner
booking_events (id bigint identity pk, booking_id, shop_id, type event_type, from_status booking_status,
                to_status booking_status, actor_kind actor_kind, actor uuid null, client_id uuid,
                meta jsonb, created_at,
                unique (shop_id, client_id) where client_id is not null)         -- append-only
reminders (id uuid pk, booking_id, shop_id, kind reminder_kind, due_at timestamptz,
           state reminder_state default 'due', done_by uuid, done_at timestamptz,
           unique (booking_id, kind))
booking_transitions (from_status, to_status, roles member_role[], customer_allowed boolean, pk(from_status, to_status))
```

`booking_transitions` is seeded from `02` section 5; a test asserts it equals `domain/status.ts`.

## 4. Helper functions

```sql
create function public.my_role(p_shop uuid) returns member_role ...            -- from shop_members
create function public.my_provider_id(p_shop uuid) returns uuid                -- providers.member_user_id = auth.uid()
create function public.is_member(p_shop uuid) returns boolean ...
create function public.has_role(p_shop uuid, p_roles member_role[]) returns boolean ...
create function public.can_see_booking(p_shop uuid, p_provider uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.my_role(p_shop)
           when 'owner' then true when 'reception' then true
           when 'provider' then p_provider is not distinct from public.my_provider_id(p_shop)
           else false end;
$$;
```

All are `security definer`, `stable`, with `search_path = ''`; policies call them with `(select auth.uid())` so the user id is evaluated once per query. Policy columns are indexed.

## 5. Row level security matrix

Actors: **anon** (public visitor), **outsider** (signed in, not in this business), **owner**, **reception**, **provider (own)**, **provider (other)**. "RPC only" means no direct client write.

| Table | anon | outsider | owner | reception | provider own / other |
|-------|------|----------|-------|-----------|----------------------|
| profiles | none | self | self | self | self |
| shops | none | none | R, update settings | R | R |
| shop_members | none | none | R, remove non-owner | R | R |
| shop_invites | none | none | R | none | none |
| audit_log | none | none | R | none | none |
| providers, services, provider_services, working_hours | none | none | R, W | R | R / R |
| time_off | none | none | R, W | R, W | R; own W if `providers_manage_time_off` / R |
| customers | none | none | R, W | R, W (notes) | none |
| bookings | none | none | R (RPC writes) | R (RPC writes) | R own / none |
| booking_contacts | none | none | R | R | R own / none |
| booking_events | none | none | R | R | R own / none |
| reminders | none | none | R (RPC mark done) | R (RPC) | R own / none |
| booking_transitions | none | R | R | R | R |
| shop_memory | none | none | R, W | R | none |
| ai_usage | none | none | R | none | none |
| rate_limits | none | none | none | none | none |

Direct writes allowed by policy and column grants: services, providers, hours, time off (owner; reception time off), shop settings (owner), customers (owner, reception notes only), shop_memory (owner), profile (self). Everything else is RPC only. The public never touches a table: Edge Functions run with the service role and call `public_*` functions that return minimal data.

## 6. RPC functions (one transaction each)

All validate arguments, check role, call `rate_limit_hit`, are idempotent, write an event, and raise short codes (`FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `SLOT_TAKEN`, `OUTSIDE_HOURS`, `TOO_SOON`, `TOO_FAR`, `INVALID_TRANSITION`, `CUTOFF_PASSED`, `LIMIT_REACHED`, `BLOCKED`, `CONFLICT`, `RATE_LIMITED`).

### 6.1 Staff functions (authenticated)

| Function | Who | What it does |
|----------|-----|--------------|
| `create_shop(name, type, slug, locale, tz)` | signed-in user | Creates business and owner membership; seeds sample services, a provider and typical hours by type |
| `check_slug(slug)` | signed-in | Format, reserved words, availability |
| `create_invite(shop, role, provider)` / `accept_invite(code)` | owner / signed-in | One-time code, hash stored, 48 h expiry; provider invites link the member to a provider |
| `delete_shop(shop)` | owner | Removes everything (sets a transaction flag so append-only triggers allow cascade) |
| `staff_slots(shop, service, provider, from_date, to_date)` | members | Same engine as the public function; returns compact starts per day |
| `create_booking(shop, id, service, provider, starts_at, contact jsonb, note, source)` | owner, reception, provider (own) | `book_slot` logic; staff may book inside lead time; provider "any" resolved fairly; customer created or matched; reminders generated; idempotent on `id` |
| `reschedule_booking(shop, booking, new_start, new_provider, expected_version, client_id)` | owner, reception, provider (own) | Re-validates availability, updates times in place (the exclusion constraint guards), re-times reminders, event `moved` |
| `cancel_booking(shop, booking, reason, client_id)` | owner, reception, provider (own) | Valid transition; skips open reminders; event |
| `set_booking_status(shop, booking, to, expected_from, client_id)` | by transition table | Role and ownership checks; `no_show` increments `customers.no_show_count`; `confirmed` from `pending`; event |
| `time_off_conflicts(shop, provider, from, to)` | owner, reception | Lists active bookings inside the range so they can be moved or cancelled |
| `complete_reminder(shop, reminder, client_id)` | owner, reception | Marks a task done; event |
| `block_customer`, `require_approval`, `export_customer`, `delete_customer` | owner | Audited |
| Reports: `dashboard_summary`, `utilization`, `popular_services`, `peak_hours`, `no_show_stats`, `cancellation_stats` | owner (provider: own numbers) | Read-only from ledgers |

### 6.2 Public functions (service role only; called by Edge Functions)

| Function | What it does |
|----------|--------------|
| `public_shop_info(slug)` | Name, public note and phone, services (name, duration, price, description), providers (name, color), rules the page needs (lead time, horizon, interval, cutoff), time zone, time display. No customer data. Returns "not found" for disabled businesses |
| `public_slots(slug, service, provider, from_date, to_date)` | Compact slots; maximum 14 days per call; same engine as staff |
| `public_create_booking(slug, service, provider, starts_at, name, phone, language, ip_hash)` | Validates; enforces blocked list, per-phone active cap (`LIMIT_REACHED`), approval mode (status `pending`); finds or creates customer; runs `book_slot`; creates contact with manage token; reminders; returns booking summary and token. On `SLOT_TAKEN` returns up to 5 alternatives |
| `public_get_booking(token)` | Minimal booking view: business name, service, provider name, times, status, price, whether reschedule and cancel are still allowed |
| `public_reschedule(token, new_start)` / `public_cancel(token, reason)` | Checks cutoff and availability; uses the same internal logic with actor `customer`; returns the new summary |

### 6.3 The booking core (internal `book_slot`)

```sql
-- Pseudocode of the single place where bookings are created or moved.
-- 1. Resolve the service (active, offered by the provider) and compute ends_at and blocked_until.
-- 2. If provider is null ("any"): lock candidate providers in a stable order and pick fairly:
--      fewest active bookings that day, then earliest free, then sort order.
-- 3. Check: inside the provider's working window in the business time zone (OUTSIDE_HOURS),
--           not inside time off (OUTSIDE_HOURS), start >= now + lead (TOO_SOON, staff may bypass),
--           start <= now + horizon (TOO_FAR), start on the slot grid.
-- 4. insert into bookings (...)  -- the exclusion constraint is the final guard.
--    on exclusion_violation -> raise SLOT_TAKEN (caller returns alternatives).
-- 5. Generate reminder tasks; insert event; return booking.
```

### 6.4 Slot engine (shape)

```sql
-- compute_slots(shop, service, provider|null, from_date, to_date) returns table(day date, provider_id uuid, starts timestamptz[])
-- For each provider (or the chosen one) offering the service, for each local date in range:
--   windows  = working_hours for that weekday, converted to timestamptz in the shop time zone
--   free     = windows minus time_off (shop-wide and provider) minus active bookings' during ranges
--   starts   = generate_series on the slot grid where tstzrange(start, start + duration) fits inside a free
--              window, and start >= now() + lead_time, and start <= now() + horizon
--   buffer   : the range [start, start + duration + buffer) must not overlap the next active booking
-- "Any" = union over providers, each start labelled with the fairness-chosen provider.
```

Responses are compact (arrays of timestamps per day). A parity test runs identical fixtures through this function and the TypeScript domain version.

## 7. Triggers and constraints

| Trigger or constraint | Purpose |
|-----------------------|---------|
| `bookings_no_overlap` (exclusion) | No two active bookings of a provider overlap, including buffers |
| `working_hours` exclusion | No overlapping working windows per provider and weekday |
| `immutable` on `booking_events` | Block UPDATE and DELETE (allowed only inside `delete_shop`) |
| `bookings_guard` (before update) | Blocks changes to `shop_id`, `created_by`, `source`, and blocks status changes outside the RPC (transaction flag) |
| `bookings_updated_at` | Keeps `updated_at` honest and bumps `version` |
| `reminders_retime` (inside RPC) | Re-times or skips reminders when a booking moves or is cancelled |
| `audit_*` | Price changes, role changes, slug changes, member removal, customer block, export and delete |

Privileges: `revoke all` on every table from `anon` and `authenticated`; grant select where the matrix allows; column-level insert and update only for services, providers, hours, time off, shop settings, customers notes and flags, shop_memory and profile.

## 8. Indexes

```sql
create index bookings_shop_start_idx     on bookings (shop_id, starts_at);
create index bookings_provider_start_idx on bookings (provider_id, starts_at) where status in ('pending','confirmed','arrived','in_service');
create index bookings_customer_idx       on bookings (customer_id, starts_at desc);
create index booking_contacts_phone_idx  on booking_contacts (shop_id, phone_e164);
create index reminders_due_idx           on reminders (shop_id, state, due_at);
create index time_off_idx                on time_off (shop_id, provider_id, starts_at);
create index working_hours_idx           on working_hours (provider_id, weekday);
create index customers_phone_idx         on customers (shop_id, phone_e164);
create index shop_members_user_idx       on shop_members (user_id);
create unique index shops_slug_uidx      on shops (slug);
```

## 9. Realtime

`bookings`, `booking_events` and `reminders` are in the realtime publication; `booking_contacts` is not (staff fetch contacts for visible bookings). Subscriptions filter by `shop_id`; RLS applies, so providers receive only their own bookings. Realtime never publishes a table whose rows are unsafe for any subscriber.

## 10. Invariants (checked nightly and in tests)

1. No two active bookings of one provider overlap (guaranteed by the constraint; the job double checks and alerts).
2. Every confirmed or pending future booking has its reminder tasks; cancelled bookings have none open.
3. Every booking has exactly one `created` event and a contact row with a unique token.
4. Every status in the timeline follows a legal transition.
5. `customers.no_show_count` equals the number of no-show bookings.
6. No active booking starts before the business's lead time rules allowed at creation (event meta stores the check inputs).
7. Cancelled bookings have `cancelled_at`; completed or no-show bookings are in the past.
8. Slugs are unique and valid.
9. No role can read a table the matrix denies (RLS test).

## 11. Retention and deletion

- Bookings and events are kept while the business exists; staff pulls are limited to a window (for example 7 days back, 60 days ahead); older history is fetched on demand.
- Deleting a business removes everything. Deleting a customer removes the contact details from their bookings (name becomes "Deleted customer") and keeps the booking times and statuses for reports.
- Manage tokens stop working 30 days after the appointment time.

## 12. Migration plan

| Migration | Contents |
|-----------|----------|
| 0001 | Extensions, enums, default privileges, helpers, rate limiter, immutability trigger |
| 0002 | profiles, shops (slug), members, invites, audit, `create_shop`, invites, `delete_shop` |
| 0003 | providers, services, provider_services, working_hours, time_off, templates |
| 0004 | customers; slot engine `compute_slots`, `staff_slots` |
| 0005 | bookings with the exclusion constraint, contacts, events, transitions, `book_slot`, `create_booking`, `reschedule_booking`, `cancel_booking`, `set_booking_status` |
| 0006 | public functions (`public_*`) and abuse controls |
| 0007 | reminders and their functions, approval mode |
| 0008 | reports |
| 0009 | memory, ai_usage |
| 0010 | realtime publication, lockdown, invariants job |
