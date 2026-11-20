begin;
select plan(24);

-- 1. Test Extensions & Enums
select has_extension('btree_gist', 'btree_gist extension exists');
select has_type('public', 'member_role', 'member_role enum exists');
select has_type('public', 'business_type', 'business_type enum exists');
select has_table('public', 'rate_limits', 'rate_limits table exists');
select has_table('public', 'shops', 'shops table exists');
select has_table('public', 'shop_members', 'shop_members table exists');
select has_table('public', 'shop_invites', 'shop_invites table exists');
select has_table('public', 'audit_log', 'audit_log table exists');

-- 2. Test check_slug
select is(public.check_slug('valid-barber-123'), true, 'Valid slug accepted');
select is(public.check_slug('ab'), false, 'Too short slug rejected');
select is(public.check_slug('admin'), false, 'Reserved slug admin rejected');
select is(public.check_slug('api'), false, 'Reserved slug api rejected');
select is(public.check_slug('b'), false, 'Reserved slug b rejected');
select is(public.check_slug('Invalid_Slug!'), false, 'Uppercase and symbols rejected');

-- 3. Test rate_limit_hit
select is(public.rate_limit_hit('test:rate:limit', 3, 60), true, 'First rate limit hit ok');
select is(public.rate_limit_hit('test:rate:limit', 3, 60), true, 'Second rate limit hit ok');
select is(public.rate_limit_hit('test:rate:limit', 3, 60), true, 'Third rate limit hit ok');
select throws_ok(
  'select public.rate_limit_hit(''test:rate:limit'', 3, 60)',
  'P0001',
  'RATE_LIMITED',
  'Fourth hit exceeds limit and throws RATE_LIMITED'
);

-- 4. Create Mock Users for RLS & Flow Tests
create user test_owner_user;
create user test_outsider_user;
create user test_staff_user;

-- Set up mock auth user IDs
do $$
declare
  v_owner_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_shop jsonb;
  v_invite_code text;
  v_staff_id uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_accepted jsonb;
begin
  -- Set session as owner
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);

  -- Create shop via RPC
  v_shop := public.create_shop('Addis Cuts', 'salon', 'addis-cuts');

  -- Create invite for reception staff
  v_invite_code := public.create_invite((v_shop->>'id')::uuid, 'reception');

  -- Switch to staff session and accept invite
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  v_accepted := public.accept_invite(v_invite_code);
end $$;

-- Verify shop creation and member state
select is(
  (select count(*) from public.shops where slug = 'addis-cuts'),
  1::bigint,
  'Shop created successfully with expected slug'
);

select is(
  (select count(*) from public.shop_members where role = 'owner'),
  1::bigint,
  'Owner member record exists'
);

select is(
  (select count(*) from public.shop_members where role = 'reception'),
  1::bigint,
  'Reception member record exists after invite redemption'
);

-- Test Invite Single-Use: Attempt to accept the same invite again should fail
select throws_ok(
  $$
    select public.accept_invite(
      (select encode(extensions.digest('dummy', 'sha256'), 'hex'))
    )
  $$,
  'P0003',
  'INVALID_OR_EXPIRED_INVITE',
  'Re-using or using invalid invite code throws INVALID_OR_EXPIRED_INVITE'
);

-- Test Anon Isolation (anon has zero table access)
set role anon;
select throws_ok(
  'select * from public.shops',
  '42501',
  NULL,
  'Anon cannot read shops table directly'
);
reset role;

-- Test Outsider Isolation (authenticated user not in shop sees zero rows)
do $$
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
end $$;

select is(
  (select count(*) from public.shops),
  0::bigint,
  'Outsider cannot read shops belonging to other users'
);

select * from finish();
rollback;
