-- supabase/tests/10_hardening_and_invariants.sql
-- pgTAP tests for realtime audit, privilege lockdown, and nightly invariants.

begin;
select plan(12);

-- 1. Realtime publication audit
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'bookings'
  ),
  'bookings is published in supabase_realtime'
);

select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'booking_contacts'
  ),
  'booking_contacts is NOT published in supabase_realtime (privacy audit)'
);

select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'customers'
  ),
  'customers table is NOT published in supabase_realtime'
);

select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'shop_memory'
  ),
  'shop_memory is NOT published in supabase_realtime'
);

-- 2. Privilege lockdown: verify anon has 0 table permissions
select is(
  (
    select count(*)::int
    from information_schema.table_privileges
    where grantee = 'anon' and table_schema = 'public'
  ),
  0,
  'anon has zero table privileges in public schema'
);

-- 3. Invariants execution test
select ok(
  (select count(*) >= 9 from public.check_nightly_invariants()),
  'check_nightly_invariants returns all 9 invariant checks'
);

select is(
  (select count(*)::int from public.check_nightly_invariants() where pass = false),
  0,
  'All 9 database invariants pass with zero failures'
);

-- 4. Specific invariant verification
select is(
  (select pass from public.check_nightly_invariants() where invariant_name = 'no_overlapping_active_bookings'),
  true,
  'Invariant: no_overlapping_active_bookings passes'
);

select is(
  (select pass from public.check_nightly_invariants() where invariant_name = 'reminder_tasks_consistency'),
  true,
  'Invariant: reminder_tasks_consistency passes'
);

select is(
  (select pass from public.check_nightly_invariants() where invariant_name = 'customer_no_show_count_sync'),
  true,
  'Invariant: customer_no_show_count_sync passes'
);

select is(
  (select pass from public.check_nightly_invariants() where invariant_name = 'unique_and_valid_slugs'),
  true,
  'Invariant: unique_and_valid_slugs passes'
);

select is(
  (select pass from public.check_nightly_invariants() where invariant_name = 'rls_enabled_all_tables'),
  true,
  'Invariant: rls_enabled_all_tables passes'
);

select * from finish();
rollback;
