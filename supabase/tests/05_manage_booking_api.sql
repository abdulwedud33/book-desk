-- pgTAP Test Suite 05: Customer Manage API & Cutoff Enforcement
-- Tests public_get_booking, public_reschedule, public_cancel, cutoff rules, and 30-day expiry

begin;
select plan(12);

select tests.create_supabase_user('m6_owner', 'm6_owner@example.com');
select tests.authenticate_as('m6_owner');

-- Create shop with 2-hour cancel cutoff
select public.create_shop('M6 Manage Salon', 'salon', 'm6-manage-salon', 'en', 'Africa/Addis_Ababa');

set local search_path = public, auth;

create temp table m6_ctx as
select s.id as shop_id,
       srv.id as service_id,
       p.id as provider_id
  from shops s
  cross join lateral (select id from services where shop_id = s.id limit 1) srv
  cross join lateral (select id from providers where shop_id = s.id limit 1) p
 where s.slug = 'm6-manage-salon';

-- Add working hours for provider
insert into working_hours (shop_id, provider_id, weekday, start_time, end_time)
values
  ((select shop_id from m6_ctx), (select provider_id from m6_ctx), 1, '08:00'::time, '18:00'::time),
  ((select shop_id from m6_ctx), (select provider_id from m6_ctx), 2, '08:00'::time, '18:00'::time);

-- 1. Security Check: Authenticated users CANNOT call manage RPCs directly
select throws_matching(
  $$select public.public_get_booking('any-token')$$,
  'permission denied',
  'authenticated users cannot call public_get_booking directly'
);

-- Switch to service_role (simulates Edge Functions)
reset role;
set role service_role;

-- Create a future booking with manage token (Appointment in 24 hours)
create temp table m6_token_holder as
select (public.public_create_booking(
  'm6-manage-salon',
  (select service_id from m6_ctx),
  (select provider_id from m6_ctx),
  now() + interval '24 hours',
  'Customer With Token',
  '+251911554433',
  'en',
  'm6-ip-hash'
)->>'manage_token')::text as token;

-- 2. public_get_booking returns appointment details within cutoff
select is(
  (public.public_get_booking((select token from m6_token_holder))->>'shop_name')::text,
  'M6 Manage Salon',
  'public_get_booking returns shop name'
);

select is(
  (public.public_get_booking((select token from m6_token_holder))->>'can_reschedule')::boolean,
  true,
  'can_reschedule is true 24 hours before appointment'
);

select is(
  (public.public_get_booking((select token from m6_token_holder))->>'can_cancel')::boolean,
  true,
  'can_cancel is true 24 hours before appointment'
);

-- 3. Unknown token returns NOT_FOUND
select throws_matching(
  $$select public.public_get_booking('unknown-token-1234567890')$$,
  'NOT_FOUND',
  'unknown manage token raises NOT_FOUND'
);

-- 4. Expiry: Tokens expire 30 days after the appointment
create temp table m6_expired_holder as
select (public.public_create_booking(
  'm6-manage-salon',
  (select service_id from m6_ctx),
  (select provider_id from m6_ctx),
  now() + interval '2 hours',
  'Expired Customer',
  '+251911000111',
  'en',
  'm6-ip-hash'
)->>'manage_token')::text as token;

-- Artificially move appointment to 35 days in the past
update public.bookings
   set starts_at = now() - interval '35 days',
       ends_at = now() - interval '35 days' + interval '30 minutes',
       blocked_until = now() - interval '35 days' + interval '35 minutes'
 where id = (select booking_id from public.booking_contacts where manage_token = (select token from m6_expired_holder));

select throws_matching(
  format($$select public.public_get_booking('%s')$$, (select token from m6_expired_holder)),
  'NOT_FOUND',
  'tokens older than 30 days post-appointment raise NOT_FOUND'
);

-- 5. Cutoff Enforcement: Create appointment within cutoff (starts in 30 minutes, cutoff is 2 hours)
create temp table m6_close_holder as
select (public.public_create_booking(
  'm6-manage-salon',
  (select service_id from m6_ctx),
  (select provider_id from m6_ctx),
  now() + interval '3 hours',
  'Late Customer',
  '+251911999888',
  'en',
  'm6-ip-hash'
)->>'manage_token')::text as token;

-- Artificially move appointment to start in 30 minutes (past 2h cutoff)
update public.bookings
   set starts_at = now() + interval '30 minutes',
       ends_at = now() + interval '60 minutes',
       blocked_until = now() + interval '65 minutes'
 where id = (select booking_id from public.booking_contacts where manage_token = (select token from m6_close_holder));

select is(
  (public.public_get_booking((select token from m6_close_holder))->>'can_reschedule')::boolean,
  false,
  'can_reschedule is false when within cutoff window'
);

select throws_matching(
  format($$select public.public_reschedule('%s', now() + interval '48 hours')$$, (select token from m6_close_holder)),
  'CUTOFF_PASSED',
  'rescheduling past cutoff raises CUTOFF_PASSED on the server'
);

select throws_matching(
  format($$select public.public_cancel('%s', 'Too late')$$, (select token from m6_close_holder)),
  'CUTOFF_PASSED',
  'cancelling past cutoff raises CUTOFF_PASSED on the server'
);

-- 6. Valid Reschedule when within cutoff (Token from 24h booking)
select lives_ok(
  format($$select public.public_reschedule('%s', now() + interval '48 hours')$$, (select token from m6_token_holder)),
  'public_reschedule succeeds for booking well ahead of cutoff'
);

-- 7. Reschedule Guard: moving to an already occupied slot triggers SLOT_TAKEN (exclusion constraint)
-- Create conflicting booking at 48 hours
select public.public_create_booking(
  'm6-manage-salon',
  (select service_id from m6_ctx),
  (select provider_id from m6_ctx),
  now() + interval '72 hours',
  'Occupant',
  '+251922446688',
  'en',
  'm6-ip-hash'
);

-- Attempting to reschedule m6_token_holder to the 72h slot must throw SLOT_TAKEN
select throws_matching(
  format($$select public.public_reschedule('%s', now() + interval '72 hours')$$, (select token from m6_token_holder)),
  'SLOT_TAKEN',
  'reschedule into an occupied slot triggers SLOT_TAKEN via exclusion constraint'
);

-- 8. Valid Cancellation when within cutoff
select lives_ok(
  format($$select public.public_cancel('%s', 'Customer changed plans')$$, (select token from m6_token_holder)),
  'public_cancel succeeds within cutoff'
);

select * from finish();
rollback;
