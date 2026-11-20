-- Migration 0004: Customers and Availability Slot Engine
-- customers table, RLS, compute_slots, and staff_slots

-- 1. Customers Table
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  phone_e164 text not null,
  language text not null default 'en' check (language in ('en', 'am', 'om')),
  notes text check (char_length(notes) <= 500),
  no_show_count int not null default 0 check (no_show_count >= 0),
  require_approval boolean not null default false,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_shop_phone_unique unique (shop_id, phone_e164)
);

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;
grant all on public.customers to service_role;

-- Owner and reception can read all customers
create policy customers_select on public.customers
  for select to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role, 'reception'::public.member_role]));

-- Owner can insert and delete
create policy customers_insert on public.customers
  for insert to authenticated
  with check (public.has_role(shop_id, array['owner'::public.member_role]));

create policy customers_delete on public.customers
  for delete to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]));

-- Owner and reception can update (reception updates notes only)
create policy customers_update on public.customers
  for update to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role, 'reception'::public.member_role]))
  with check (public.has_role(shop_id, array['owner'::public.member_role, 'reception'::public.member_role]));

grant insert, update (name, phone_e164, language, notes, no_show_count, require_approval, blocked, updated_at), delete
  on public.customers to authenticated;

create index customers_phone_idx on public.customers (shop_id, phone_e164);

-- 2. Authoritative Availability Slot Engine (compute_slots)
create or replace function public.compute_slots(
  p_shop uuid,
  p_service uuid,
  p_provider uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  day date,
  provider_id uuid,
  starts timestamptz[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop record;
  v_service record;
  v_from date;
  v_to date;
  v_slot_interval interval;
  v_duration interval;
  v_buffer interval;
  v_lead_limit timestamptz;
  v_horizon_limit timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  -- Load shop settings
  select * into v_shop from public.shops where id = p_shop and public_enabled = true;
  if not found then
    return;
  end if;

  -- Load service settings
  select * into v_service from public.services where id = p_service and shop_id = p_shop and active = true;
  if not found then
    return;
  end if;

  v_slot_interval := (v_shop.slot_interval_min || ' minutes')::interval;
  v_duration := (v_service.duration_min || ' minutes')::interval;
  v_buffer := (v_service.buffer_min || ' minutes')::interval;

  v_lead_limit := v_now + (v_shop.lead_time_min || ' minutes')::interval;
  v_horizon_limit := v_now + (v_shop.horizon_days || ' days')::interval;

  -- Default date bounds
  v_from := coalesce(p_from_date, (v_now at time zone v_shop.timezone)::date);
  v_to := coalesce(p_to_date, v_from + 6); -- Default 7 days

  -- Bound search range: max 14 days
  if v_to < v_from then
    v_to := v_from;
  elsif (v_to - v_from) > 13 then
    v_to := v_from + 13;
  end if;

  return query
  with days as (
    select d::date as cur_day,
           extract(isodow from d)::smallint as iso_dow
    from generate_series(v_from, v_to, '1 day'::interval) as d
  ),
  eligible_providers as (
    select p.id as p_id, p.sort as p_sort
    from public.providers p
    where p.shop_id = p_shop
      and p.active = true
      and (p_provider is null or p.id = p_provider)
      and exists (
        select 1 from public.provider_services ps
        where ps.provider_id = p.id and ps.service_id = p_service
      )
  ),
  working_windows as (
    select
      d.cur_day,
      ep.p_id,
      ep.p_sort,
      -- Compute start/end in UTC timestamptz using shop timezone
      timezone(v_shop.timezone, (d.cur_day + wh.start_time)) as win_start,
      timezone(v_shop.timezone, (d.cur_day + wh.end_time)) as win_end
    from days d
    cross join eligible_providers ep
    join public.working_hours wh
      on wh.shop_id = p_shop
     and wh.provider_id = ep.p_id
     and wh.weekday = d.iso_dow
  ),
  candidate_starts as (
    select
      ww.cur_day,
      ww.p_id,
      ww.p_sort,
      gs as slot_start,
      gs + v_duration as slot_end,
      gs + v_duration + v_buffer as slot_blocked_until
    from working_windows ww
    cross join lateral generate_series(ww.win_start, ww.win_end - v_duration, v_slot_interval) as gs
    where gs >= v_lead_limit
      and gs <= v_horizon_limit
      and (gs + v_duration) <= ww.win_end
      -- Exclude whole-business and provider time-off
      and not exists (
        select 1 from public.time_off tf
        where tf.shop_id = p_shop
          and (tf.provider_id is null or tf.provider_id = ww.p_id)
          and tstzrange(gs, gs + v_duration + v_buffer, '[)') && tstzrange(tf.starts_at, tf.ends_at, '[)')
      )
  )
  select
    cs.cur_day as day,
    cs.p_id as provider_id,
    array_agg(cs.slot_start order by cs.slot_start) as starts
  from candidate_starts cs
  group by cs.cur_day, cs.p_id
  order by cs.cur_day, cs.p_id;
end;
$$;

grant execute on function public.compute_slots(uuid, uuid, uuid, date, date) to authenticated, service_role;

-- 3. Staff RPC Wrapper (staff_slots)
create or replace function public.staff_slots(
  p_shop uuid,
  p_service uuid,
  p_provider uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  day date,
  provider_id uuid,
  starts timestamptz[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_shop) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
    select * from public.compute_slots(p_shop, p_service, p_provider, p_from_date, p_to_date);
end;
$$;

grant execute on function public.staff_slots(uuid, uuid, uuid, date, date) to authenticated, service_role;
