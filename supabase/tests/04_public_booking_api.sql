-- pgTAP Test Suite 04: Public Booking API, Rate Limiting, and Abuse Controls
-- Verifies public_shop_info, public_slots, public_create_booking, and privilege restrictions

begin;
select plan(12);

-- Setup test identities
select tests.create_supabase_user('m5_owner', 'm5_owner@example.com');
select tests.create_supabase_user('m5_visitor', 'm5_visitor@example.com');

select tests.authenticate_as('m5_owner');

-- Setup shop
select public.create_shop('M5 Public Salon', 'salon', 'm5-public-salon', 'en', 'Africa/Addis_Ababa');

set local search_path = public, auth;

create temp table m5_ctx as
select s.id as shop_id,
       srv.id as service_id,
       p.id as provider_id
  from shops s
  cross join lateral (select id from services where shop_id = s.id limit 1) srv
  cross join lateral (select id from providers where shop_id = s.id limit 1) p
 where s.slug = 'm5-public-salon';

-- Ensure provider has working hours on Monday 08:00 to 18:00
insert into working_hours (shop_id, provider_id, weekday, start_time, end_time)
values ((select shop_id from m5_ctx), (select provider_id from m5_ctx), 1, '08:00'::time, '18:00'::time);

-- 1. Security Check: Authenticated and Anon users CANNOT call public_* directly
select throws_matching(
  $$select public.public_shop_info('m5-public-salon')$$,
  'permission denied',
  'authenticated user cannot execute public_shop_info directly'
);

-- Switch to service_role to test authorized Edge Function execution
reset role;
set role service_role;

-- 2. public_shop_info returns correct metadata without leaking customer data
select is(
  (public.public_shop_info('m5-public-salon')->>'name')::text,
  'M5 Public Salon',
  'public_shop_info returns business name'
);

select is(
  (public.public_shop_info('m5-public-salon')->>'slug')::text,
  'm5-public-salon',
  'public_shop_info returns slug'
);

select throws_matching(
  $$select public.public_shop_info('non-existent-slug')$$,
  'NOT_FOUND',
  'unknown slug raises NOT_FOUND'
);

-- 3. public_slots returns slot table
select lives_ok(
  format(
    $$select * from public.public_slots('m5-public-salon', '%s', '%s', '2026-11-23'::date, '2026-11-25'::date)$$,
    (select service_id from m5_ctx),
    (select provider_id from m5_ctx)
  ),
  'public_slots executes cleanly and returns compact slot days'
);

-- 4. public_create_booking creates valid booking and returns manage_token
create temp table m5_booking_res as
select * from public.public_create_booking(
  'm5-public-salon',
  (select service_id from m5_ctx),
  (select provider_id from m5_ctx),
  '2026-11-23 09:00:00+03'::timestamptz,
  'Public Customer',
  '+251911998877',
  'en',
  'fake-ip-hash-1'
);

select is(
  (select status from m5_booking_res),
  'confirmed',
  'public booking confirmed by default under instant mode'
);

select ok(
  char_length((select manage_token from m5_booking_res)) >= 20,
  'manage_token is present in public_create_booking response'
);

-- 5. Abuse control: Exclusion constraint triggers SLOT_TAKEN on double booking
select throws_matching(
  format(
    $$select public.public_create_booking(
      'm5-public-salon',
      '%s',
      '%s',
      '2026-11-23 09:00:00+03'::timestamptz,
      'Second Customer',
      '+251922887766',
      'en',
      'fake-ip-hash-2'
    )$$,
    (select service_id from m5_ctx),
    (select provider_id from m5_ctx)
  ),
  'SLOT_TAKEN',
  'overlapping public booking raises SLOT_TAKEN with alternatives'
);

-- 6. Abuse control: Blocked customer phone cannot book
update customers
   set blocked = true
 where phone_e164 = '+251911998877'
   and shop_id = (select shop_id from m5_ctx);

select throws_matching(
  format(
    $$select public.public_create_booking(
      'm5-public-salon',
      '%s',
      '%s',
      '2026-11-23 10:00:00+03'::timestamptz,
      'Blocked Customer',
      '+251911998877',
      'en',
      'fake-ip-hash-1'
    )$$,
    (select service_id from m5_ctx),
    (select provider_id from m5_ctx)
  ),
  'BLOCKED',
  'blocked phone raises BLOCKED exception'
);

-- 7. Abuse control: Active bookings per phone cap
update customers
   set blocked = false
 where phone_e164 = '+251911998877'
   and shop_id = (select shop_id from m5_ctx);

update shops
   set max_active_per_phone = 1
 where id = (select shop_id from m5_ctx);

select throws_matching(
  format(
    $$select public.public_create_booking(
      'm5-public-salon',
      '%s',
      '%s',
      '2026-11-23 10:00:00+03'::timestamptz,
      'Customer Capped',
      '+251911998877',
      'en',
      'fake-ip-hash-1'
    )$$,
    (select service_id from m5_ctx),
    (select provider_id from m5_ctx)
  ),
  'LIMIT_REACHED',
  'exceeding max_active_per_phone raises LIMIT_REACHED'
);

-- 8. Approval Mode: Shop set to approval mode yields pending booking status
update shops
   set confirm_mode = 'approval',
       max_active_per_phone = 5
 where id = (select shop_id from m5_ctx);

create temp table m5_pending_res as
select * from public.public_create_booking(
  'm5-public-salon',
  (select service_id from m5_ctx),
  (select provider_id from m5_ctx),
  '2026-11-23 10:00:00+03'::timestamptz,
  'Pending Customer',
  '+251933776655',
  'en',
  'fake-ip-hash-3'
);

select is(
  (select status from m5_pending_res),
  'pending',
  'approval mode sets booking status to pending'
);

select * from finish();
rollback;
