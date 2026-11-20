-- =============================================================================
-- pgTAP Test: Reports and Analytics (Milestone M9)
-- =============================================================================

begin;
select plan(15);

-- 1. Setup test users and shop
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000091', 'owner91@test.com') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000092', 'reception92@test.com') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000093', 'provider93@test.com') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000094', 'outsider94@test.com') on conflict do nothing;

insert into public.shops (id, name, type, slug, time_zone)
values ('10000000-0000-0000-0000-000000000009', 'Reports Shop', 'salon', 'reports-shop', 'Africa/Addis_Ababa')
on conflict do nothing;

insert into public.shop_members (shop_id, user_id, role)
values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000091', 'owner')
on conflict do nothing;

insert into public.shop_members (shop_id, user_id, role)
values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000092', 'reception')
on conflict do nothing;

insert into public.shop_members (shop_id, user_id, role)
values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000093', 'provider')
on conflict do nothing;

-- Create provider linked to provider user
insert into public.providers (id, shop_id, name, member_user_id, active)
values ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'Provider Nine', '00000000-0000-0000-0000-000000000093', true)
on conflict do nothing;

insert into public.providers (id, shop_id, name, active)
values ('30000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000009', 'Other Provider', true)
on conflict do nothing;

insert into public.services (id, shop_id, name, duration_min, buffer_min, price, active)
values ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'Report Cut', 30, 0, 300, true)
on conflict do nothing;

-- 2. Test: Outsider and Reception rejected from reports
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000094', true); -- outsider
select throws_ok(
  $$ select public.report_dashboard_summary('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now()) $$,
  'FORBIDDEN',
  'Outsider cannot access report_dashboard_summary'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000092', true); -- reception
select throws_ok(
  $$ select public.report_dashboard_summary('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now()) $$,
  'FORBIDDEN',
  'Reception cannot access report_dashboard_summary (owner and provider only)'
);

-- 3. Seed bookings for reconciliation test
-- Booking 1: Completed, 300 ETB, Provider Nine
insert into public.bookings (
  id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, price, source
) values (
  '50000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000009',
  '20000000-0000-0000-0000-000000000009',
  '30000000-0000-0000-0000-000000000009',
  now() - interval '2 days',
  now() - interval '2 days' + interval '30 minutes',
  now() - interval '2 days' + interval '30 minutes',
  'completed',
  300,
  'staff'
);

-- Booking 2: No-show, Provider Nine
insert into public.bookings (
  id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, price, source
) values (
  '50000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000009',
  '20000000-0000-0000-0000-000000000009',
  '30000000-0000-0000-0000-000000000009',
  now() - interval '1 day',
  now() - interval '1 day' + interval '30 minutes',
  now() - interval '1 day' + interval '30 minutes',
  'no_show',
  300,
  'public'
);

-- Booking 3: Cancelled by customer, Provider Nine
insert into public.bookings (
  id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, price, source, cancelled_by, cancelled_at
) values (
  '50000000-0000-0000-0000-000000000013',
  '10000000-0000-0000-0000-000000000009',
  '20000000-0000-0000-0000-000000000009',
  '30000000-0000-0000-0000-000000000009',
  now() - interval '12 hours',
  now() - interval '12 hours' + interval '30 minutes',
  now() - interval '12 hours' + interval '30 minutes',
  'cancelled',
  300,
  'public',
  'customer',
  now() - interval '15 hours'
);

-- Booking 4: Completed, 300 ETB, Other Provider (provider 99)
insert into public.bookings (
  id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, price, source
) values (
  '50000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000009',
  '20000000-0000-0000-0000-000000000009',
  '30000000-0000-0000-0000-000000000099',
  now() - interval '1 day',
  now() - interval '1 day' + interval '30 minutes',
  now() - interval '1 day' + interval '30 minutes',
  'completed',
  300,
  'staff'
);

-- 4. Test: Owner sees all shop bookings reconciled with raw records
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', true); -- owner

select is(
  (public.report_dashboard_summary('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())->>'total_bookings')::int,
  4,
  'Owner report total_bookings equals 4'
);

select is(
  (public.report_dashboard_summary('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())->>'completed_bookings')::int,
  2,
  'Owner report completed_bookings equals 2'
);

select is(
  (public.report_dashboard_summary('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())->>'total_revenue')::numeric,
  600.00::numeric,
  'Owner report total_revenue equals completed sum (600 ETB)'
);

-- 5. Test: Provider sees only own bookings
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000093', true); -- provider 9

select is(
  (public.report_dashboard_summary('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())->>'total_bookings')::int,
  3,
  'Provider sees only own bookings (3), excluding other provider booking'
);

select is(
  (public.report_dashboard_summary('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())->>'total_revenue')::numeric,
  300.00::numeric,
  'Provider sees only own revenue (300 ETB)'
);

-- 6. Test: Popular services ledger
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', true); -- owner
select is(
  (public.report_popular_services('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())->0->>'service_name'),
  'Report Cut',
  'report_popular_services returns top service'
);

-- 7. Test: Utilization ledger
select is(
  jsonb_array_length(public.report_utilization('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())),
  2,
  'report_utilization returns metrics for both providers'
);

-- 8. Test: Cancellation stats
select is(
  (public.report_cancellation_stats('10000000-0000-0000-0000-000000000009', now() - interval '7 days', now())->>'by_customer')::int,
  1,
  'report_cancellation_stats records 1 cancellation by customer'
);

select * from finish();
rollback;
