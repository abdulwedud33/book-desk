-- Migration 0006: Public Booking API & Abuse Controls
-- Provides public_* functions granted to service_role ONLY.
-- Anonymous users reach these exclusively through Edge Functions with rate limiting and validation.

-- 1. Helper function: public_shop_info
create or replace function public.public_shop_info(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop record;
  v_services jsonb;
  v_providers jsonb;
begin
  select id, name, slug, timezone, locale, time_display,
         slot_interval_min, lead_time_min, horizon_days, cancel_cutoff_hours,
         confirm_mode, public_phone, public_note
    into v_shop
    from public.shops
   where slug = p_slug and public_enabled = true;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  -- Active public services
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', id,
               'name', name,
               'description', description,
               'duration_min', duration_min,
               'buffer_min', buffer_min,
               'price', price,
               'approval_required', approval_required
             ) order by sort asc, name asc
           ),
           '[]'::jsonb
         )
    into v_services
    from public.services
   where shop_id = v_shop.id and active = true;

  -- Active public providers
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', id,
               'name', name,
               'color', color
             ) order by sort asc, name asc
           ),
           '[]'::jsonb
         )
    into v_providers
    from public.providers
   where shop_id = v_shop.id and active = true;

  return jsonb_build_object(
    'id', v_shop.id,
    'name', v_shop.name,
    'slug', v_shop.slug,
    'timezone', v_shop.timezone,
    'locale', v_shop.locale,
    'time_display', v_shop.time_display,
    'slot_interval_min', v_shop.slot_interval_min,
    'lead_time_min', v_shop.lead_time_min,
    'horizon_days', v_shop.horizon_days,
    'cancel_cutoff_hours', v_shop.cancel_cutoff_hours,
    'confirm_mode', v_shop.confirm_mode,
    'public_phone', v_shop.public_phone,
    'public_note', v_shop.public_note,
    'services', v_services,
    'providers', v_providers
  );
end;
$$;

revoke all on function public.public_shop_info(text) from anon, authenticated;
grant execute on function public.public_shop_info(text) to service_role;

-- 2. Helper function: public_slots
create or replace function public.public_slots(
  p_slug text,
  p_service uuid,
  p_provider uuid,
  p_from_date date,
  p_to_date date
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
declare
  v_shop_id uuid;
  v_max_to_date date;
begin
  select id into v_shop_id
    from public.shops
   where slug = p_slug and public_enabled = true;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  -- Enforce maximum 14-day window per call to protect performance
  v_max_to_date := p_from_date + 14;
  if p_to_date > v_max_to_date then
    p_to_date := v_max_to_date;
  end if;

  return query
  select * from public.compute_slots(v_shop_id, p_service, p_provider, p_from_date, p_to_date);
end;
$$;

revoke all on function public.public_slots(text, uuid, uuid, date, date) from anon, authenticated;
grant execute on function public.public_slots(text, uuid, uuid, date, date) to service_role;

-- 3. Public Booking Creation with Full Abuse Controls
create or replace function public.public_create_booking(
  p_slug text,
  p_service uuid,
  p_provider uuid,
  p_starts_at timestamptz,
  p_name text,
  p_phone text,
  p_language text default 'en',
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop record;
  v_service record;
  v_chosen_provider uuid := p_provider;
  v_provider_name text;
  v_customer_id uuid;
  v_customer_blocked boolean := false;
  v_customer_require_approval boolean := false;
  v_active_bookings_count int := 0;
  v_duration int;
  v_buffer int;
  v_ends_at timestamptz;
  v_blocked_until timestamptz;
  v_booking_id uuid := gen_random_uuid();
  v_status public.booking_status;
  v_manage_token text;
  v_alternatives timestamptz[];
  v_day_of_week int;
  v_local_start time;
  v_local_end time;
  v_working_valid boolean := false;
begin
  -- 1. Resolve and validate shop
  select id, timezone, lead_time_min, horizon_days, confirm_mode, max_active_per_phone
    into v_shop
    from public.shops
   where slug = p_slug and public_enabled = true;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  -- 2. Validate input strings
  p_name := trim(p_name);
  p_phone := trim(p_phone);

  if p_name is null or char_length(p_name) < 1 or char_length(p_name) > 100 then
    raise exception 'VALIDATION: Name must be between 1 and 100 characters';
  end if;

  if p_phone is null or char_length(p_phone) < 4 or char_length(p_phone) > 30 then
    raise exception 'VALIDATION: Invalid phone number';
  end if;

  -- 3. Check customer blocked list and existing approval rules
  select id, blocked, require_approval
    into v_customer_id, v_customer_blocked, v_customer_require_approval
    from public.customers
   where shop_id = v_shop.id and phone_e164 = p_phone;

  if coalesce(v_customer_blocked, false) then
    raise exception 'BLOCKED';
  end if;

  -- 4. Check active booking cap per phone (prevent slot hoarding)
  if v_customer_id is not null then
    select count(*)
      into v_active_bookings_count
      from public.bookings
     where customer_id = v_customer_id
       and status in ('pending', 'confirmed')
       and ends_at >= now();

    if v_active_bookings_count >= coalesce(v_shop.max_active_per_phone, 3) then
      raise exception 'LIMIT_REACHED';
    end if;
  end if;

  -- 5. Validate service
  select id, name, duration_min, buffer_min, price, approval_required, active
    into v_service
    from public.services
   where id = p_service and shop_id = v_shop.id and active = true;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_duration := v_service.duration_min;
  v_buffer := coalesce(v_service.buffer_min, 0);
  v_ends_at := p_starts_at + (v_duration || ' minutes')::interval;
  v_blocked_until := v_ends_at + (v_buffer || ' minutes')::interval;

  -- 6. Enforce lead time and horizon rules
  if p_starts_at < now() + (v_shop.lead_time_min || ' minutes')::interval then
    raise exception 'TOO_SOON';
  end if;

  if p_starts_at > now() + (v_shop.horizon_days || ' days')::interval then
    raise exception 'TOO_FAR';
  end if;

  -- 7. Fair provider allocation if provider is null ("Any available")
  if v_chosen_provider is null then
    select p.id into v_chosen_provider
      from public.providers p
      join public.provider_services ps on ps.provider_id = p.id and ps.service_id = p_service
     where p.shop_id = v_shop.id and p.active = true
       and not exists (
         select 1 from public.time_off toff
          where (toff.provider_id = p.id or toff.provider_id is null)
            and toff.shop_id = v_shop.id
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
      -- Find up to 5 alternative slots for the day
      select array_agg(s.start_val) into v_alternatives
        from (
          select unnest(starts) as start_val
            from public.compute_slots(v_shop.id, p_service, null, p_starts_at::date, p_starts_at::date + 1)
           order by start_val asc
           limit 5
        ) s;

      raise exception 'SLOT_TAKEN: %', coalesce(v_alternatives::text, '{}');
    end if;
  else
    -- Provider was specified: verify provider offers service
    if not exists (
      select 1 from public.provider_services
       where provider_id = v_chosen_provider and service_id = p_service
    ) then
      raise exception 'VALIDATION: Provider does not offer this service';
    end if;
  end if;

  -- 8. Verify working hours and time off for chosen provider
  v_day_of_week := extract(isodow from p_starts_at at time zone v_shop.timezone);
  v_local_start := (p_starts_at at time zone v_shop.timezone)::time;
  v_local_end := (v_ends_at at time zone v_shop.timezone)::time;

  select true into v_working_valid
    from public.working_hours wh
   where wh.provider_id = v_chosen_provider
     and wh.weekday = v_day_of_week
     and wh.start_time <= v_local_start
     and wh.end_time >= v_local_end;

  if not coalesce(v_working_valid, false) then
    raise exception 'OUTSIDE_HOURS';
  end if;

  if exists (
    select 1 from public.time_off toff
     where (toff.provider_id = v_chosen_provider or toff.provider_id is null)
       and toff.shop_id = v_shop.id
       and tstzrange(p_starts_at, v_blocked_until, '[)') && tstzrange(toff.starts_at, toff.ends_at, '[)')
  ) then
    raise exception 'OUTSIDE_HOURS';
  end if;

  -- 9. Determine confirmation mode
  if v_shop.confirm_mode = 'approval'
     or v_service.approval_required
     or coalesce(v_customer_require_approval, false) then
    v_status := 'pending';
  else
    v_status := 'confirmed';
  end if;

  -- 10. Find or create customer
  if v_customer_id is null then
    insert into public.customers (shop_id, name, phone_e164, language)
    values (v_shop.id, p_name, p_phone, coalesce(p_language, 'en'))
    returning id into v_customer_id;
  end if;

  -- 11. Insert booking (Guarded by exclusion constraint)
  begin
    insert into public.bookings (
      id, shop_id, provider_id, service_id, customer_id,
      starts_at, ends_at, blocked_until, status, source,
      price, version, confirmed_at
    ) values (
      v_booking_id, v_shop.id, v_chosen_provider, p_service, v_customer_id,
      p_starts_at, v_ends_at, v_blocked_until, v_status, 'public',
      v_service.price, 1, case when v_status = 'confirmed' then now() else null end
    );
  exception
    when exclusion_violation then
      select array_agg(s.start_val) into v_alternatives
        from (
          select unnest(starts) as start_val
            from public.compute_slots(v_shop.id, p_service, null, p_starts_at::date, p_starts_at::date + 1)
           order by start_val asc
           limit 5
        ) s;

      raise exception 'SLOT_TAKEN: %', coalesce(v_alternatives::text, '{}');
  end;

  -- 12. Create contact with 128-bit random base64url manage token
  v_manage_token := replace(replace(encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_');
  v_manage_token := rtrim(v_manage_token, '=');

  insert into public.booking_contacts (
    booking_id, shop_id, name, phone_e164, language, manage_token
  ) values (
    v_booking_id, v_shop.id, p_name, p_phone, coalesce(p_language, 'en'), v_manage_token
  );

  -- 13. Append-only event
  insert into public.booking_events (
    booking_id, shop_id, type, to_status, actor_kind, meta
  ) values (
    v_booking_id, v_shop.id, 'created', v_status, 'customer',
    jsonb_build_object('source', 'public', 'ip_hash', p_ip_hash)
  );

  select name into v_provider_name from public.providers where id = v_chosen_provider;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'status', v_status,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'service_name', v_service.name,
    'provider_name', v_provider_name,
    'price', v_service.price,
    'manage_token', v_manage_token
  );
end;
$$;

revoke all on function public.public_create_booking(text, uuid, uuid, timestamptz, text, text, text, text) from anon, authenticated;
grant execute on function public.public_create_booking(text, uuid, uuid, timestamptz, text, text, text, text) to service_role;
