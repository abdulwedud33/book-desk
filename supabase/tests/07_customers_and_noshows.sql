-- =============================================================================
-- pgTAP Test: Customers CRM, No-show Accounting, and Deletion (Milestone M8)
-- =============================================================================

begin;
select plan(15);

-- 1. Setup test users and shop
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000081', 'owner81@test.com') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000082', 'reception82@test.com') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000083', 'outsider83@test.com') on conflict do nothing;

insert into public.shops (id, name, type, slug, time_zone, confirm_mode)
values ('10000000-0000-0000-0000-000000000008', 'CRM Shop', 'salon', 'crm-shop', 'Africa/Addis_Ababa', 'instant')
on conflict do nothing;

insert into public.shop_members (shop_id, user_id, role)
values ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000081', 'owner')
on conflict do nothing;

insert into public.shop_members (shop_id, user_id, role)
values ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000082', 'reception')
on conflict do nothing;

insert into public.services (id, shop_id, name, duration_min, buffer_min, active)
values ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'Haircut', 30, 0, true)
on conflict do nothing;

insert into public.providers (id, shop_id, name, active)
values ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'Provider Eight', true)
on conflict do nothing;

insert into public.customers (id, shop_id, name, phone_e164, language, no_show_count)
values ('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'Abebe NoShow', '+251911888888', 'en', 0)
on conflict do nothing;

-- 2. Test: Initial no_show_count is 0
select results_eq(
  $$ select no_show_count from public.customers where id = '40000000-0000-0000-0000-000000000008' $$,
  $$ values (0) $$,
  'Customer initial no_show_count is 0'
);

-- 3. Test: Inserting booking with status 'no_show' increments no_show_count
insert into public.bookings (
  id, shop_id, service_id, provider_id, customer_id, starts_at, ends_at, blocked_until, status, source
) values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000008',
  '20000000-0000-0000-0000-000000000008',
  '30000000-0000-0000-0000-000000000008',
  '40000000-0000-0000-0000-000000000008',
  now() - interval '2 days',
  now() - interval '2 days' + interval '30 minutes',
  now() - interval '2 days' + interval '30 minutes',
  'no_show',
  'staff'
);

select results_eq(
  $$ select no_show_count from public.customers where id = '40000000-0000-0000-0000-000000000008' $$,
  $$ values (1) $$,
  'Trigger automatically sets no_show_count to 1'
);

-- 4. Test: Second no_show booking increments count to 2
insert into public.bookings (
  id, shop_id, service_id, provider_id, customer_id, starts_at, ends_at, blocked_until, status, source
) values (
  '50000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000008',
  '20000000-0000-0000-0000-000000000008',
  '30000000-0000-0000-0000-000000000008',
  '40000000-0000-0000-0000-000000000008',
  now() - interval '1 day',
  now() - interval '1 day' + interval '30 minutes',
  now() - interval '1 day' + interval '30 minutes',
  'no_show',
  'staff'
);

select results_eq(
  $$ select no_show_count from public.customers where id = '40000000-0000-0000-0000-000000000008' $$,
  $$ values (2) $$,
  'Invariant holds: customers.no_show_count equals the number of no-show bookings (2)'
);

-- 5. Test: set_customer_blocked requires owner role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000082', true); -- reception
select throws_ok(
  $$ select public.set_customer_blocked('10000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008', true) $$,
  'FORBIDDEN',
  'Reception cannot block customers (owner only)'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true); -- owner
select lives_ok(
  $$ select public.set_customer_blocked('10000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008', true) $$,
  'Owner can block customers'
);

-- 6. Test: Block action recorded in audit_log
select results_eq(
  $$ select action from public.audit_log where entity_id = '40000000-0000-0000-0000-000000000008' order by id desc limit 1 $$,
  $$ values ('customer_blocked') $$,
  'Audit log contains customer_blocked entry'
);

-- 7. Test: Blocked phone number rejected at public booking endpoint
select throws_ok(
  $$ select public.public_create_booking(
       'crm-shop',
       '20000000-0000-0000-0000-000000000008',
       null,
       now() + interval '24 hours',
       'Blocked Person',
       '+251911888888',
       'en',
       'hash_ip'
     ) $$,
  'BLOCKED',
  'Public booking endpoint rejects blocked customer phone number with BLOCKED error'
);

-- 8. Test: Unblock customer and set require_approval
select public.set_customer_blocked('10000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008', false);
select public.set_customer_require_approval('10000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008', true);

select results_eq(
  $$ select require_approval from public.customers where id = '40000000-0000-0000-0000-000000000008' $$,
  $$ values (true) $$,
  'Customer require_approval flag set to true'
);

-- 9. Test: require_approval forces public booking into 'pending' status even if shop confirm_mode is 'instant'
-- Add working hours for provider on target day
insert into public.working_hours (id, shop_id, provider_id, weekday, start_time, end_time)
values (
  gen_random_uuid(),
  '10000000-0000-0000-0000-000000000008',
  '30000000-0000-0000-0000-000000000008',
  extract(isodow from (now() + interval '24 hours') at time zone 'Africa/Addis_Ababa')::smallint,
  '00:00'::time,
  '23:59'::time
);

select is(
  (public.public_create_booking(
     'crm-shop',
     '20000000-0000-0000-0000-000000000008',
     '30000000-0000-0000-0000-000000000008',
     now() + interval '24 hours',
     'Abebe Requires Approval',
     '+251911888888',
     'en',
     'hash_ip'
   )->>'status'),
  'pending',
  'require_approval forces public booking to pending status'
);

-- 10. Test: export_customer requires owner and writes audit_log
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true); -- owner
select is(
  (public.export_customer('10000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008')->'customer'->>'name'),
  'Abebe NoShow',
  'export_customer returns customer profile'
);

select results_eq(
  $$ select count(*)::int from public.audit_log where action = 'customer_exported' and entity_id = '40000000-0000-0000-0000-000000000008' $$,
  $$ values (1) $$,
  'Audit log contains customer_exported entry'
);

-- 11. Test: delete_customer deletes customer, unlinks booking_contacts, preserves booking times/statuses
select lives_ok(
  $$ select public.delete_customer('10000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008') $$,
  'delete_customer executes successfully'
);

-- Customer profile deleted
select results_eq(
  $$ select count(*)::int from public.customers where id = '40000000-0000-0000-0000-000000000008' $$,
  $$ values (0) $$,
  'Customer profile row is completely removed'
);

-- Bookings preserved with customer_id = null
select results_eq(
  $$ select count(*)::int from public.bookings where shop_id = '10000000-0000-0000-0000-000000000008' and customer_id is null $$,
  $$ values (3) $$,
  'Deletion behaviour: Bookings preserved in reports/calendar with customer_id set to null'
);

-- Audit entry recorded
select results_eq(
  $$ select count(*)::int from public.audit_log where action = 'customer_deleted' and entity_id = '40000000-0000-0000-0000-000000000008' $$,
  $$ values (1) $$,
  'Audit log contains customer_deleted entry'
);

select * from finish();
rollback;
