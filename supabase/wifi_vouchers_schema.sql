-- ==============================================================================
-- TP-Link Omada Wi-Fi Hotspot Voucher Pool Schema
-- BAIA Cafe (1 Hour Duration, 2 Devices per Voucher)
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

-- Partial index for lightning-fast claiming of available vouchers
create index if not exists idx_wifi_vouchers_unclaimed 
  on public.wifi_vouchers (id) 
  where is_claimed = false;

create index if not exists idx_wifi_vouchers_claimed_by 
  on public.wifi_vouchers (claimed_by);

-- Enable Row Level Security (RLS)
alter table public.wifi_vouchers enable row level security;

-- Customers can view only the vouchers they claimed
drop policy if exists "Users can view own claimed vouchers" on public.wifi_vouchers;
create policy "Users can view own claimed vouchers"
  on public.wifi_vouchers for select
  using (auth.uid() = claimed_by);

-- Atomic voucher dispensing function (concurrency safe with SKIP LOCKED)
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
  -- 1. Check if user already claimed a voucher today (prevents double consumption)
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

  -- 2. Atomically lock & claim the next available voucher in the pool
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

-- Restrict execution to backend service role only
revoke all on function public.claim_next_wifi_voucher(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_wifi_voucher(uuid) to service_role;
