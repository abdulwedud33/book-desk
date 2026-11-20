-- Migration 0002: Identity and Business Setup
-- Profiles, shops, members, invites, audit log, helper functions, and RPCs

-- 1. Helper extension for cryptography (if not already enabled)
create extension if not exists pgcrypto;

-- 2. Profiles Table
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text check (char_length(full_name) between 1 and 100),
  locale text default 'en' check (locale in ('en', 'am', 'om')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update, insert on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- 3. Shops Table
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  business_type public.business_type not null default 'salon',
  locale text not null default 'en' check (locale in ('en', 'am', 'om')),
  timezone text not null default 'Africa/Addis_Ababa',
  slot_interval_min int not null default 15 check (slot_interval_min in (5, 10, 15, 20, 30, 60)),
  lead_time_min int not null default 60 check (lead_time_min between 0 and 10080),
  horizon_days int not null default 30 check (horizon_days between 1 and 180),
  cancel_cutoff_hours int not null default 2 check (cancel_cutoff_hours between 0 and 168),
  confirm_mode public.confirm_mode not null default 'instant',
  max_active_per_phone int not null default 3 check (max_active_per_phone between 1 and 10),
  time_display public.time_display not null default 'gregorian',
  public_enabled boolean not null default true,
  public_note text check (char_length(public_note) <= 300),
  public_phone text check (char_length(public_phone) <= 30),
  providers_manage_time_off boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shops enable row level security;
revoke all on public.shops from anon, authenticated;
grant select on public.shops to authenticated;
grant all on public.shops to service_role;

-- 4. Shop Members Table
create table public.shop_members (
  shop_id uuid not null references public.shops on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.member_role not null,
  display_name text check (char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  constraint shop_members_pkey primary key (shop_id, user_id)
);

alter table public.shop_members enable row level security;
revoke all on public.shop_members from anon, authenticated;
grant select on public.shop_members to authenticated;
grant all on public.shop_members to service_role;

-- 5. Helper Functions (all stable security definer, search_path = '')
create or replace function public.my_role(p_shop uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.shop_members
  where shop_id = p_shop and user_id = (select auth.uid());
$$;

create or replace function public.is_member(p_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shop_members
    where shop_id = p_shop and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_role(p_shop uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shop_members
    where shop_id = p_shop
      and user_id = (select auth.uid())
      and role = any(p_roles)
  );
$$;

create or replace function public.my_provider_id(p_shop uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Returns null until providers table is populated in migration 0003
  select null::uuid;
$$;

create or replace function public.can_see_booking(p_shop uuid, p_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.my_role(p_shop)
           when 'owner' then true
           when 'reception' then true
           when 'provider' then p_provider is not distinct from public.my_provider_id(p_shop)
           else false
         end;
$$;

grant execute on function public.my_role(uuid) to authenticated, service_role;
grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.has_role(uuid, public.member_role[]) to authenticated, service_role;
grant execute on function public.my_provider_id(uuid) to authenticated, service_role;
grant execute on function public.can_see_booking(uuid, uuid) to authenticated, service_role;

-- Shop RLS Policies
create policy shops_select_member on public.shops
  for select to authenticated
  using (public.is_member(id));

create policy shops_update_owner on public.shops
  for update to authenticated
  using (public.has_role(id, array['owner'::public.member_role]))
  with check (public.has_role(id, array['owner'::public.member_role]));

grant update (
  name, locale, timezone, slot_interval_min, lead_time_min,
  horizon_days, cancel_cutoff_hours, confirm_mode, max_active_per_phone,
  time_display, public_enabled, public_note, public_phone,
  providers_manage_time_off, updated_at
) on public.shops to authenticated;

-- Shop Members RLS Policies
create policy shop_members_select on public.shop_members
  for select to authenticated
  using (public.is_member(shop_id));

create policy shop_members_delete on public.shop_members
  for delete to authenticated
  using (
    public.has_role(shop_id, array['owner'::public.member_role])
    and role <> 'owner'::public.member_role
  );

-- 6. Shop Invites Table
create table public.shop_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  code_hash bytea unique not null,
  role public.member_role not null check (role <> 'owner'::public.member_role),
  provider_id uuid null,
  expires_at timestamptz not null,
  created_by uuid references auth.users on delete set null,
  used_at timestamptz null,
  used_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

alter table public.shop_invites enable row level security;
revoke all on public.shop_invites from anon, authenticated;
grant select on public.shop_invites to authenticated;
grant all on public.shop_invites to service_role;

create policy shop_invites_select_owner on public.shop_invites
  for select to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]));

-- 7. Audit Log Table
create table public.audit_log (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops on delete cascade,
  actor uuid references auth.users on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

create policy audit_log_select_owner on public.audit_log
  for select to authenticated
  using (public.has_role(shop_id, array['owner'::public.member_role]));

-- 8. Indexes for Policy & Lookup Performance
create index shop_members_user_idx on public.shop_members (user_id);
create unique index shops_slug_uidx on public.shops (slug);
create index shop_invites_shop_idx on public.shop_invites (shop_id);
create index audit_log_shop_idx on public.audit_log (shop_id, created_at desc);

-- 9. RPC Functions

-- check_slug: format check, reserved word check, uniqueness check
create or replace function public.check_slug(p_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_normalized text := lower(trim(p_slug));
  v_reserved constant text[] := array[
    'admin', 'api', 'app', 'auth', 'b', 'm', 'book', 'login', 'www',
    'support', 'status', 'help', 'billing', 'account', 'dashboard',
    'settings', 'static', 'assets', 'favicon', 'robots', 'sitemap'
  ];
begin
  if v_normalized is null or char_length(v_normalized) < 3 or char_length(v_normalized) > 40 then
    return false;
  end if;

  if not (v_normalized ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$') then
    return false;
  end if;

  if v_normalized = any(v_reserved) then
    return false;
  end if;

  if exists (select 1 from public.shops where slug = v_normalized) then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.check_slug(text) to authenticated, anon, service_role;

-- create_shop: creates shop, assigns caller as owner, seeds initial data
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

  -- Default slug generation if not provided
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

  -- Rate limit shop creation (at most 5 per hour per user)
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

  return jsonb_build_object(
    'id', v_shop_id,
    'name', v_clean_name,
    'slug', v_slug,
    'role', 'owner'
  );
end;
$$;

grant execute on function public.create_shop(text, public.business_type, text, text, text) to authenticated, service_role;

-- create_invite: owner generates 48h single-use invite code
create or replace function public.create_invite(
  p_shop uuid,
  p_role public.member_role,
  p_provider uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_raw_code text;
  v_code_hash bytea;
  v_invite_id uuid;
begin
  if not public.has_role(p_shop, array['owner'::public.member_role]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_role = 'owner' then
    raise exception 'VALIDATION_FAILED: Cannot invite owner' using errcode = '22023';
  end if;

  -- Rate limit: at most 10 invites per hour
  perform public.rate_limit_hit('create_invite:' || p_shop::text, 10, 3600);

  -- Generate unguessable 16-byte random code
  v_raw_code := encode(extensions.gen_random_bytes(16), 'hex');
  v_code_hash := extensions.digest(v_raw_code, 'sha256');

  insert into public.shop_invites (
    shop_id, code_hash, role, provider_id, expires_at, created_by
  ) values (
    p_shop, v_code_hash, p_role, p_provider, now() + interval '48 hours', v_user_id
  ) returning id into v_invite_id;

  insert into public.audit_log (
    shop_id, actor, action, entity, entity_id, meta
  ) values (
    p_shop, v_user_id, 'invite_created', 'shop_invites', v_invite_id::text,
    jsonb_build_object('role', p_role, 'provider_id', p_provider)
  );

  return v_raw_code;
end;
$$;

grant execute on function public.create_invite(uuid, public.member_role, uuid) to authenticated, service_role;

-- accept_invite: redeem single-use code within 48h
create or replace function public.accept_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code_hash bytea;
  v_invite record;
begin
  if v_user_id is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_code is null or trim(p_code) = '' then
    raise exception 'VALIDATION_FAILED: Code required' using errcode = '22023';
  end if;

  -- Rate limit accept attempts (10 per 15 min per user)
  perform public.rate_limit_hit('accept_invite:' || v_user_id::text, 10, 900);

  v_code_hash := extensions.digest(trim(p_code), 'sha256');

  select * into v_invite
  from public.shop_invites
  where code_hash = v_code_hash
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'INVALID_OR_EXPIRED_INVITE' using errcode = 'P0003';
  end if;

  -- Add to shop_members
  insert into public.shop_members (
    shop_id, user_id, role, display_name
  ) values (
    v_invite.shop_id, v_user_id, v_invite.role, 'Team Member'
  )
  on conflict (shop_id, user_id)
  do update set role = excluded.role;

  -- Mark invite as used
  update public.shop_invites
  set used_at = now(), used_by = v_user_id
  where id = v_invite.id;

  insert into public.audit_log (
    shop_id, actor, action, entity, entity_id, meta
  ) values (
    v_invite.shop_id, v_user_id, 'invite_accepted', 'shop_invites', v_invite.id::text,
    jsonb_build_object('role', v_invite.role)
  );

  return jsonb_build_object(
    'shop_id', v_invite.shop_id,
    'role', v_invite.role
  );
end;
$$;

grant execute on function public.accept_invite(text) to authenticated, service_role;

-- delete_shop: owner deletes shop with transaction flag to bypass immutability guards
create or replace function public.delete_shop(p_shop uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if not public.has_role(p_shop, array['owner'::public.member_role]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Set transaction flag so triggers allowing whole-shop cascade can pass
  perform set_config('app.deleting_shop', 'true', true);

  delete from public.shops where id = p_shop;

  return true;
end;
$$;

grant execute on function public.delete_shop(uuid) to authenticated, service_role;
