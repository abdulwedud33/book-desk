-- =============================================================================
-- Migration 0009: Reporting and Analytics Ledgers
-- =============================================================================

-- 1. Helper: Validate Report Access & Resolve Provider
-- Owner has full access; Provider sees only own bookings; Others rejected.
create or replace function public.validate_report_caller(
  p_shop uuid,
  p_requested_provider uuid default null
) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_my_provider uuid;
begin
  v_role := public.my_role(p_shop);

  if v_role is null or v_role = 'reception' then
    raise exception 'FORBIDDEN';
  end if;

  if v_role = 'provider' then
    v_my_provider := public.my_provider_id(p_shop);
    if v_my_provider is null then
      raise exception 'FORBIDDEN';
    end if;
    -- Force provider to see only own numbers
    return v_my_provider;
  end if;

  -- Owner can view specific provider or all providers (null)
  return p_requested_provider;
end;
$$;

-- 2. RPC: report_dashboard_summary
create or replace function public.report_dashboard_summary(
  p_shop uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_provider uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_total int := 0;
  v_completed int := 0;
  v_confirmed int := 0;
  v_no_show int := 0;
  v_cancelled int := 0;
  v_revenue numeric(14,2) := 0;
  v_new_customers int := 0;
begin
  -- Rate limiting: 60 queries/min per user
  if not public.rate_limit_hit('report_' || (select auth.uid())::text, 60, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_provider := public.validate_report_caller(p_shop, p_provider);

  select
    count(*)::int,
    count(*) filter (where status = 'completed')::int,
    count(*) filter (where status in ('confirmed', 'arrived', 'in_service'))::int,
    count(*) filter (where status = 'no_show')::int,
    count(*) filter (where status = 'cancelled')::int,
    coalesce(sum(price) filter (where status = 'completed'), 0)
  into
    v_total,
    v_completed,
    v_confirmed,
    v_no_show,
    v_cancelled,
    v_revenue
  from public.bookings
  where shop_id = p_shop
    and starts_at >= p_from
    and starts_at <= p_to
    and (v_provider is null or provider_id = v_provider);

  -- Count new customers created in period
  select count(*)::int into v_new_customers
    from public.customers
   where shop_id = p_shop
     and created_at >= p_from
     and created_at <= p_to;

  return jsonb_build_object(
    'total_bookings', v_total,
    'completed_bookings', v_completed,
    'confirmed_bookings', v_confirmed,
    'no_show_bookings', v_no_show,
    'cancelled_bookings', v_cancelled,
    'total_revenue', v_revenue,
    'new_customers', v_new_customers,
    'no_show_rate', case when (v_completed + v_no_show) > 0
      then round((v_no_show::numeric / (v_completed + v_no_show)::numeric) * 100, 1)
      else 0 end,
    'cancellation_rate', case when v_total > 0
      then round((v_cancelled::numeric / v_total::numeric) * 100, 1)
      else 0 end
  );
end;
$$;

revoke all on function public.report_dashboard_summary from public;
grant execute on function public.report_dashboard_summary to authenticated;
grant execute on function public.report_dashboard_summary to service_role;

-- 3. RPC: report_popular_services
create or replace function public.report_popular_services(
  p_shop uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_provider uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_result jsonb;
begin
  if not public.rate_limit_hit('report_' || (select auth.uid())::text, 60, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_provider := public.validate_report_caller(p_shop, p_provider);

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
  from (
    select
      s.id as service_id,
      s.name as service_name,
      count(b.id)::int as booking_count,
      coalesce(sum(b.price) filter (where b.status = 'completed'), 0) as revenue
    from public.services s
    left join public.bookings b on b.service_id = s.id
      and b.shop_id = p_shop
      and b.starts_at >= p_from
      and b.starts_at <= p_to
      and (v_provider is null or b.provider_id = v_provider)
    where s.shop_id = p_shop
    group by s.id, s.name
    having count(b.id) > 0
    order by booking_count desc, revenue desc
    limit 10
  ) t;

  return v_result;
end;
$$;

revoke all on function public.report_popular_services from public;
grant execute on function public.report_popular_services to authenticated;
grant execute on function public.report_popular_services to service_role;

-- 4. RPC: report_utilization
create or replace function public.report_utilization(
  p_shop uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_provider uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_result jsonb;
begin
  if not public.rate_limit_hit('report_' || (select auth.uid())::text, 60, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_provider := public.validate_report_caller(p_shop, p_provider);

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
  from (
    select
      p.id as provider_id,
      p.name as provider_name,
      coalesce(sum(
        extract(epoch from (b.ends_at - b.starts_at)) / 60
      ) filter (where b.status in ('confirmed', 'completed', 'arrived', 'in_service')), 0)::int as scheduled_minutes,
      count(b.id)::int as total_bookings
    from public.providers p
    left join public.bookings b on b.provider_id = p.id
      and b.shop_id = p_shop
      and b.starts_at >= p_from
      and b.starts_at <= p_to
    where p.shop_id = p_shop
      and (v_provider is null or p.id = v_provider)
    group by p.id, p.name
    order by scheduled_minutes desc
  ) t;

  return v_result;
end;
$$;

revoke all on function public.report_utilization from public;
grant execute on function public.report_utilization to authenticated;
grant execute on function public.report_utilization to service_role;

-- 5. RPC: report_peak_hours
create or replace function public.report_peak_hours(
  p_shop uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_provider uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_tz text;
  v_result jsonb;
begin
  if not public.rate_limit_hit('report_' || (select auth.uid())::text, 60, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_provider := public.validate_report_caller(p_shop, p_provider);

  select time_zone into v_tz from public.shops where id = p_shop;
  v_tz := coalesce(v_tz, 'Africa/Addis_Ababa');

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
  from (
    select
      extract(hour from (starts_at at time zone v_tz))::int as hour_of_day,
      count(*)::int as booking_count
    from public.bookings
    where shop_id = p_shop
      and starts_at >= p_from
      and starts_at <= p_to
      and status in ('confirmed', 'arrived', 'in_service', 'completed')
      and (v_provider is null or provider_id = v_provider)
    group by hour_of_day
    order by hour_of_day asc
  ) t;

  return v_result;
end;
$$;

revoke all on function public.report_peak_hours from public;
grant execute on function public.report_peak_hours to authenticated;
grant execute on function public.report_peak_hours to service_role;

-- 6. RPC: report_cancellation_stats
create or replace function public.report_cancellation_stats(
  p_shop uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_provider uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_total_cancelled int := 0;
  v_by_customer int := 0;
  v_by_staff int := 0;
  v_by_system int := 0;
  v_avg_lead_hours numeric(10,1) := 0;
begin
  if not public.rate_limit_hit('report_' || (select auth.uid())::text, 60, interval '1 minute') then
    raise exception 'RATE_LIMITED';
  end if;

  v_provider := public.validate_report_caller(p_shop, p_provider);

  select
    count(*)::int,
    count(*) filter (where cancelled_by = 'customer')::int,
    count(*) filter (where cancelled_by = 'staff')::int,
    count(*) filter (where cancelled_by = 'system')::int,
    coalesce(round(avg(
      extract(epoch from (starts_at - coalesce(cancelled_at, starts_at))) / 3600
    )::numeric, 1), 0)
  into
    v_total_cancelled,
    v_by_customer,
    v_by_staff,
    v_by_system,
    v_avg_lead_hours
  from public.bookings
  where shop_id = p_shop
    and starts_at >= p_from
    and starts_at <= p_to
    and status = 'cancelled'
    and (v_provider is null or provider_id = v_provider);

  return jsonb_build_object(
    'total_cancelled', v_total_cancelled,
    'by_customer', v_by_customer,
    'by_staff', v_by_staff,
    'by_system', v_by_system,
    'avg_lead_hours', v_avg_lead_hours
  );
end;
$$;

revoke all on function public.report_cancellation_stats from public;
grant execute on function public.report_cancellation_stats to authenticated;
grant execute on function public.report_cancellation_stats to service_role;
