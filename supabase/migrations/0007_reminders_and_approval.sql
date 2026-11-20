-- =============================================================================
-- Migration 0007: Reminders and Approval Mode
-- =============================================================================

-- 1. Reminders Table
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind public.reminder_kind not null,
  due_at timestamptz not null,
  state public.reminder_state not null default 'due',
  done_by uuid references auth.users(id),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, kind)
);

create index if not exists reminders_due_idx on public.reminders (shop_id, state, due_at);
create index if not exists reminders_booking_idx on public.reminders (booking_id);

-- 2. RLS Security Lockdown
alter table public.reminders enable row level security;
revoke all on public.reminders from anon, authenticated;
grant select on public.reminders to authenticated;
grant all on public.reminders to service_role;

-- Authenticated policy: Staff can see reminders for shop bookings; providers see only their own
create policy reminders_select on public.reminders
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = reminders.booking_id
        and public.can_see_booking(b.shop_id, b.provider_id)
    )
  );

-- 3. Automatic Reminder Generation & Re-timing Trigger
create or replace function public.handle_booking_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_24h timestamptz;
  v_2h timestamptz;
begin
  -- Case A: Booking is cancelled, completed, or marked no-show -> Skip all open reminders
  if TG_OP = 'UPDATE' and NEW.status in ('cancelled', 'completed', 'no_show') then
    update public.reminders
       set state = 'skipped',
           updated_at = v_now
     where booking_id = NEW.id
       and state = 'due';
    return NEW;
  end if;

  -- Calculate due times
  v_24h := NEW.starts_at - interval '24 hours';
  v_2h := NEW.starts_at - interval '2 hours';

  -- Case B: New booking inserted (status 'pending' or 'confirmed')
  if TG_OP = 'INSERT' then
    if NEW.status in ('pending', 'confirmed') then
      -- 1. Confirmation reminder (due immediately)
      insert into public.reminders (booking_id, shop_id, kind, due_at, state)
      values (NEW.id, NEW.shop_id, 'confirmation', v_now, 'due')
      on conflict (booking_id, kind) do nothing;

      -- 2. 24h reminder (if in future)
      if v_24h > v_now then
        insert into public.reminders (booking_id, shop_id, kind, due_at, state)
        values (NEW.id, NEW.shop_id, 'reminder_24h', v_24h, 'due')
        on conflict (booking_id, kind) do nothing;
      end if;

      -- 3. 2h reminder (if in future)
      if v_2h > v_now then
        insert into public.reminders (booking_id, shop_id, kind, due_at, state)
        values (NEW.id, NEW.shop_id, 'reminder_2h', v_2h, 'due')
        on conflict (booking_id, kind) do nothing;
      end if;
    end if;

    return NEW;
  end if;

  -- Case C: Existing booking updated
  if TG_OP = 'UPDATE' then
    -- Subcase C1: Pending booking approved to Confirmed
    if OLD.status = 'pending' and NEW.status = 'confirmed' then
      -- Ensure confirmation is due now
      insert into public.reminders (booking_id, shop_id, kind, due_at, state)
      values (NEW.id, NEW.shop_id, 'confirmation', v_now, 'due')
      on conflict (booking_id, kind) do update
        set due_at = v_now,
            state = 'due',
            updated_at = v_now
        where reminders.state = 'skipped';
    end if;

    -- Subcase C2: Booking rescheduled (starts_at changed)
    if NEW.starts_at is distinct from OLD.starts_at and NEW.status in ('pending', 'confirmed') then
      -- Re-time 24h reminder
      if v_24h > v_now then
        insert into public.reminders (booking_id, shop_id, kind, due_at, state)
        values (NEW.id, NEW.shop_id, 'reminder_24h', v_24h, 'due')
        on conflict (booking_id, kind) do update
          set due_at = v_24h,
              state = 'due',
              updated_at = v_now;
      else
        update public.reminders
           set state = 'skipped',
               updated_at = v_now
         where booking_id = NEW.id
           and kind = 'reminder_24h'
           and state = 'due';
      end if;

      -- Re-time 2h reminder
      if v_2h > v_now then
        insert into public.reminders (booking_id, shop_id, kind, due_at, state)
        values (NEW.id, NEW.shop_id, 'reminder_2h', v_2h, 'due')
        on conflict (booking_id, kind) do update
          set due_at = v_2h,
              state = 'due',
              updated_at = v_now;
      else
        update public.reminders
           set state = 'skipped',
               updated_at = v_now
         where booking_id = NEW.id
           and kind = 'reminder_2h'
           and state = 'due';
      end if;

      -- Add a reschedule reminder task for staff to notify the customer
      insert into public.reminders (booking_id, shop_id, kind, due_at, state)
      values (NEW.id, NEW.shop_id, 'reschedule', v_now, 'due')
      on conflict (booking_id, kind) do update
        set due_at = v_now,
            state = 'due',
            updated_at = v_now;
    end if;

    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trig_booking_reminders on public.bookings;
create trigger trig_booking_reminders
  after insert or update of starts_at, status on public.bookings
  for each row execute function public.handle_booking_reminders();

-- 4. RPC: complete_reminder
create or replace function public.complete_reminder(
  p_shop uuid,
  p_reminder uuid,
  p_client_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_rem public.reminders%rowtype;
  v_booking public.bookings%rowtype;
begin
  v_role := public.my_role(p_shop);
  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_rem
    from public.reminders
   where id = p_reminder
     and shop_id = p_shop;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_booking
    from public.bookings
   where id = v_rem.booking_id;

  -- Provider can only complete reminders for own bookings
  if v_role = 'provider' and v_booking.provider_id is distinct from public.my_provider_id(p_shop) then
    raise exception 'FORBIDDEN';
  end if;

  -- Idempotency: if already done, return success
  if v_rem.state = 'done' then
    return jsonb_build_object(
      'success', true,
      'reminder_id', p_reminder,
      'state', 'done',
      'already_done', true
    );
  end if;

  -- Mark done
  update public.reminders
     set state = 'done',
         done_by = (select auth.uid()),
         done_at = now(),
         updated_at = now()
   where id = p_reminder;

  -- Append-only event in booking_events
  insert into public.booking_events (
    shop_id,
    booking_id,
    event_type,
    actor,
    actor_role,
    client_id,
    note
  ) values (
    p_shop,
    v_rem.booking_id,
    'reminder_done',
    'staff',
    v_role,
    p_client_id,
    v_rem.kind::text
  );

  return jsonb_build_object(
    'success', true,
    'reminder_id', p_reminder,
    'state', 'done',
    'kind', v_rem.kind
  );
end;
$$;

revoke all on function public.complete_reminder from public;
grant execute on function public.complete_reminder to authenticated;
grant execute on function public.complete_reminder to service_role;

-- 5. RPC: expire_pending_bookings
-- Automatically expires unconfirmed pending bookings when cutoff / lead time is passed or 24h old
create or replace function public.expire_pending_bookings(
  p_shop uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  v_booking record;
begin
  for v_booking in
    select b.id, b.shop_id, b.starts_at, b.version
      from public.bookings b
      join public.shops s on s.id = b.shop_id
     where b.status = 'pending'
       and (p_shop is null or b.shop_id = p_shop)
       and (
         -- Past appointment start or within lead time
         b.starts_at <= now() + (coalesce(s.lead_time_hours, 1) * interval '1 hour')
         or
         -- Pending for over 24 hours without confirmation
         b.created_at <= now() - interval '24 hours'
       )
  loop
    update public.bookings
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = 'system',
           cancel_reason = 'Pending request expired',
           version = v_booking.version + 1,
           updated_at = now()
     where id = v_booking.id;

    insert into public.booking_events (
      shop_id, booking_id, event_type, actor, actor_role, note
    ) values (
      v_booking.shop_id, v_booking.id, 'cancelled', 'system', null, 'Pending request expired'
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'expired_count', v_count
  );
end;
$$;

revoke all on function public.expire_pending_bookings from public;
grant execute on function public.expire_pending_bookings to authenticated;
grant execute on function public.expire_pending_bookings to service_role;
