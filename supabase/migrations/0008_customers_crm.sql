-- =============================================================================
-- Migration 0008: Customers CRM, No-show Accounting, and Audit
-- =============================================================================

-- 1. Relax customer_id on bookings so deleted customers preserve booking times/statuses
alter table public.bookings alter column customer_id drop not null;
alter table public.bookings drop constraint if exists bookings_customer_id_fkey;
alter table public.bookings
  add constraint bookings_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

-- 2. Trigger: Maintain exact no_show_count invariant on public.customers
create or replace function public.trig_sync_customer_no_show_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust_id uuid;
begin
  v_cust_id := coalesce(NEW.customer_id, OLD.customer_id);

  if v_cust_id is not null then
    update public.customers
       set no_show_count = (
         select count(*)::int
           from public.bookings
          where customer_id = v_cust_id
            and status = 'no_show'
       ),
       updated_at = now()
     where id = v_cust_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trig_sync_no_show_count on public.bookings;
create trigger trig_sync_no_show_count
  after insert or update of status, customer_id or delete on public.bookings
  for each row execute function public.trig_sync_customer_no_show_count();

-- 3. RPC: set_customer_blocked (owner only, audited)
create or replace function public.set_customer_blocked(
  p_shop uuid,
  p_customer uuid,
  p_blocked boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_user_id uuid;
  v_cust public.customers%rowtype;
begin
  v_user_id := (select auth.uid());
  v_role := public.my_role(p_shop);

  if v_role != 'owner' then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_cust
    from public.customers
   where id = p_customer
     and shop_id = p_shop;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  update public.customers
     set blocked = p_blocked,
         updated_at = now()
   where id = p_customer;

  insert into public.audit_log (
    shop_id, actor, action, entity, entity_id, meta
  ) values (
    p_shop,
    v_user_id,
    case when p_blocked then 'customer_blocked' else 'customer_unblocked' end,
    'customers',
    p_customer::text,
    jsonb_build_object('phone', v_cust.phone_e164, 'blocked', p_blocked)
  );

  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer,
    'blocked', p_blocked
  );
end;
$$;

revoke all on function public.set_customer_blocked from public;
grant execute on function public.set_customer_blocked to authenticated;
grant execute on function public.set_customer_blocked to service_role;

-- 4. RPC: set_customer_require_approval (owner only, audited)
create or replace function public.set_customer_require_approval(
  p_shop uuid,
  p_customer uuid,
  p_require_approval boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_user_id uuid;
  v_cust public.customers%rowtype;
begin
  v_user_id := (select auth.uid());
  v_role := public.my_role(p_shop);

  if v_role != 'owner' then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_cust
    from public.customers
   where id = p_customer
     and shop_id = p_shop;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  update public.customers
     set require_approval = p_require_approval,
         updated_at = now()
   where id = p_customer;

  insert into public.audit_log (
    shop_id, actor, action, entity, entity_id, meta
  ) values (
    p_shop,
    v_user_id,
    case when p_require_approval then 'require_approval_enabled' else 'require_approval_disabled' end,
    'customers',
    p_customer::text,
    jsonb_build_object('phone', v_cust.phone_e164, 'require_approval', p_require_approval)
  );

  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer,
    'require_approval', p_require_approval
  );
end;
$$;

revoke all on function public.set_customer_require_approval from public;
grant execute on function public.set_customer_require_approval to authenticated;
grant execute on function public.set_customer_require_approval to service_role;

-- 5. RPC: delete_customer (owner only, audited)
-- Deletes contact records and customer profile; keeps bookings with customer_id = null
create or replace function public.delete_customer(
  p_shop uuid,
  p_customer uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_user_id uuid;
  v_cust public.customers%rowtype;
  v_bookings_count int := 0;
begin
  v_user_id := (select auth.uid());
  v_role := public.my_role(p_shop);

  if v_role != 'owner' then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_cust
    from public.customers
   where id = p_customer
     and shop_id = p_shop;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  -- 1. Remove customer personal data from booking_contacts
  delete from public.booking_contacts
   where booking_id in (select id from public.bookings where customer_id = p_customer);

  -- 2. Anonymize bookings by unlinking customer_id (preserves times, services, providers, statuses)
  with updated_rows as (
    update public.bookings
       set customer_id = null,
           updated_at = now()
     where customer_id = p_customer
     returning id
  )
  select count(*)::int into v_bookings_count from updated_rows;

  -- 3. Delete customer record
  delete from public.customers
   where id = p_customer
     and shop_id = p_shop;

  -- 4. Audit deletion
  insert into public.audit_log (
    shop_id, actor, action, entity, entity_id, meta
  ) values (
    p_shop,
    v_user_id,
    'customer_deleted',
    'customers',
    p_customer::text,
    jsonb_build_object(
      'customer_id', p_customer,
      'preserved_bookings_count', v_bookings_count
    )
  );

  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer,
    'preserved_bookings_count', v_bookings_count
  );
end;
$$;

revoke all on function public.delete_customer from public;
grant execute on function public.delete_customer to authenticated;
grant execute on function public.delete_customer to service_role;

-- 6. RPC: export_customer (owner only, audited)
create or replace function public.export_customer(
  p_shop uuid,
  p_customer uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_user_id uuid;
  v_cust public.customers%rowtype;
  v_bookings jsonb;
begin
  v_user_id := (select auth.uid());
  v_role := public.my_role(p_shop);

  if v_role != 'owner' then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_cust
    from public.customers
   where id = p_customer
     and shop_id = p_shop;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'booking_id', b.id,
      'starts_at', b.starts_at,
      'ends_at', b.ends_at,
      'status', b.status,
      'price', b.price,
      'service_id', b.service_id,
      'provider_id', b.provider_id
    ) order by b.starts_at desc
  ), '[]'::jsonb) into v_bookings
    from public.bookings b
   where b.customer_id = p_customer;

  insert into public.audit_log (
    shop_id, actor, action, entity, entity_id, meta
  ) values (
    p_shop,
    v_user_id,
    'customer_exported',
    'customers',
    p_customer::text,
    jsonb_build_object('bookings_count', jsonb_array_length(v_bookings))
  );

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', v_cust.id,
      'name', v_cust.name,
      'phone_e164', v_cust.phone_e164,
      'language', v_cust.language,
      'notes', v_cust.notes,
      'no_show_count', v_cust.no_show_count,
      'require_approval', v_cust.require_approval,
      'blocked', v_cust.blocked,
      'created_at', v_cust.created_at
    ),
    'bookings', v_bookings
  );
end;
$$;

revoke all on function public.export_customer from public;
grant execute on function public.export_customer to authenticated;
grant execute on function public.export_customer to service_role;
