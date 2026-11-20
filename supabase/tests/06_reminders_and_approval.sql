-- =============================================================================
-- pgTAP Test: Reminders and Approval Mode (Milestone M7)
-- =============================================================================

begin;
select plan(16);

-- 1. Table structure and RLS
select has_table('public', 'reminders', 'reminders table exists');
select has_column('public', 'reminders', 'id', 'reminders has id');
select has_column('public', 'reminders', 'booking_id', 'reminders has booking_id');
select has_column('public', 'reminders', 'kind', 'reminders has kind');
select has_column('public', 'reminders', 'due_at', 'reminders has due_at');
select has_column('public', 'reminders', 'state', 'reminders has state');

-- 2. Verify RLS is enabled on reminders
select results_eq(
  $$ select relrowsecurity from pg_class join pg_namespace n on n.oid = pg_class.relnamespace where relname = 'reminders' and n.nspname = 'public' $$,
  $$ values (true) $$,
  'RLS is enabled on public.reminders'
);

-- 3. Anonymous direct select is empty / denied
set role anon;
select throws_ok(
  $$ select count(*) from public.reminders $$,
  '42501',
  null,
  'anon has no SELECT privilege on public.reminders'
);
reset role;

-- Setup test shop, service, provider
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000071', 'owner71@test.com') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000072', 'outsider72@test.com') on conflict do nothing;

insert into public.shops (id, name, type, slug, time_zone, confirm_mode)
values ('10000000-0000-0000-0000-000000000007', 'Reminder Shop', 'salon', 'reminder-shop', 'Africa/Addis_Ababa', 'approval')
on conflict do nothing;

insert into public.shop_members (shop_id, user_id, role)
values ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000071', 'owner')
on conflict do nothing;

insert into public.services (id, shop_id, name, duration_min, buffer_min, active)
values ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'Test Service', 30, 0, true)
on conflict do nothing;

insert into public.providers (id, shop_id, name, active)
values ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'Provider Seven', true)
on conflict do nothing;

-- 4. Test: Insert booking creates reminder tasks via trigger
insert into public.bookings (
  id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, source
) values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000007',
  '20000000-0000-0000-0000-000000000007',
  '30000000-0000-0000-0000-000000000007',
  now() + interval '48 hours',
  now() + interval '48 hours 30 minutes',
  now() + interval '48 hours 30 minutes',
  'confirmed',
  'staff'
);

select results_eq(
  $$ select count(*)::int from public.reminders where booking_id = '40000000-0000-0000-0000-000000000001' and state = 'due' $$,
  $$ values (3) $$,
  'Trigger automatically creates confirmation, 24h, and 2h reminders for 48h future booking'
);

-- 5. Test: Rescheduling re-times reminders and creates reschedule task
update public.bookings
   set starts_at = now() + interval '5 hours',
       ends_at = now() + interval '5 hours 30 minutes',
       blocked_until = now() + interval '5 hours 30 minutes'
 where id = '40000000-0000-0000-0000-000000000001';

select results_eq(
  $$ select state from public.reminders where booking_id = '40000000-0000-0000-0000-000000000001' and kind = 'reminder_24h' $$,
  $$ values ('skipped'::public.reminder_state) $$,
  'Past 24h reminder is marked skipped when rescheduled inside 24 hours'
);

select results_eq(
  $$ select count(*)::int from public.reminders where booking_id = '40000000-0000-0000-0000-000000000001' and kind = 'reschedule' and state = 'due' $$,
  $$ values (1) $$,
  'Reschedule reminder task is automatically created for staff'
);

-- 6. Test: Cancellation marks all due reminders skipped
update public.bookings
   set status = 'cancelled',
       cancelled_at = now(),
       cancelled_by = 'staff'
 where id = '40000000-0000-0000-0000-000000000001';

select results_eq(
  $$ select count(*)::int from public.reminders where booking_id = '40000000-0000-0000-0000-000000000001' and state = 'due' $$,
  $$ values (0) $$,
  'No due reminders remain open for cancelled bookings'
);

-- 7. Test: Approval mode pending booking still blocks the slot
insert into public.bookings (
  id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, source
) values (
  '40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000007',
  '20000000-0000-0000-0000-000000000007',
  '30000000-0000-0000-0000-000000000007',
  now() + interval '72 hours',
  now() + interval '72 hours 30 minutes',
  now() + interval '72 hours 30 minutes',
  'pending',
  'public'
);

-- Attempt overlapping booking for the same provider
select throws_ok(
  $$ insert into public.bookings (
       id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, source
     ) values (
       '40000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000007',
       '20000000-0000-0000-0000-000000000007',
       '30000000-0000-0000-0000-000000000007',
       now() + interval '72 hours 15 minutes',
       now() + interval '72 hours 45 minutes',
       now() + interval '72 hours 45 minutes',
       'confirmed',
       'staff'
     ) $$,
  '23P01',
  null,
  'Pending booking blocks the slot: overlapping insert fails with exclusion constraint'
);

-- 8. Test: complete_reminder RPC role check and execution
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', true); -- outsider
select throws_ok(
  $$ select public.complete_reminder(
       '10000000-0000-0000-0000-000000000007',
       (select id from public.reminders limit 1)
     ) $$,
  'FORBIDDEN',
  'Outsider cannot complete reminders'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true); -- owner
select lives_ok(
  $$ select public.complete_reminder(
       '10000000-0000-0000-0000-000000000007',
       (select id from public.reminders limit 1)
     ) $$,
  'Owner can complete reminders'
);

-- 9. Test: Event logged for complete_reminder
select results_eq(
  $$ select count(*)::int from public.booking_events where event_type = 'reminder_done' $$,
  $$ values (1) $$,
  'reminder_done event is recorded in append-only booking_events'
);

-- 10. Test: expire_pending_bookings cancels expired pending bookings
insert into public.bookings (
  id, shop_id, service_id, provider_id, starts_at, ends_at, blocked_until, status, source, created_at
) values (
  '40000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000007',
  '20000000-0000-0000-0000-000000000007',
  '30000000-0000-0000-0000-000000000007',
  now() + interval '30 minutes', -- within lead time
  now() + interval '60 minutes',
  now() + interval '60 minutes',
  'pending',
  'public',
  now() - interval '25 hours' -- older than 24h
);

select (public.expire_pending_bookings('10000000-0000-0000-0000-000000000007')->>'expired_count')::int = 1 as expired;

select is(
  (select status from public.bookings where id = '40000000-0000-0000-0000-000000000004'),
  'cancelled'::public.booking_status,
  'Expired pending booking has status cancelled'
);

select * from finish();
rollback;
