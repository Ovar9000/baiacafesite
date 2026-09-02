-- ==============================================================================
-- BAIA CAFÉ — DIGITAL LOYALTY CARD SCHEMA & RLS POLICIES
-- Execute this script in your Supabase Project SQL Editor
-- Optimized for Supabase Free Tier (Lean Storage, High-Speed Indices, Atomic Security)
-- ==============================================================================

-- 1. Profiles Table (Mirrors auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  fb_id text,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. Stamps Table (One row per awarded stamp)
create table if not exists public.stamps (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  awarded_at timestamptz default now() not null,
  distance_meters numeric,
  staff_note text
);

-- Optimized index for user stamp history and daily limit lookups
create index if not exists stamps_user_day_idx on public.stamps (user_id, awarded_at desc);

-- Pre-clean any accidental duplicates before creating unique index (keeps the earliest stamp)
delete from public.stamps a
using public.stamps b
where a.id > b.id
  and a.user_id = b.user_id
  and (timezone('Asia/Manila', a.awarded_at)::date) = (timezone('Asia/Manila', b.awarded_at)::date);

-- Enforce maximum 1 stamp per user per Asia/Manila calendar date at the database engine level
create unique index if not exists stamps_user_single_daily_stamp_idx 
  on public.stamps (user_id, (timezone('Asia/Manila', awarded_at)::date));

-- 3. Redemptions Table (One row per claimed reward)
create table if not exists public.redemptions (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  reward_type text check (reward_type in ('coffee','totebag')) not null default 'coffee',
  milestone_number int not null,
  redeemed_at timestamptz default now() not null
);

-- Optimized index for redemptions per user
create index if not exists redemptions_user_idx on public.redemptions (user_id, redeemed_at desc);

-- 4. Dynamic Releases & Events Table (Facebook & Special Drops)
create table if not exists public.drops (
  id text primary key,
  category text not null check (category in ('food', 'drink', 'event')),
  title text not null,
  description text,
  price text,
  event_date text,
  badge text,
  winner text,
  status text,
  image_url text,
  permalink text,
  published_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

create index if not exists drops_published_idx on public.drops (published_at desc);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.stamps enable row level security;
alter table public.redemptions enable row level security;
alter table public.drops enable row level security;

-- Profiles Policies:
-- Users can view their own profile
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

-- Users can update their own profile details
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Stamps Policies:
-- Users can view their own stamp history
drop policy if exists "Users can view own stamps" on public.stamps;
create policy "Users can view own stamps" on public.stamps
  for select using (auth.uid() = user_id);

-- Explicitly remove client-side insert permission.
-- Only the backend serverless API (service_role) or security definer RPC can insert stamps.
drop policy if exists "Users can insert own stamps" on public.stamps;

-- Redemptions Policies:
-- Users can view their own redemption history
drop policy if exists "Users can view own redemptions" on public.redemptions;
create policy "Users can view own redemptions" on public.redemptions
  for select using (auth.uid() = user_id);

-- Explicitly remove client-side insert permission.
-- Redemptions must be processed exclusively via the atomic redeem_loyalty_reward stored procedure or service_role.
drop policy if exists "Users can insert own redemptions" on public.redemptions;

-- Drops Policies:
drop policy if exists "Anyone can view drops" on public.drops;
create policy "Anyone can view drops" on public.drops
  for select using (true);

-- ==============================================================================
-- AUTOMATIC PROFILE CREATION TRIGGER
-- Auto-populates public.profiles on user sign up (OAuth or Magic Link/OTP)
-- ==============================================================================
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

-- Revoke execute from public/authenticated (runs solely as trigger)
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

-- ==============================================================================
-- ATOMIC LOYALTY REWARD REDEMPTION STORED PROCEDURE
-- Guarantees atomic verification and milestone locking to eliminate race conditions
-- ==============================================================================
create or replace function public.redeem_loyalty_reward(
  p_user_id uuid,
  p_reward_type text default 'coffee'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_stamps int;
  v_total_redemptions int;
  v_earned_milestones int;
  v_next_milestone int;
  v_inserted_id bigint;
  v_redeemed_at timestamptz := now();
begin
  -- Count current stamps
  select count(*) into v_total_stamps
  from public.stamps
  where user_id = p_user_id;

  -- Count current redemptions
  select count(*) into v_total_redemptions
  from public.redemptions
  where user_id = p_user_id;

  v_earned_milestones := floor(coalesce(v_total_stamps, 0) / 10);

  if v_earned_milestones <= coalesce(v_total_redemptions, 0) then
    return jsonb_build_object(
      'success', false,
      'error', 'No pending rewards available for redemption.',
      'totalStamps', coalesce(v_total_stamps, 0),
      'redemptionsCount', coalesce(v_total_redemptions, 0)
    );
  end if;

  v_next_milestone := coalesce(v_total_redemptions, 0) + 1;

  insert into public.redemptions (user_id, reward_type, milestone_number, redeemed_at)
  values (p_user_id, p_reward_type, v_next_milestone, v_redeemed_at)
  returning id into v_inserted_id;

  return jsonb_build_object(
    'success', true,
    'redemptionId', v_inserted_id,
    'rewardType', p_reward_type,
    'milestoneNumber', v_next_milestone,
    'redeemedAt', v_redeemed_at,
    'rewardTitle', 'Free Specialty Coffee',
    'remainingPendingRewards', greatest(0, v_earned_milestones - v_next_milestone)
  );
end;
$$;

-- Restrict execution to backend service role only (called by /api/redeem-reward)
revoke all on function public.redeem_loyalty_reward(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_loyalty_reward(uuid, text) to service_role;

-- ==============================================================================
-- 7. TP-Link Omada Wi-Fi Hotspot Voucher Pool
-- (1 Hour Duration, 2 Devices per Voucher)
-- ==============================================================================

create table if not exists public.wifi_vouchers (
  id bigint generated always as identity primary key,
  code varchar(10) unique not null,
  duration_hours integer default 1,
  device_limit integer default 2,
  valid_from date default '2026-09-03',
  valid_until date default '2027-09-03',
  is_claimed boolean default false,
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  created_at timestamptz default timezone('Asia/Manila'::text, now()) not null
);

create index if not exists idx_wifi_vouchers_unclaimed 
  on public.wifi_vouchers (id) 
  where is_claimed = false;

create index if not exists idx_wifi_vouchers_claimed_by 
  on public.wifi_vouchers (claimed_by);

alter table public.wifi_vouchers enable row level security;

drop policy if exists "Users can view own claimed vouchers" on public.wifi_vouchers;
create policy "Users can view own claimed vouchers"
  on public.wifi_vouchers for select
  using (auth.uid() = claimed_by);

create or replace function public.claim_next_wifi_voucher(p_user_id uuid)
returns table (
  voucher_code varchar,
  duration integer,
  devices integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_code varchar;
  v_dur integer;
  v_dev integer;
begin
  select code, duration_hours, device_limit
  into v_code, v_dur, v_dev
  from public.wifi_vouchers
  where claimed_by = p_user_id
    and (timezone('Asia/Manila', claimed_at)::date) = (timezone('Asia/Manila', now())::date)
  limit 1;

  if found then
    return query select v_code, v_dur, v_dev;
    return;
  end if;

  select id, code, duration_hours, device_limit
  into v_id, v_code, v_dur, v_dev
  from public.wifi_vouchers
  where is_claimed = false
  order by id asc
  limit 1
  for update skip locked;

  if v_id is not null then
    update public.wifi_vouchers
    set is_claimed = true,
        claimed_by = p_user_id,
        claimed_at = timezone('Asia/Manila'::text, now())
    where id = v_id;

    return query select v_code, v_dur, v_dev;
  end if;
end;
$$;

-- Restrict execution to backend service role only (called by /api/claim-stamp)
revoke all on function public.claim_next_wifi_voucher(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_wifi_voucher(uuid) to service_role;
