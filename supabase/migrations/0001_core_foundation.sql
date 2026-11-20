-- Migration 0001: Core Foundation
-- Extensions, enumerations, default privileges, rate limiting, and immutability trigger

-- 1. Extensions
create extension if not exists btree_gist;

-- 2. Enumerations
create type public.member_role    as enum ('owner', 'reception', 'provider');
create type public.business_type  as enum ('salon', 'clinic', 'tutor', 'garage', 'other');
create type public.booking_status as enum ('pending', 'confirmed', 'arrived', 'in_service',
                                           'completed', 'cancelled', 'no_show');
create type public.booking_source as enum ('public', 'staff', 'walk_in');
create type public.confirm_mode   as enum ('instant', 'approval');
create type public.time_display   as enum ('gregorian', 'both');
create type public.reminder_kind  as enum ('confirmation', 'reminder_24h', 'reminder_2h', 'reschedule', 'followup');
create type public.reminder_state as enum ('due', 'done', 'skipped');
create type public.event_type     as enum ('created', 'confirmed', 'moved', 'status_changed',
                                           'cancelled', 'note', 'reminder_done');
create type public.actor_kind     as enum ('staff', 'customer', 'system');

-- 3. Default Privileges Lockdown
-- Anon has zero table privileges. Default deny on public schema.
revoke all on schema public from anon;
grant usage on schema public to authenticated, service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 4. Rate Limiting Table & Function
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  constraint rate_limits_pkey primary key (key, window_start)
);

-- RLS enabled: no policies means nobody (anon or authenticated) has direct access
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.rate_limit_hit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_hits int;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    return true;
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  if v_hits > p_limit then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  return true;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon;
grant execute on function public.rate_limit_hit(text, int, int) to authenticated, service_role;

-- 5. Immutability Trigger Function (for append-only tables like booking_events)
create or replace function public.guard_immutable_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.deleting_shop', true) = 'true' then
    return coalesce(old, new);
  end if;
  raise exception 'RECORD_IMMUTABLE' using errcode = 'P0002';
end;
$$;
