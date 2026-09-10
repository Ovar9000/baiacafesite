-- ==============================================================================
-- BAIA CAFE — SECURITY HARDENING (run AFTER schema.sql)
-- Paste into Supabase Dashboard -> SQL Editor -> Run
-- Idempotent: safe to re-run
-- ==============================================================================

-- 1. Ensure RLS is on everywhere (including wifi_vouchers)
alter table public.profiles enable row level security;
alter table public.stamps enable row level security;
alter table public.redemptions enable row level security;
alter table public.drops enable row level security;
alter table public.wifi_vouchers enable row level security;

-- 2. Remove any permissive / legacy insert policies (fail-closed: writes via service_role only)
drop policy if exists "Users can insert own stamps" on public.stamps;
drop policy if exists "Users can insert own redemptions" on public.redemptions;
drop policy if exists "Enable insert for authenticated users only" on public.stamps;
drop policy if exists "Enable insert for authenticated users only" on public.redemptions;
drop policy if exists "Anyone can insert drops" on public.drops;
drop policy if exists "Authenticated can insert drops" on public.drops;

-- 3. Re-assert least-privilege read policies (no anon access to PII)
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- No INSERT/DELETE on profiles from client (handled by handle_new_user trigger + service_role)
-- (Deliberately no insert/delete policies here.)

drop policy if exists "Users can view own stamps" on public.stamps;
create policy "Users can view own stamps" on public.stamps
  for select using (auth.uid() = user_id);

drop policy if exists "Users can view own redemptions" on public.redemptions;
create policy "Users can view own redemptions" on public.redemptions
  for select using (auth.uid() = user_id);

drop policy if exists "Anyone can view drops" on public.drops;
create policy "Anyone can view drops" on public.drops
  for select using (true);

drop policy if exists "Users can view own claimed vouchers" on public.wifi_vouchers;
create policy "Users can view own claimed vouchers"
  on public.wifi_vouchers for select
  using (auth.uid() = claimed_by);

-- 4. Lock down SECURITY DEFINER functions: fixed search_path + revoke public
-- handle_new_user (trigger only)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'user_name',
      split_part(coalesce(new.email, 'guest@baia.cafe'), '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- redeem_loyalty_reward: service_role only
-- (Function body lives in schema.sql; here we only re-assert permissions + hardening.)
do $$
begin
  -- Ensure function exists before altering ACLs
  if exists (select 1 from pg_proc where proname = 'redeem_loyalty_reward') then
    revoke all on function public.redeem_loyalty_reward(uuid, text) from public, anon, authenticated;
    grant execute on function public.redeem_loyalty_reward(uuid, text) to service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'claim_next_wifi_voucher') then
    revoke all on function public.claim_next_wifi_voucher(uuid) from public, anon, authenticated;
    grant execute on function public.claim_next_wifi_voucher(uuid) to service_role;
  end if;
end $$;

-- 5. Extra guardrails: unique constraints (skip if already created by schema.sql)
create unique index if not exists stamps_user_single_daily_stamp_idx
  on public.stamps (user_id, (timezone('Asia/Manila', awarded_at)::date));

create unique index if not exists redemptions_user_milestone_idx
  on public.redemptions (user_id, milestone_number);

-- 6. Verify (run these SELECTs to confirm):
-- select * from pg_policies where tablename in ('profiles','stamps','redemptions','drops','wifi_vouchers');
-- select grantee, privilege_type from information_schema.routine_privileges
--   where routine_schema='public' and routine_name in ('redeem_loyalty_reward','claim_next_wifi_voucher','handle_new_user');
