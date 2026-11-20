begin;
select plan(18);

-- 1. Table Existence Checks
select has_table('public', 'providers', 'providers table exists');
select has_table('public', 'services', 'services table exists');
select has_table('public', 'provider_services', 'provider_services table exists');
select has_table('public', 'working_hours', 'working_hours table exists');
select has_table('public', 'time_off', 'time_off table exists');

-- 2. Setup Mock Users and Shop
create user test_owner_m2;
create user test_reception_m2;
create user test_outsider_m2;

do $$
declare
  v_owner_id uuid := 'a1111111-1111-1111-1111-111111111111'::uuid;
  v_reception_id uuid := 'b2222222-2222-2222-2222-222222222222'::uuid;
  v_shop jsonb;
  v_invite text;
begin
  -- Owner creates shop with 'salon' template
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  v_shop := public.create_shop('Crown Barber', 'salon', 'crown-barber');

  -- Invite reception
  v_invite := public.create_invite((v_shop->>'id')::uuid, 'reception');

  -- Reception accepts invite
  perform set_config('request.jwt.claim.sub', v_reception_id::text, true);
  perform public.accept_invite(v_invite);
end $$;

-- 3. Verify Template Seeding for 'salon'
select is(
  (select count(*) from public.providers p join public.shops s on s.id = p.shop_id where s.slug = 'crown-barber'),
  1::bigint,
  'Template seeded 1 provider for salon'
);

select is(
  (select count(*) from public.services sv join public.shops s on s.id = sv.shop_id where s.slug = 'crown-barber'),
  3::bigint,
  'Template seeded 3 services for salon'
);

select is(
  (select count(*) from public.working_hours wh join public.shops s on s.id = wh.shop_id where s.slug = 'crown-barber'),
  12::bigint,
  'Template seeded 12 working hour split-shifts (Mon-Sat, 2 per day)'
);

-- 4. Test Working Hours Overlap Exclusion Constraint
do $$
declare
  v_provider_id uuid;
  v_shop_id uuid;
begin
  select s.id, p.id into v_shop_id, v_provider_id
  from public.shops s join public.providers p on p.shop_id = s.id
  where s.slug = 'crown-barber' limit 1;

  -- Test non-overlapping split shift on Sunday (weekday 7): 10:00-13:00 and 14:00-17:00
  insert into public.working_hours (shop_id, provider_id, weekday, start_time, end_time)
  values
    (v_shop_id, v_provider_id, 7, '10:00:00'::time, '13:00:00'::time),
    (v_shop_id, v_provider_id, 7, '14:00:00'::time, '17:00:00'::time);
end $$;

select is(
  (select count(*) from public.working_hours where weekday = 7),
  2::bigint,
  'Non-overlapping split shifts on Sunday successfully inserted'
);

-- Overlapping insert on Sunday: 12:00-15:00 overlaps both shifts
select throws_ok(
  $$
    insert into public.working_hours (shop_id, provider_id, weekday, start_time, end_time)
    values (
      (select id from public.shops where slug = 'crown-barber'),
      (select p.id from public.providers p join public.shops s on s.id = p.shop_id where s.slug = 'crown-barber' limit 1),
      7,
      '12:00:00'::time,
      '15:00:00'::time
    )
  $$,
  '23P01',
  NULL,
  'Exclusion constraint working_hours_no_overlap blocks overlapping hours'
);

-- 5. Test RLS Matrix: Outsider cannot see anything
do $$
begin
  perform set_config('request.jwt.claim.sub', 'c3333333-3333-3333-3333-333333333333', true);
end $$;

select is((select count(*) from public.services), 0::bigint, 'Outsider sees 0 services');
select is((select count(*) from public.providers), 0::bigint, 'Outsider sees 0 providers');
select is((select count(*) from public.working_hours), 0::bigint, 'Outsider sees 0 working hours');

-- 6. Test RLS Matrix: Reception can read but cannot create services
do $$
begin
  perform set_config('request.jwt.claim.sub', 'b2222222-2222-2222-2222-222222222222', true);
end $$;

select is((select count(*) from public.services), 3::bigint, 'Reception reads shop services');

select throws_ok(
  $$
    insert into public.services (shop_id, name, duration_min)
    values ((select id from public.shops where slug = 'crown-barber'), 'Unauthorized Service', 30)
  $$,
  '42501',
  NULL,
  'Reception is blocked from inserting services (owner-only)'
);

-- Reception can insert time_off
do $$
declare
  v_shop_id uuid := (select id from public.shops where slug = 'crown-barber');
begin
  insert into public.time_off (shop_id, starts_at, ends_at, reason)
  values (v_shop_id, now() + interval '5 days', now() + interval '6 days', 'Public Holiday');
end $$;

select is(
  (select count(*) from public.time_off),
  1::bigint,
  'Reception can create shop-wide time_off'
);

-- 7. Test RLS Matrix: Owner can create services
do $$
begin
  perform set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  insert into public.services (shop_id, name, duration_min, price)
  values ((select id from public.shops where slug = 'crown-barber'), 'Owner Custom Fade', 35, 280.00);
end $$;

select is(
  (select count(*) from public.services where name = 'Owner Custom Fade'),
  1::bigint,
  'Owner can create custom service'
);

select * from finish();
rollback;
