-- ==============================================================================
-- BAIA CAFÉ — DIGITAL LOYALTY CARD SCHEMA & RLS POLICIES
-- Execute this script in your Supabase Project SQL Editor
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

-- Enforce maximum 1 stamp per user per Asia/Manila calendar date at the database engine level
create unique index if not exists stamps_user_single_daily_stamp_idx 
  on public.stamps (user_id, (timezone('Asia/Manila', awarded_at)::date));

-- 3. Redemptions Table (One row per claimed reward)
create table if not exists public.redemptions (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  reward_type text check (reward_type in ('coffee','totebag')) not null,
  milestone_number int not null,
  redeemed_at timestamptz default now() not null
);

-- Optimized index for redemptions per user
create index if not exists redemptions_user_idx on public.redemptions (user_id, redeemed_at desc);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.stamps enable row level security;
alter table public.redemptions enable row level security;

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

-- Authenticated user can insert own stamp
drop policy if exists "Users can insert own stamps" on public.stamps;
create policy "Users can insert own stamps" on public.stamps
  for insert with check (auth.uid() = user_id);

-- Redemptions Policies:
-- Users can view their own redemption history
drop policy if exists "Users can view own redemptions" on public.redemptions;
create policy "Users can view own redemptions" on public.redemptions
  for select using (auth.uid() = user_id);

-- Authenticated user can insert own redemptions
drop policy if exists "Users can insert own redemptions" on public.redemptions;
create policy "Users can insert own redemptions" on public.redemptions
  for insert with check (auth.uid() = user_id);

-- ==============================================================================
-- AUTOMATIC PROFILE CREATION TRIGGER
-- Auto-populates public.profiles on user sign up (OAuth or Magic Link/OTP)
-- ==============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
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
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();
