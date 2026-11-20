-- Migration 0003: Services, Providers, Schedules, and Time Off
-- Tables, btree_gist working_hours exclusion constraint, time_off, templates, and RLS

-- 1. Providers Table
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color smallint not null default 0 check (color between 0 and 7),
  member_user_id uuid null references auth.users on delete set null,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint providers_shop_member_unique unique (shop_id, member_user_id)
);

alter table public.providers enable row level security;
revoke all on public.providers from anon, authenticated;
grant select on public.providers to authenticated;
grant all on public.providers to service_role;

create policy providers_select on public.providers
  for select to authenticated
  using (public.is_member(shop_id));

create policy providers_insert on public.providers
  for insert to authenticated
  with check (public.has_role(shop_id, array['owner'::public.member_role]));

create policy providers_update on public.providers
  for update to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]))
  with check (public.has_role(shop_id, array['owner'::public.member_role]));

create policy providers_delete on public.providers
  for delete to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]));

grant insert, update (name, color, member_user_id, active, sort), delete
  on public.providers to authenticated;

-- 2. Services Table
create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  duration_min int not null check (duration_min between 5 and 480),
  buffer_min int not null default 0 check (buffer_min between 0 and 120),
  price numeric(14,2) null check (price >= 0),
  category text null,
  active boolean not null default true,
  approval_required boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.services enable row level security;
revoke all on public.services from anon, authenticated;
grant select on public.services to authenticated;
grant all on public.services to service_role;

create policy services_select on public.services
  for select to authenticated
  using (public.is_member(shop_id));

create policy services_insert on public.services
  for insert to authenticated
  with check (public.has_role(shop_id, array['owner'::public.member_role]));

create policy services_update on public.services
  for update to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]))
  with check (public.has_role(shop_id, array['owner'::public.member_role]));

create policy services_delete on public.services
  for delete to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]));

grant insert, update (
  name, description, duration_min, buffer_min, price, category,
  active, approval_required, sort, updated_at
) on public.services to authenticated;

-- 3. Provider Services Mapping
create table public.provider_services (
  provider_id uuid not null references public.providers on delete cascade,
  service_id uuid not null references public.services on delete cascade,
  shop_id uuid not null references public.shops on delete cascade,
  constraint provider_services_pkey primary key (provider_id, service_id)
);

alter table public.provider_services enable row level security;
revoke all on public.provider_services from anon, authenticated;
grant select on public.provider_services to authenticated;
grant all on public.provider_services to service_role;

create policy provider_services_select on public.provider_services
  for select to authenticated
  using (public.is_member(shop_id));

create policy provider_services_write on public.provider_services
  for all to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]))
  with check (public.has_role(shop_id, array['owner'::public.member_role]));

grant insert, delete on public.provider_services to authenticated;

-- 4. Working Hours with Split Shift Exclusion Constraint
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  provider_id uuid not null references public.providers on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = Monday, 7 = Sunday
  start_time time not null,
  end_time time not null check (end_time > start_time),
  constraint working_hours_no_overlap exclude using gist (
    provider_id with =,
    weekday with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
  )
);

alter table public.working_hours enable row level security;
revoke all on public.working_hours from anon, authenticated;
grant select on public.working_hours to authenticated;
grant all on public.working_hours to service_role;

create policy working_hours_select on public.working_hours
  for select to authenticated
  using (public.is_member(shop_id));

create policy working_hours_write on public.working_hours
  for all to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]))
  with check (public.has_role(shop_id, array['owner'::public.member_role]));

grant insert, update, delete on public.working_hours to authenticated;

-- 5. Time Off Table
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  provider_id uuid null references public.providers on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text check (char_length(reason) <= 120),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

alter table public.time_off enable row level security;
revoke all on public.time_off from anon, authenticated;
grant select on public.time_off to authenticated;
grant all on public.time_off to service_role;

create policy time_off_select on public.time_off
  for select to authenticated
  using (public.is_member(shop_id));

create policy time_off_insert on public.time_off
  for insert to authenticated
  with check (
    public.has_role(shop_id, array['owner'::public.member_role, 'reception'::public.member_role])
    or (
      provider_id = public.my_provider_id(shop_id)
      and exists (
        select 1 from public.shops s
        where s.id = time_off.shop_id and s.providers_manage_time_off = true
      )
    )
  );

create policy time_off_delete on public.time_off
  for delete to authenticated
  using (
    public.has_role(shop_id, array['owner'::public.member_role, 'reception'::public.member_role])
    or (
      provider_id = public.my_provider_id(shop_id)
      and exists (
        select 1 from public.shops s
        where s.id = time_off.shop_id and s.providers_manage_time_off = true
      )
    )
  );

grant insert, delete on public.time_off to authenticated;

-- 6. Helper Function Updates
create or replace function public.my_provider_id(p_shop uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.providers
  where shop_id = p_shop and member_user_id = (select auth.uid()) and active = true
  limit 1;
$$;

-- 7. Time Off Conflicts (Stub for M2; returns active bookings in range once bookings exist in M4)
create or replace function public.time_off_conflicts(
  p_shop uuid,
  p_provider uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  booking_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  customer_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_shop) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Bookings table created in M4; returning empty set for M2
  return query
    select null::uuid, null::timestamptz, null::timestamptz, null::text
    where false;
end;
$$;

grant execute on function public.time_off_conflicts(uuid, uuid, timestamptz, timestamptz) to authenticated, service_role;

-- 8. Business Templates Seeder Function
create or replace function public.seed_shop_template(p_shop uuid, p_type public.business_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
  v_service_id uuid;
  v_d smallint;
begin
  if not public.has_role(p_shop, array['owner'::public.member_role]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_type = 'salon' then
    insert into public.providers (shop_id, name, color, sort)
    values (p_shop, 'Samson T.', 0, 0) returning id into v_provider_id;

    insert into public.services (shop_id, name, duration_min, buffer_min, price, category, sort)
    values
      (p_shop, 'Haircut & Styling', 30, 5, 250.00, 'Hair', 0),
      (p_shop, 'Beard Trim & Care', 15, 0, 100.00, 'Grooming', 1),
      (p_shop, 'Haircut & Beard Package', 45, 5, 320.00, 'Package', 2);

    -- Map all services to provider
    insert into public.provider_services (provider_id, service_id, shop_id)
    select v_provider_id, s.id, p_shop from public.services s where s.shop_id = p_shop;

    -- Standard hours: Mon-Sat, split shift (08:30-13:00, 14:00-18:30)
    for v_d in 1..6 loop
      insert into public.working_hours (shop_id, provider_id, weekday, start_time, end_time)
      values
        (p_shop, v_provider_id, v_d, '08:30:00'::time, '13:00:00'::time),
        (p_shop, v_provider_id, v_d, '14:00:00'::time, '18:30:00'::time);
    end loop;

  elsif p_type = 'clinic' then
    insert into public.providers (shop_id, name, color, sort)
    values (p_shop, 'Dr. Almaz H.', 1, 0) returning id into v_provider_id;

    insert into public.services (shop_id, name, duration_min, buffer_min, price, category, sort)
    values
      (p_shop, 'General Consultation', 20, 5, 500.00, 'Medical', 0),
      (p_shop, 'Follow-up Checkup', 15, 5, 300.00, 'Medical', 1);

    insert into public.provider_services (provider_id, service_id, shop_id)
    select v_provider_id, s.id, p_shop from public.services s where s.shop_id = p_shop;

    for v_d in 1..5 loop
      insert into public.working_hours (shop_id, provider_id, weekday, start_time, end_time)
      values
        (p_shop, v_provider_id, v_d, '09:00:00'::time, '12:30:00'::time),
        (p_shop, v_provider_id, v_d, '13:30:00'::time, '17:00:00'::time);
    end loop;

  else
    insert into public.providers (shop_id, name, color, sort)
    values (p_shop, 'Lead Specialist', 2, 0) returning id into v_provider_id;

    insert into public.services (shop_id, name, duration_min, buffer_min, price, category, sort)
    values (p_shop, 'Standard Service', 30, 0, 200.00, 'General', 0);

    insert into public.provider_services (provider_id, service_id, shop_id)
    select v_provider_id, s.id, p_shop from public.services s where s.shop_id = p_shop;

    for v_d in 1..5 loop
      insert into public.working_hours (shop_id, provider_id, weekday, start_time, end_time)
      values (p_shop, v_provider_id, v_d, '09:00:00'::time, '17:00:00'::time);
    end loop;
  end if;
end;
$$;

grant execute on function public.seed_shop_template(uuid, public.business_type) to authenticated, service_role;

-- Update create_shop to call seed_shop_template
create or replace function public.create_shop(
  p_name text,
  p_business_type public.business_type default 'salon',
  p_slug text default null,
  p_locale text default 'en',
  p_timezone text default 'Africa/Addis_Ababa'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slug text := lower(trim(p_slug));
  v_shop_id uuid;
  v_clean_name text := trim(p_name);
begin
  if v_user_id is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_clean_name is null or char_length(v_clean_name) < 1 or char_length(v_clean_name) > 100 then
    raise exception 'VALIDATION_FAILED: Invalid business name' using errcode = '22023';
  end if;

  if v_slug is null or v_slug = '' then
    v_slug := regexp_replace(lower(v_clean_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if char_length(v_slug) < 3 then
      v_slug := 'shop-' || substr(gen_random_uuid()::text, 1, 8);
    end if;
  end if;

  if not public.check_slug(v_slug) then
    raise exception 'SLUG_UNAVAILABLE' using errcode = '23505';
  end if;

  perform public.rate_limit_hit('create_shop:' || v_user_id::text, 5, 3600);

  insert into public.shops (
    owner_id, name, slug, business_type, locale, timezone
  ) values (
    v_user_id, v_clean_name, v_slug, coalesce(p_business_type, 'salon'),
    coalesce(p_locale, 'en'), coalesce(p_timezone, 'Africa/Addis_Ababa')
  ) returning id into v_shop_id;

  insert into public.shop_members (
    shop_id, user_id, role, display_name
  ) values (
    v_shop_id, v_user_id, 'owner', v_clean_name || ' Owner'
  );

  insert into public.audit_log (
    shop_id, actor, action, entity, entity_id, meta
  ) values (
    v_shop_id, v_user_id, 'created', 'shop', v_shop_id::text,
    jsonb_build_object('name', v_clean_name, 'slug', v_slug, 'type', p_business_type)
  );

  -- Seed initial providers, services, and working hours for the selected business type
  perform public.seed_shop_template(v_shop_id, coalesce(p_business_type, 'salon'));

  return jsonb_build_object(
    'id', v_shop_id,
    'name', v_clean_name,
    'slug', v_slug,
    'role', 'owner'
  );
end;
$$;

-- 9. Indexes for Query Performance
create index working_hours_idx on public.working_hours (provider_id, weekday);
create index time_off_idx on public.time_off (shop_id, provider_id, starts_at);
create index services_shop_idx on public.services (shop_id, active);
create index providers_shop_idx on public.providers (shop_id, active);
