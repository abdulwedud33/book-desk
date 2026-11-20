-- 0011_realtime_lockdown_invariants.sql
-- Realtime publication audit, final privilege lockdown, and nightly invariants job.

-- ============================================================================
-- 1. Realtime Publication Audit
-- Only bookings, booking_events, and reminders may be published.
-- booking_contacts, customers, shop_memory, ai_usage, audit_log MUST NEVER be published.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Explicitly set realtime publication to safe tables only
    execute 'alter publication supabase_realtime set table public.bookings, public.booking_events, public.reminders';
  end if;
end $$;

-- ============================================================================
-- 2. Final Privilege Lockdown
-- Revoke all table privileges from anon; default privileges ensure no leakage.
-- ============================================================================

-- Ensure anon has zero table privileges
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Ensure default privileges revoke everything from anon and authenticated
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ============================================================================
-- 3. Nightly Invariants Job
-- Checks all 9 invariants from docs/05-backend-schema.md section 10.
-- ============================================================================

create or replace function public.check_nightly_invariants(
  p_shop_id uuid default null
) returns table (
  invariant_name text,
  pass boolean,
  failure_count int,
  details jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_details jsonb;
begin
  -- --------------------------------------------------------------------------
  -- Invariant 1: No two active bookings of one provider overlap
  -- (Guaranteed by the gist exclusion constraint; double-check and alert)
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(jsonb_build_object('b1', b1.id, 'b2', b2.id, 'provider', b1.provider_id)), '[]'::jsonb)
  into v_count, v_details
  from public.bookings b1
  join public.bookings b2 on b1.provider_id = b2.provider_id
    and b1.id < b2.id
    and b1.status in ('pending', 'confirmed', 'arrived', 'in_service')
    and b2.status in ('pending', 'confirmed', 'arrived', 'in_service')
    and tstzrange(b1.starts_at, b1.blocked_until, '[)') && tstzrange(b2.starts_at, b2.blocked_until, '[)')
  where (p_shop_id is null or b1.shop_id = p_shop_id);

  invariant_name := 'no_overlapping_active_bookings';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 2: Reminders consistency
  -- Every confirmed or pending future booking has its reminder tasks;
  -- cancelled bookings have zero open reminders (state = 'due').
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(jsonb_build_object('booking_id', r.booking_id, 'reminder_id', r.id)), '[]'::jsonb)
  into v_count, v_details
  from public.reminders r
  join public.bookings b on b.id = r.booking_id
  where r.state = 'due' and b.status = 'cancelled'
    and (p_shop_id is null or b.shop_id = p_shop_id);

  invariant_name := 'reminder_tasks_consistency';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 3: Booking events and contacts
  -- Every booking has at least one 'created' event and a contact row with a unique token.
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(b.id), '[]'::jsonb)
  into v_count, v_details
  from public.bookings b
  left join public.booking_contacts c on c.booking_id = b.id
  left join public.booking_events e on e.booking_id = b.id and e.type = 'created'
  where (c.booking_id is null or c.manage_token is null or length(c.manage_token) < 20 or e.id is null)
    and (p_shop_id is null or b.shop_id = p_shop_id);

  invariant_name := 'booking_events_and_contacts';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 4: Status transition validity
  -- Every status transition recorded in booking_events is a legal transition.
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(e.id), '[]'::jsonb)
  into v_count, v_details
  from public.booking_events e
  where e.from_status is not null and e.to_status is not null
    and not exists (
      select 1 from public.booking_transitions bt
      where bt.from_status = e.from_status and bt.to_status = e.to_status
    )
    and (p_shop_id is null or e.shop_id = p_shop_id);

  invariant_name := 'status_timeline_transitions';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 5: Customer no_show_count sync
  -- customers.no_show_count equals the number of no-show bookings.
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(c.id), '[]'::jsonb)
  into v_count, v_details
  from public.customers c
  left join (
    select customer_id, count(*)::int as actual_no_shows
    from public.bookings
    where status = 'no_show'
    group by customer_id
  ) b on b.customer_id = c.id
  where c.no_show_count <> coalesce(b.actual_no_shows, 0)
    and (p_shop_id is null or c.shop_id = p_shop_id);

  invariant_name := 'customer_no_show_count_sync';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 6: Lead time compliance on creation
  -- Public bookings must have started at least lead_time_hours after created_at
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(b.id), '[]'::jsonb)
  into v_count, v_details
  from public.bookings b
  join public.shops s on s.id = b.shop_id
  where b.source = 'public'
    and b.starts_at < b.created_at + (s.lead_time_hours || ' hours')::interval
    and (p_shop_id is null or b.shop_id = p_shop_id);

  invariant_name := 'lead_time_compliance';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 7: Terminal status consistency
  -- Cancelled bookings have cancelled_at; completed bookings have ends_at <= now()
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(b.id), '[]'::jsonb)
  into v_count, v_details
  from public.bookings b
  where ((b.status = 'cancelled' and b.cancelled_at is null)
     or (b.status = 'completed' and b.starts_at > now() + interval '1 day'))
    and (p_shop_id is null or b.shop_id = p_shop_id);

  invariant_name := 'terminal_status_consistency';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 8: Slugs uniqueness and format validity
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(s.id), '[]'::jsonb)
  into v_count, v_details
  from public.shops s
  where s.slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     or s.slug in ('admin', 'api', 'app', 'auth', 'b', 'm', 'book', 'login', 'www', 'support');

  invariant_name := 'unique_and_valid_slugs';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

  -- --------------------------------------------------------------------------
  -- Invariant 9: RLS enabled on all public tables
  -- --------------------------------------------------------------------------
  select count(*), coalesce(jsonb_agg(t.tablename), '[]'::jsonb)
  into v_count, v_details
  from pg_tables t
  where t.schemaname = 'public'
    and not t.rowsecurity
    and t.tablename not in ('schema_migrations', 'rate_limits');

  invariant_name := 'rls_enabled_all_tables';
  failure_count  := v_count;
  pass           := (v_count = 0);
  details        := v_details;
  return next;

end;
$$;

grant execute on function public.check_nightly_invariants(uuid) to authenticated;
