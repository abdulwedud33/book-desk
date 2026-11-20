-- 0010_assistant_and_ai.sql
-- Staff assistant memory, AI usage ledger, security guardrails, and RPCs.

-- ============================================================================
-- 1. Tables: shop_memory and ai_usage
-- ============================================================================

create table if not exists public.shop_memory (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('alias', 'preference', 'fact')),
  key text not null check (char_length(key) <= 80),
  value text not null check (char_length(value) <= 300),
  ref_id uuid null,
  created_at timestamptz not null default now(),
  constraint shop_memory_unique_kind_key unique (shop_id, kind, key),
  -- Guardrail checks against prompt injection and phone numbers in memory values
  constraint shop_memory_no_instructions check (
    value !~* '(ignore|override|bypass|disregard).*instruction|double\s*book|as\s*system|developer\s*mode|system\s*prompt'
  ),
  constraint shop_memory_no_phones check (
    value !~* '(\+251|09\d{8}|07\d{8}|\b\d{9,15}\b)'
  )
);

create index if not exists shop_memory_shop_idx on public.shop_memory(shop_id);

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  agent text not null check (agent in ('booking_assistant', 'message_writer', 'insights_analyst')),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_shop_idx on public.ai_usage(shop_id, created_at desc);
create index if not exists ai_usage_user_idx on public.ai_usage(user_id, created_at desc);

-- ============================================================================
-- 2. Row Level Security & Grants
-- ============================================================================

alter table public.shop_memory enable row level security;
alter table public.ai_usage enable row level security;

revoke all on public.shop_memory from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;

-- shop_memory: owner (R, W), reception (R), provider (none), anon/outsider (none)
create policy shop_memory_owner_all on public.shop_memory
  for all to authenticated
  using (public.has_role(shop_id, array['owner']::public.member_role[]))
  with check (public.has_role(shop_id, array['owner']::public.member_role[]));

create policy shop_memory_reception_read on public.shop_memory
  for select to authenticated
  using (public.has_role(shop_id, array['reception']::public.member_role[]));

-- ai_usage: owner (R), others (none)
create policy ai_usage_owner_read on public.ai_usage
  for select to authenticated
  using (public.has_role(shop_id, array['owner']::public.member_role[]));

grant select on public.shop_memory to authenticated;
grant select on public.ai_usage to authenticated;

-- ============================================================================
-- 3. Stored Procedures and RPCs
-- ============================================================================

-- Save or update memory (owner only, audited)
create or replace function public.save_shop_memory(
  p_shop_id uuid,
  p_kind text,
  p_key text,
  p_value text,
  p_ref_id uuid default null
) returns public.shop_memory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_rec public.shop_memory;
begin
  v_role := public.my_role(p_shop_id);
  if v_role is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_kind not in ('alias', 'preference', 'fact') then
    raise exception 'VALIDATION: Invalid memory kind' using errcode = '22000';
  end if;

  if length(trim(coalesce(p_key, ''))) = 0 or length(p_key) > 80 then
    raise exception 'VALIDATION: Invalid memory key' using errcode = '22000';
  end if;

  if length(trim(coalesce(p_value, ''))) = 0 or length(p_value) > 300 then
    raise exception 'VALIDATION: Invalid memory value' using errcode = '22000';
  end if;

  -- Injection phrase check
  if p_value ~* '(ignore|override|bypass|disregard).*instruction|double\s*book|as\s*system|developer\s*mode|system\s*prompt' then
    raise exception 'VALIDATION: Instruction-like memory prohibited' using errcode = '22000';
  end if;

  -- Phone number check
  if p_value ~* '(\+251|09\d{8}|07\d{8}|\b\d{9,15}\b)' then
    raise exception 'VALIDATION: Phone numbers prohibited in memory' using errcode = '22000';
  end if;

  -- Shop limit: at most 200 items per business
  if (select count(*) from public.shop_memory where shop_id = p_shop_id) >= 200
     and not exists (select 1 from public.shop_memory where shop_id = p_shop_id and kind = p_kind and key = trim(p_key)) then
    raise exception 'LIMIT_REACHED: Maximum 200 memory items per business' using errcode = '54000';
  end if;

  insert into public.shop_memory (shop_id, kind, key, value, ref_id, created_at)
  values (p_shop_id, p_kind, trim(p_key), trim(p_value), p_ref_id, now())
  on conflict (shop_id, kind, key)
  do update set
    value = excluded.value,
    ref_id = excluded.ref_id,
    created_at = now()
  returning * into v_rec;

  -- Audit log
  insert into public.audit_log (shop_id, actor, action, entity, entity_id, meta, created_at)
  values (
    p_shop_id,
    auth.uid(),
    'save_shop_memory',
    'shop_memory',
    v_rec.id,
    jsonb_build_object('kind', p_kind, 'key', trim(p_key), 'ref_id', p_ref_id),
    now()
  );

  return v_rec;
end;
$$;

-- Delete memory item (owner only, audited)
create or replace function public.delete_shop_memory(
  p_shop_id uuid,
  p_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_deleted public.shop_memory;
begin
  v_role := public.my_role(p_shop_id);
  if v_role is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.shop_memory
  where shop_id = p_shop_id and id = p_id
  returning * into v_deleted;

  if not found then
    return false;
  end if;

  insert into public.audit_log (shop_id, actor, action, entity, entity_id, meta, created_at)
  values (
    p_shop_id,
    auth.uid(),
    'delete_shop_memory',
    'shop_memory',
    p_id,
    jsonb_build_object('kind', v_deleted.kind, 'key', v_deleted.key),
    now()
  );

  return true;
end;
$$;

-- Clear all memory items for a business (owner only, audited)
create or replace function public.clear_shop_memory(
  p_shop_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_count int;
begin
  v_role := public.my_role(p_shop_id);
  if v_role is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.shop_memory
  where shop_id = p_shop_id;
  get diagnostics v_count = row_count;

  insert into public.audit_log (shop_id, actor, action, entity, entity_id, meta, created_at)
  values (
    p_shop_id,
    auth.uid(),
    'clear_shop_memory',
    'shop_memory',
    null,
    jsonb_build_object('deleted_count', v_count),
    now()
  );

  return true;
end;
$$;

-- Fetch memory for assistant context (up to 50 items)
create or replace function public.get_shop_memory(
  p_shop_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  v_role := public.my_role(p_shop_id);
  if v_role is null or v_role = 'provider' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'kind', kind,
          'key', key,
          'value', value,
          'ref_id', ref_id
        ) order by created_at desc
      )
      from (
        select id, kind, key, value, ref_id, created_at
        from public.shop_memory
        where shop_id = p_shop_id
        limit 50
      ) m
    ),
    '[]'::jsonb
  );
end;
$$;

-- Log AI usage (service_role or authenticated with active membership)
create or replace function public.log_ai_usage(
  p_shop_id uuid,
  p_agent text,
  p_input_tokens int,
  p_output_tokens int,
  p_ok boolean default true
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_id bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  if not public.is_member(p_shop_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_agent not in ('booking_assistant', 'message_writer', 'insights_analyst') then
    raise exception 'VALIDATION: Invalid agent name' using errcode = '22000';
  end if;

  insert into public.ai_usage (
    shop_id,
    user_id,
    agent,
    input_tokens,
    output_tokens,
    ok,
    created_at
  ) values (
    p_shop_id,
    v_user_id,
    p_agent,
    greatest(0, coalesce(p_input_tokens, 0)),
    greatest(0, coalesce(p_output_tokens, 0)),
    coalesce(p_ok, true),
    now()
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.save_shop_memory(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.delete_shop_memory(uuid, uuid) to authenticated;
grant execute on function public.clear_shop_memory(uuid) to authenticated;
grant execute on function public.get_shop_memory(uuid) to authenticated;
grant execute on function public.log_ai_usage(uuid, text, int, int, boolean) to authenticated;
