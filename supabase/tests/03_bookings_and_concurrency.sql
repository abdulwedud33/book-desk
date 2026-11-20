-- pgTAP Test Suite 03: Bookings Core, Concurrency, and Status Machine
-- Tests the exclusion constraint, create_booking RPC, rescheduling, transitions, and provider isolation

begin;
select plan(16);

-- Setup test identities
select tests.create_supabase_user('m4_owner', 'm4_owner@example.com');
select tests.create_supabase_user('m4_provider_a', 'm4_provider_a@example.com');
select tests.create_supabase_user('m4_provider_b', 'm4_provider_b@example.com');
select tests.create_supabase_user('m4_outsider', 'm4_outsider@example.com');

select tests.authenticate_as('m4_owner');

-- Setup shop
select public.create_shop('M4 Test Salon', 'salon', 'm4-test-salon', 'en', 'Africa/Addis_Ababa');

set local search_path = public, auth;

-- Find created shop, service, and default provider
create temp table m4_context as
select s.id as shop_id,
       srv.id as service_id,
       p.id as provider_a_id
  from shops s
  cross join lateral (select id from services where shop_id = s.id limit 1) srv
  cross join lateral (select id from providers where shop_id = s.id limit 1) p
 where s.slug = 'm4-test-salon';

-- Link provider A to m4_provider_a
update providers
   set member_user_id = tests.get_supabase_uid('m4_provider_a')
 where id = (select provider_a_id from m4_context);

-- Create second provider B and link to m4_provider_b
insert into providers (shop_id, name, color, member_user_id, active)
values (
  (select shop_id from m4_context),
  'Provider B',
  2,
  tests.get_supabase_uid('m4_provider_b'),
  true
);

-- Link provider B to service
insert into provider_services (provider_id, service_id, shop_id)
values (
  (select id from providers where name = 'Provider B'),
  (select service_id from m4_context),
  (select shop_id from m4_context)
);

-- Give both providers working hours on Monday 08:00 to 18:00
insert into working_hours (shop_id, provider_id, weekday, start_time, end_time)
values
  ((select shop_id from m4_context), (select provider_a_id from m4_context), 1, '08:00'::time, '18:00'::time),
  ((select shop_id from m4_context), (select id from providers where name = 'Provider B'), 1, '08:00'::time, '18:00'::time);

-- 1. Test create_booking RPC success
select lives_ok(
  format(
    $$select public.create_booking('%s', '%s', '%s', '%s', '2026-11-23 09:00:00+03', '{"name":"Abebe","phone":"+251911223344"}'::jsonb)$$,
    (select shop_id from m4_context),
    '11111111-1111-1111-1111-111111111111'::uuid,
    (select service_id from m4_context),
    (select provider_a_id from m4_context)
  ),
  'create_booking creates valid booking for Provider A'
);

-- 2. Verify booking contacts and manage_token created
select is(
  (select name from public.booking_contacts where booking_id = '11111111-1111-1111-1111-111111111111'::uuid),
  'Abebe',
  'booking_contacts record exists with customer name'
);

select ok(
  char_length((select manage_token from public.booking_contacts where booking_id = '11111111-1111-1111-1111-111111111111'::uuid)) >= 20,
  'manage_token is generated and sufficiently random'
);

-- 3. Verify append-only booking event was logged
select is(
  (select type::text from public.booking_events where booking_id = '11111111-1111-1111-1111-111111111111'::uuid limit 1),
  'created',
  'booking_events logged created event'
);

-- 4. Idempotent replay: calling create_booking with same ID returns existing without error
select lives_ok(
  format(
    $$select public.create_booking('%s', '%s', '%s', '%s', '2026-11-23 09:00:00+03', '{"name":"Abebe","phone":"+251911223344"}'::jsonb)$$,
    (select shop_id from m4_context),
    '11111111-1111-1111-1111-111111111111'::uuid,
    (select service_id from m4_context),
    (select provider_a_id from m4_context)
  ),
  'idempotent replay returns existing booking'
);

-- 5. THE Double-booking exclusion constraint: attempt overlapping booking for Provider A fails with SLOT_TAKEN
select throws_matching(
  format(
    $$select public.create_booking('%s', '%s', '%s', '%s', '2026-11-23 09:15:00+03', '{"name":"Chala","phone":"+251922334455"}'::jsonb)$$,
    (select shop_id from m4_context),
    '22222222-2222-2222-2222-222222222222'::uuid,
    (select service_id from m4_context),
    (select provider_a_id from m4_context)
  ),
  'SLOT_TAKEN',
  'overlapping booking for same provider raises SLOT_TAKEN via exclusion constraint'
);

-- 6. Different provider (Provider B) CAN book the exact same time slot without collision
select lives_ok(
  format(
    $$select public.create_booking('%s', '%s', '%s', '%s', '2026-11-23 09:00:00+03', '{"name":"Dawit","phone":"+251933445566"}'::jsonb)$$,
    (select shop_id from m4_context),
    '33333333-3333-3333-3333-333333333333'::uuid,
    (select service_id from m4_context),
    (select id from providers where name = 'Provider B')
  ),
  'different provider can book overlapping time'
);

-- 7. Reschedule booking: valid move
select lives_ok(
  format(
    $$select public.reschedule_booking('%s', '%s', '2026-11-23 11:00:00+03')$$,
    (select shop_id from m4_context),
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  'reschedule_booking moves booking to 11:00'
);

-- 8. Reschedule booking into conflicting slot raises SLOT_TAKEN
select throws_matching(
  format(
    $$select public.reschedule_booking('%s', '%s', '2026-11-23 09:00:00+03', '%s')$$,
    (select shop_id from m4_context),
    '11111111-1111-1111-1111-111111111111'::uuid,
    (select id from providers where name = 'Provider B')
  ),
  'SLOT_TAKEN',
  'reschedule into Provider B occupied slot raises SLOT_TAKEN'
);

-- 9. Status transition: valid transition confirmed -> arrived
select lives_ok(
  format(
    $$select public.set_booking_status('%s', '%s', 'arrived')$$,
    (select shop_id from m4_context),
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  'valid status transition to arrived succeeds'
);

-- 10. Invalid status transition (arrived -> arrived or invalid target) raises INVALID_TRANSITION
select throws_matching(
  format(
    $$select public.set_booking_status('%s', '%s', 'pending')$$,
    (select shop_id from m4_context),
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  'INVALID_TRANSITION',
  'backward transition from arrived to pending raises INVALID_TRANSITION'
);

-- 11. No-show increments customer no_show_count
select lives_ok(
  format(
    $$select public.set_booking_status('%s', '%s', 'no_show')$$,
    (select shop_id from m4_context),
    '33333333-3333-3333-3333-333333333333'::uuid
  ),
  'setting status to no_show succeeds'
);

select is(
  (select no_show_count from public.customers where phone_e164 = '+251933445566'),
  1,
  'customer no_show_count incremented to 1'
);

-- 12. Cancel booking frees slot for new booking
select lives_ok(
  format(
    $$select public.cancel_booking('%s', '%s', 'Customer requested')$$,
    (select shop_id from m4_context),
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  'cancel_booking succeeds'
);

-- Slot at 11:00 is now free because status is cancelled
select lives_ok(
  format(
    $$select public.create_booking('%s', '%s', '%s', '%s', '2026-11-23 11:00:00+03', '{"name":"Freed Slot","phone":"+251944556677"}'::jsonb)$$,
    (select shop_id from m4_context),
    '44444444-4444-4444-4444-444444444444'::uuid,
    (select service_id from m4_context),
    (select provider_a_id from m4_context)
  ),
  'new booking succeeds on cancelled slot time'
);

-- 13. Provider Isolation in RLS: Provider A views bookings
select tests.authenticate_as('m4_provider_a');

-- Provider A can see their own bookings (booking 4444)
select is(
  (select count(*)::int from public.bookings where id = '44444444-4444-4444-4444-444444444444'::uuid),
  1,
  'Provider A can see their own booking'
);

-- Provider A CANNOT see Provider B's bookings (booking 3333)
select is(
  (select count(*)::int from public.bookings where id = '33333333-3333-3333-3333-333333333333'::uuid),
  0,
  'Provider A cannot see Provider B bookings (isolation)'
);

-- Provider A CANNOT see Provider B's contacts
select is(
  (select count(*)::int from public.booking_contacts where booking_id = '33333333-3333-3333-3333-333333333333'::uuid),
  0,
  'Provider A cannot see Provider B contacts (isolation)'
);

select * from finish();
rollback;
