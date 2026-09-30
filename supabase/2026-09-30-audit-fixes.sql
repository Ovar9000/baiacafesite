-- ==============================================================================
-- BAIA CAFE — SECURITY AUDIT FIXES (2026-09-30)
-- Run AFTER schema.sql / security-hardening.sql / wifi_vouchers_schema.sql.
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
-- ==============================================================================

-- One-time data migrations are recorded here so re-running never double-applies them
create table if not exists public.baia_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.baia_migrations enable row level security;
revoke all on public.baia_migrations from anon, authenticated;

-- ------------------------------------------------------------------------------
-- 1. Profiles are server-managed. The old "update own profile" policy let a
--    customer rewrite profiles.email / display_name through the public REST API
--    (e.g. claim another customer's email so staff stamps land on their account).
--    The frontend never updates profiles, so remove client write access entirely.
-- ------------------------------------------------------------------------------
drop policy if exists "Users can update own profile" on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Wi-Fi voucher timestamps. timezone('Asia/Manila', now()) yields Manila wall
--    time WITHOUT a zone; stored into timestamptz it is read as UTC, i.e. 8 hours
--    in the future. Store real instants with now() instead.
-- ------------------------------------------------------------------------------
alter table public.wifi_vouchers alter column created_at set default now();
alter table public.wifi_vouchers add column if not exists claimed_ip_hash text;
alter table public.wifi_vouchers add column if not exists claimed_new_account boolean not null default false;
create index if not exists idx_wifi_vouchers_claimed_at on public.wifi_vouchers (claimed_at);

-- Shift existing skewed rows back by 8h, exactly once. Only valid when the
-- database stored them under UTC (Supabase default).
do $$
begin
  if exists (select 1 from public.baia_migrations where id = '2026-09-30-wifi-voucher-tz') then
    raise notice 'wifi voucher timestamp correction already applied — skipping';
  elsif current_setting('TimeZone') not in ('UTC', 'Etc/UTC', 'GMT', 'Etc/GMT') then
    raise notice 'Database TimeZone is %, not UTC — skipping timestamp correction; review manually', current_setting('TimeZone');
  else
    update public.wifi_vouchers
      set created_at = created_at - interval '8 hours',
          claimed_at = claimed_at - interval '8 hours';
    insert into public.baia_migrations (id) values ('2026-09-30-wifi-voucher-tz');
  end if;
end $$;

-- Original dispenser, fixed to store real timestamps (kept for backward compatibility)
create or replace function public.claim_next_wifi_voucher(p_user_id uuid)
returns table (voucher_code varchar, duration integer, devices integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_code varchar;
  v_dur integer;
  v_dev integer;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  select code, duration_hours, device_limit into v_code, v_dur, v_dev
  from public.wifi_vouchers
  where claimed_by = p_user_id and claimed_at >= v_day_start
  limit 1;

  if found then
    return query select v_code, v_dur, v_dev;
    return;
  end if;

  select id, code, duration_hours, device_limit into v_id, v_code, v_dur, v_dev
  from public.wifi_vouchers
  where is_claimed = false
  order by id asc
  limit 1
  for update skip locked;

  if v_id is not null then
    update public.wifi_vouchers
      set is_claimed = true, claimed_by = p_user_id, claimed_at = now()
      where id = v_id;
    return query select v_code, v_dur, v_dev;
  end if;
end;
$$;
revoke all on function public.claim_next_wifi_voucher(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_wifi_voucher(uuid) to service_role;

-- ------------------------------------------------------------------------------
-- 3. Voucher abuse limits. The printed daily QR works all day from anywhere, so
--    cap how fast the pool can be drained:
--      * café-wide cap on vouchers per Manila day
--      * per-network cap on vouchers for accounts created in the last 24h
--    Returns no rows when a cap is hit (the stamp itself is still awarded).
-- ------------------------------------------------------------------------------
create or replace function public.claim_next_wifi_voucher_v2(
  p_user_id uuid,
  p_ip_hash text,
  p_is_new_account boolean,
  p_daily_cap integer default 150,
  p_new_account_ip_cap integer default 10
)
returns table (voucher_code varchar, duration integer, devices integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_code varchar;
  v_dur integer;
  v_dev integer;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  -- Same voucher back if this member already got one today
  select code, duration_hours, device_limit into v_code, v_dur, v_dev
  from public.wifi_vouchers
  where claimed_by = p_user_id and claimed_at >= v_day_start
  limit 1;

  if found then
    return query select v_code, v_dur, v_dev;
    return;
  end if;

  -- Serialize cap checks so concurrent claims can't overshoot
  perform pg_advisory_xact_lock(hashtext('baia_wifi_voucher_dispense'));

  if (select count(*) from public.wifi_vouchers where claimed_at >= v_day_start) >= p_daily_cap then
    return;
  end if;

  if p_is_new_account and p_ip_hash is not null and (
    select count(*) from public.wifi_vouchers
    where claimed_at >= v_day_start
      and claimed_new_account
      and claimed_ip_hash = p_ip_hash
  ) >= p_new_account_ip_cap then
    return;
  end if;

  select id, code, duration_hours, device_limit into v_id, v_code, v_dur, v_dev
  from public.wifi_vouchers
  where is_claimed = false
    and (valid_until is null or valid_until >= (now() at time zone 'Asia/Manila')::date)
  order by id asc
  limit 1
  for update skip locked;

  if v_id is not null then
    update public.wifi_vouchers
      set is_claimed = true,
          claimed_by = p_user_id,
          claimed_at = now(),
          claimed_ip_hash = p_ip_hash,
          claimed_new_account = p_is_new_account
      where id = v_id;
    return query select v_code, v_dur, v_dev;
  end if;
end;
$$;
revoke all on function public.claim_next_wifi_voucher_v2(uuid, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_next_wifi_voucher_v2(uuid, text, boolean, integer, integer) to service_role;

-- ------------------------------------------------------------------------------
-- 4. Admin login throttling shared across all serverless instances.
--    Only failed password attempts are recorded (IP stored as a keyed hash).
-- ------------------------------------------------------------------------------
create table if not exists public.admin_login_failures (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  failed_at timestamptz not null default now()
);
create index if not exists admin_login_failures_at_idx on public.admin_login_failures (failed_at desc);
create index if not exists admin_login_failures_ip_idx on public.admin_login_failures (ip_hash, failed_at desc);
alter table public.admin_login_failures enable row level security;
revoke all on public.admin_login_failures from anon, authenticated;

create or replace function public.admin_login_locked(
  p_ip_hash text,
  p_ip_limit integer,
  p_global_limit integer,
  p_window_seconds integer
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.admin_login_failures
      where ip_hash = p_ip_hash
        and failed_at > now() - make_interval(secs => p_window_seconds)) >= p_ip_limit
    or
    (select count(*) from public.admin_login_failures
      where failed_at > now() - make_interval(secs => p_window_seconds)) >= p_global_limit;
$$;

create or replace function public.record_admin_login_failure(p_ip_hash text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.admin_login_failures where failed_at < now() - interval '1 day';
  insert into public.admin_login_failures (ip_hash) values (p_ip_hash);
$$;

revoke all on function public.admin_login_locked(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.record_admin_login_failure(text) from public, anon, authenticated;
grant execute on function public.admin_login_locked(text, integer, integer, integer) to service_role;
grant execute on function public.record_admin_login_failure(text) to service_role;

-- Verify:
-- select * from pg_policies where tablename = 'profiles';                 -- only the SELECT policy
-- select * from public.baia_migrations;
-- select id, claimed_at, created_at from public.wifi_vouchers where claimed_at is not null order by claimed_at desc limit 5;
