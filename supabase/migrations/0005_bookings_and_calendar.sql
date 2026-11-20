-- Migration 0005: Bookings Core, Calendar, Status Machine, and Outbox RPCs
-- Implements the authoritative double-booking exclusion constraint, contacts, events, and RPC functions.

-- 1. Bookings Table
create table public.bookings (
  id uuid primary key,
  shop_id uuid not null references public.shops on delete cascade,
  provider_id uuid not null references public.providers,
  service_id uuid not null references public.services,
  customer_id uuid not null references public.customers,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  blocked_until timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, blocked_until, '[)')) stored,
  status public.booking_status not null default 'confirmed',
  source public.booking_source not null,
  price numeric(14,2),
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by public.actor_kind,
  cancel_reason text check (char_length(cancel_reason) <= 200),
  check (ends_at > starts_at),
  check (blocked_until >= ends_at),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  -- THE double-booking guard:
  constraint bookings_no_overlap
    exclude using gist (provider_id with =, during with &&)
    where (status in ('pending', 'confirmed', 'arrived', 'in_service'))
);

create index bookings_shop_starts_idx on public.bookings (shop_id, starts_at);
create index bookings_provider_during_idx on public.bookings using gist (provider_id, during);
create index bookings_customer_idx on public.bookings (customer_id);

-- 2. Booking Contacts Table
create table public.booking_contacts (
  booking_id uuid primary key references public.bookings on delete cascade,
  shop_id uuid not null references public.shops on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  phone_e164 text not null,
  language text not null default 'en',
  manage_token text unique not null
);

create index booking_contacts_shop_idx on public.booking_contacts (shop_id);
create index booking_contacts_token_idx on public.booking_contacts (manage_token);

-- 3. Booking Events Table (Append-only)
create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings on delete cascade,
  shop_id uuid not null references public.shops on delete cascade,
  type public.event_type not null,
  from_status public.booking_status,
  to_status public.booking_status,
  actor_kind public.actor_kind not null,
  actor uuid references auth.users,
  client_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, client_id)
);

create index booking_events_booking_idx on public.booking_events (booking_id, created_at);

-- Guard append-only on booking_events
create trigger trg_guard_booking_events
  before update or delete on public.booking_events
  for each row execute function public.guard_immutable_record();

-- 4. Booking Transitions Reference Table
create table public.booking_transitions (
  from_status public.booking_status not null,
  to_status public.booking_status not null,
  roles public.member_role[] not null,
  customer_allowed boolean not null default false,
  primary key (from_status, to_status)
);

-- Seed transitions matching domain/status.ts
insert into public.booking_transitions (from_status, to_status, roles, customer_allowed) values
  ('pending', 'confirmed', array['owner', 'reception']::public.member_role[], false),
  ('pending', 'cancelled', array['owner', 'reception']::public.member_role[], false),
  ('confirmed', 'arrived', array['owner', 'reception', 'provider']::public.member_role[], false),
  ('confirmed', 'in_service', array['owner', 'reception', 'provider']::public.member_role[], false),
  ('confirmed', 'completed', array['owner', 'reception', 'provider']::public.member_role[], false),
  ('confirmed', 'no_show', array['owner', 'reception', 'provider']::public.member_role[], false),
  ('confirmed', 'cancelled', array['owner', 'reception']::public.member_role[], true),
  ('arrived', 'in_service', array['owner', 'reception', 'provider']::public.member_role[], false),
  ('arrived', 'completed', array['owner', 'reception', 'provider']::public.member_role[], false),
  ('arrived', 'cancelled', array['owner', 'reception', 'provider']::public.member_role[], false),
  ('in_service', 'completed', array['owner', 'reception', 'provider']::public.member_role[], false);

-- 5. Row Level Security & Column Grants
alter table public.bookings enable row level security;
alter table public.booking_contacts enable row level security;
alter table public.booking_events enable row level security;
alter table public.booking_transitions enable row level security;

revoke all on public.bookings from anon, authenticated;
revoke all on public.booking_contacts from anon, authenticated;
revoke all on public.booking_events from anon, authenticated;
revoke all on public.booking_transitions from anon, authenticated;

grant select on public.bookings to authenticated;
grant select on public.booking_contacts to authenticated;
grant select on public.booking_events to authenticated;
grant select on public.booking_transitions to authenticated, anon;

grant all on public.bookings to service_role;
grant all on public.booking_contacts to service_role;
grant all on public.booking_events to service_role;
grant all on public.booking_transitions to service_role;

-- RLS: Providers only see their own bookings; owners/reception see all shop bookings
create policy bookings_select on public.bookings
  for select to authenticated
  using (public.can_see_booking(shop_id, provider_id));

create policy booking_contacts_select on public.booking_contacts
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and public.can_see_booking(b.shop_id, b.provider_id)
    )
  );

create policy booking_events_select on public.booking_events
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and public.can_see_booking(b.shop_id, b.provider_id)
    )
  );

create policy booking_transitions_select on public.booking_transitions
  for select to authenticated, anon
  using (true);

-- 6. RPC: create_booking
create or replace function public.create_booking(
  p_shop uuid,
  p_id uuid,
  p_service uuid,
  p_provider uuid,
  p_starts_at timestamptz,
  p_contact jsonb,
  p_note text default null,
  p_source public.booking_source default 'staff',
  p_client_id uuid default null
) returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_my_provider uuid;
  v_existing public.bookings%rowtype;
  v_service record;
  v_chosen_provider uuid := p_provider;
  v_duration int;
  v_buffer int;
  v_ends_at timestamptz;
  v_blocked_until timestamptz;
  v_cust_name text;
  v_cust_phone text;
  v_cust_lang text;
  v_customer_id uuid;
  v_new_booking public.bookings%rowtype;
  v_manage_token text;
  v_shop_tz text;
  v_day_of_week int;
  v_local_start time;
  v_local_end time;
  v_working_valid boolean := false;
begin
  -- Idempotency check: if booking already exists with p_id, return it
  select * into v_existing from public.bookings where id = p_id;
  if found then
    return v_existing;
  end if;

  -- Role verification
  v_role := public.my_role(p_shop);
  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  v_my_provider := public.my_provider_id(p_shop);
  if v_role = 'provider' and p_provider is not null and p_provider != v_my_provider then
    raise exception 'FORBIDDEN';
  end if;

  -- Load and validate service
  select id, duration_min, buffer_min, price, active
    into v_service
    from public.services
   where id = p_service and shop_id = p_shop;

  if not found or not v_service.active then
    raise exception 'NOT_FOUND';
  end if;

  v_duration := v_service.duration_min;
  v_buffer := coalesce(v_service.buffer_min, 0);
  v_ends_at := p_starts_at + (v_duration || ' minutes')::interval;
  v_blocked_until := v_ends_at + (v_buffer || ' minutes')::interval;

  -- Extract shop time zone
  select coalesce(time_zone, 'Africa/Addis_Ababa') into v_shop_tz
    from public.shops where id = p_shop;

  -- If provider is null ("any"), resolve fairly
  if v_chosen_provider is null then
    select p.id into v_chosen_provider
      from public.providers p
      join public.provider_services ps on ps.provider_id = p.id and ps.service_id = p_service
     where p.shop_id = p_shop and p.active = true
       and not exists (
         select 1 from public.time_off toff
          where (toff.provider_id = p.id or toff.provider_id is null)
            and toff.shop_id = p_shop
            and tstzrange(p_starts_at, v_blocked_until, '[)') && tstzrange(toff.starts_at, toff.ends_at, '[)')
       )
       and not exists (
         select 1 from public.bookings b
          where b.provider_id = p.id
            and b.status in ('pending', 'confirmed', 'arrived', 'in_service')
            and b.during && tstzrange(p_starts_at, v_blocked_until, '[)')
       )
     order by (
       select count(*) from public.bookings b2
        where b2.provider_id = p.id
          and b2.status in ('pending', 'confirmed', 'arrived', 'in_service')
          and b2.starts_at::date = p_starts_at::date
     ) asc, p.sort asc, p.id asc
     limit 1;

    if v_chosen_provider is null then
      raise exception 'SLOT_TAKEN';
    end if;
  end if;

  -- If provider was explicitly set, check provider offers the service
  if not exists (
    select 1 from public.provider_services
     where provider_id = v_chosen_provider and service_id = p_service
  ) then
    raise exception 'VALIDATION';
  end if;

  -- Validate working hours & time off
  v_day_of_week := extract(isodow from p_starts_at at time zone v_shop_tz);
  v_local_start := (p_starts_at at time zone v_shop_tz)::time;
  v_local_end := (v_ends_at at time zone v_shop_tz)::time;

  select true into v_working_valid
    from public.working_hours wh
   where wh.provider_id = v_chosen_provider
     and wh.weekday = v_day_of_week
     and wh.start_time <= v_local_start
     and wh.end_time >= v_local_end;

  if not coalesce(v_working_valid, false) and p_source = 'public' then
    raise exception 'OUTSIDE_HOURS';
  end if;

  if exists (
    select 1 from public.time_off toff
     where (toff.provider_id = v_chosen_provider or toff.provider_id is null)
       and toff.shop_id = p_shop
       and tstzrange(p_starts_at, v_blocked_until, '[)') && tstzrange(toff.starts_at, toff.ends_at, '[)')
  ) then
    raise exception 'OUTSIDE_HOURS';
  end if;

  -- Resolve or create customer
  v_cust_name := coalesce(trim(p_contact->>'name'), 'Walk-in Customer');
  v_cust_phone := coalesce(trim(p_contact->>'phone'), '');
  v_cust_lang := coalesce(nullif(trim(p_contact->>'language'), ''), 'en');

  if v_cust_phone != '' then
    select id into v_customer_id from public.customers
     where shop_id = p_shop and phone_e164 = v_cust_phone;

    if v_customer_id is null then
      insert into public.customers (shop_id, name, phone_e164, language)
      values (p_shop, v_cust_name, v_cust_phone, v_cust_lang)
      returning id into v_customer_id;
    end if;
  else
    -- Anonymous walk-in without phone
    select id into v_customer_id from public.customers
     where shop_id = p_shop and phone_e164 is null
     limit 1;

    if v_customer_id is null then
      insert into public.customers (shop_id, name, phone_e164, language)
      values (p_shop, v_cust_name, null, v_cust_lang)
      returning id into v_customer_id;
    end if;
  end if;

  -- Insert booking (handled inside exception block for exclusion constraint)
  begin
    insert into public.bookings (
      id, shop_id, provider_id, service_id, customer_id,
      starts_at, ends_at, blocked_until, status, source,
      price, note, created_by, version
    ) values (
      p_id, p_shop, v_chosen_provider, p_service, v_customer_id,
      p_starts_at, v_ends_at, v_blocked_until, 'confirmed', p_source,
      v_service.price, p_note, auth.uid(), 1
    ) returning * into v_new_booking;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
  end;

  -- Generate 128-bit random base64url manage token
  v_manage_token := replace(replace(encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_');
  v_manage_token := rtrim(v_manage_token, '=');

  insert into public.booking_contacts (
    booking_id, shop_id, name, phone_e164, language, manage_token
  ) values (
    p_id, p_shop, v_cust_name, v_cust_phone, v_cust_lang, v_manage_token
  );

  -- Record event
  insert into public.booking_events (
    booking_id, shop_id, type, to_status, actor_kind, actor, client_id, meta
  ) values (
    p_id, p_shop, 'created', 'confirmed', 'staff', auth.uid(), p_client_id,
    jsonb_build_object('source', p_source, 'service_id', p_service, 'provider_id', v_chosen_provider)
  );

  return v_new_booking;
end;
$$;

grant execute on function public.create_booking to authenticated;

-- 7. RPC: reschedule_booking
create or replace function public.reschedule_booking(
  p_shop uuid,
  p_booking uuid,
  p_new_start timestamptz,
  p_new_provider uuid default null,
  p_expected_version int default null,
  p_client_id uuid default null
) returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_b public.bookings%rowtype;
  v_my_provider uuid;
  v_provider uuid;
  v_service record;
  v_duration int;
  v_buffer int;
  v_new_end timestamptz;
  v_new_blocked timestamptz;
  v_updated public.bookings%rowtype;
begin
  select * into v_b from public.bookings where id = p_booking and shop_id = p_shop;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_role := public.my_role(p_shop);
  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  v_my_provider := public.my_provider_id(p_shop);
  if v_role = 'provider' and v_b.provider_id != v_my_provider then
    raise exception 'FORBIDDEN';
  end if;

  if v_b.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_expected_version is not null and v_b.version != p_expected_version then
    raise exception 'CONFLICT';
  end if;

  v_provider := coalesce(p_new_provider, v_b.provider_id);

  select duration_min, buffer_min into v_service
    from public.services where id = v_b.service_id;

  v_duration := v_service.duration_min;
  v_buffer := coalesce(v_service.buffer_min, 0);
  v_new_end := p_new_start + (v_duration || ' minutes')::interval;
  v_new_blocked := v_new_end + (v_buffer || ' minutes')::interval;

  -- Check time off
  if exists (
    select 1 from public.time_off toff
     where (toff.provider_id = v_provider or toff.provider_id is null)
       and toff.shop_id = p_shop
       and tstzrange(p_new_start, v_new_blocked, '[)') && tstzrange(toff.starts_at, toff.ends_at, '[)')
  ) then
    raise exception 'OUTSIDE_HOURS';
  end if;

  begin
    update public.bookings
       set starts_at = p_new_start,
           ends_at = v_new_end,
           blocked_until = v_new_blocked,
           provider_id = v_provider,
           version = version + 1,
           updated_at = now()
     where id = p_booking
     returning * into v_updated;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
  end;

  insert into public.booking_events (
    booking_id, shop_id, type, actor_kind, actor, client_id, meta
  ) values (
    p_booking, p_shop, 'moved', 'staff', auth.uid(), p_client_id,
    jsonb_build_object('old_start', v_b.starts_at, 'new_start', p_new_start, 'provider_id', v_provider)
  );

  return v_updated;
end;
$$;

grant execute on function public.reschedule_booking to authenticated;

-- 8. RPC: cancel_booking
create or replace function public.cancel_booking(
  p_shop uuid,
  p_booking uuid,
  p_reason text default null,
  p_client_id uuid default null
) returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_my_provider uuid;
  v_b public.bookings%rowtype;
  v_updated public.bookings%rowtype;
begin
  select * into v_b from public.bookings where id = p_booking and shop_id = p_shop;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_role := public.my_role(p_shop);
  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  v_my_provider := public.my_provider_id(p_shop);
  if v_role = 'provider' and v_b.provider_id != v_my_provider then
    raise exception 'FORBIDDEN';
  end if;

  -- Validate transition in booking_transitions
  if not exists (
    select 1 from public.booking_transitions
     where from_status = v_b.status
       and to_status = 'cancelled'
       and v_role = any(roles)
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'staff',
         cancel_reason = p_reason,
         version = version + 1,
         updated_at = now()
   where id = p_booking
   returning * into v_updated;

  insert into public.booking_events (
    booking_id, shop_id, type, from_status, to_status, actor_kind, actor, client_id, meta
  ) values (
    p_booking, p_shop, 'cancelled', v_b.status, 'cancelled', 'staff', auth.uid(), p_client_id,
    jsonb_build_object('reason', p_reason)
  );

  return v_updated;
end;
$$;

grant execute on function public.cancel_booking to authenticated;

-- 9. RPC: set_booking_status
create or replace function public.set_booking_status(
  p_shop uuid,
  p_booking uuid,
  p_to public.booking_status,
  p_expected_from public.booking_status default null,
  p_client_id uuid default null
) returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_my_provider uuid;
  v_b public.bookings%rowtype;
  v_updated public.bookings%rowtype;
begin
  select * into v_b from public.bookings where id = p_booking and shop_id = p_shop;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_role := public.my_role(p_shop);
  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  v_my_provider := public.my_provider_id(p_shop);
  if v_role = 'provider' and v_b.provider_id != v_my_provider then
    raise exception 'FORBIDDEN';
  end if;

  if p_expected_from is not null and v_b.status != p_expected_from then
    raise exception 'CONFLICT';
  end if;

  -- Validate transition
  if not exists (
    select 1 from public.booking_transitions
     where from_status = v_b.status
       and to_status = p_to
       and v_role = any(roles)
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- Update booking
  update public.bookings
     set status = p_to,
         confirmed_at = case when p_to = 'confirmed' and v_b.status = 'pending' then now() else confirmed_at end,
         version = version + 1,
         updated_at = now()
   where id = p_booking
   returning * into v_updated;

  -- If marked as no_show, increment customer count
  if p_to = 'no_show' then
    update public.customers
       set no_show_count = coalesce(no_show_count, 0) + 1,
           updated_at = now()
     where id = v_b.customer_id;
  end if;

  insert into public.booking_events (
    booking_id, shop_id, type, from_status, to_status, actor_kind, actor, client_id
  ) values (
    p_booking, p_shop, 'status_changed', v_b.status, p_to, 'staff', auth.uid(), p_client_id
  );

  return v_updated;
end;
$$;

grant execute on function public.set_booking_status to authenticated;

-- 10. RPC: time_off_conflicts (Real implementation replacing 0003 stub)
create or replace function public.time_off_conflicts(
  p_shop uuid,
  p_provider uuid,
  p_from timestamptz,
  p_to timestamptz
) returns table (
  booking_id uuid,
  customer_name text,
  customer_phone text,
  service_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.booking_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_shop) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select b.id as booking_id,
         c.name as customer_name,
         c.phone_e164 as customer_phone,
         s.name as service_name,
         b.starts_at,
         b.ends_at,
         b.status
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    join public.services s on s.id = b.service_id
   where b.shop_id = p_shop
     and (p_provider is null or b.provider_id = p_provider)
     and b.status in ('pending', 'confirmed', 'arrived', 'in_service')
     and b.during && tstzrange(p_from, p_to, '[)')
   order by b.starts_at asc;
end;
$$;

grant execute on function public.time_off_conflicts to authenticated;
