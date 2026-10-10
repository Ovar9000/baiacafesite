-- ==============================================================================
-- BAIA CAFE — WALK-IN TAP CARDS (no account needed) (2026-10-09)
-- Run AFTER loyalty_cards_schema.sql and 2026-09-30-nfc-audit-fixes.sql.
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
--
-- A card sold at the counter works on its own: its stamps, rewards and Wi-Fi
-- codes belong to the card. It can later be linked to a NEW account only (no
-- stamps, rewards or active card yet), so stamps are never merged.
-- ==============================================================================

-- 1. Cards can exist without an account; a short-lived token links them later
alter table public.loyalty_cards alter column user_id drop not null;
alter table public.loyalty_cards add column if not exists link_token text;
alter table public.loyalty_cards add column if not exists link_token_expires_at timestamptz;
create unique index if not exists idx_loyalty_cards_link_token
  on public.loyalty_cards (link_token) where link_token is not null;

-- 2. Stamps belong to an account, a walk-in card, or both (card stamps keep
--    their card_id after linking, for history)
alter table public.stamps alter column user_id drop not null;
alter table public.stamps add column if not exists card_id uuid
  references public.loyalty_cards(id) on delete set null;
alter table public.stamps drop constraint if exists stamps_owner_check;
alter table public.stamps add constraint stamps_owner_check
  check (user_id is not null or card_id is not null);
create index if not exists stamps_card_idx on public.stamps (card_id, awarded_at desc);
-- One stamp per walk-in card per Manila day (accounts keep their own index)
create unique index if not exists stamps_card_single_daily_stamp_idx
  on public.stamps (card_id, (timezone('Asia/Manila', awarded_at)::date))
  where user_id is null;

-- 3. Rewards the same way
alter table public.redemptions alter column user_id drop not null;
alter table public.redemptions add column if not exists card_id uuid
  references public.loyalty_cards(id) on delete set null;
alter table public.redemptions drop constraint if exists redemptions_owner_check;
alter table public.redemptions add constraint redemptions_owner_check
  check (user_id is not null or card_id is not null);
create unique index if not exists redemptions_card_milestone_idx
  on public.redemptions (card_id, milestone_number) where user_id is null;

-- 4. Wi-Fi codes for walk-in cards (same daily pool and cap as members)
alter table public.wifi_vouchers add column if not exists claimed_card uuid
  references public.loyalty_cards(id) on delete set null;
create index if not exists idx_wifi_vouchers_claimed_card on public.wifi_vouchers (claimed_card);

create or replace function public.claim_wifi_voucher_for_card(
  p_card_id uuid,
  p_daily_cap integer default 150
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
  -- Same code back if this card already got one today
  select code, duration_hours, device_limit into v_code, v_dur, v_dev
  from public.wifi_vouchers
  where claimed_card = p_card_id and claimed_at >= v_day_start
  limit 1;

  if found then
    return query select v_code, v_dur, v_dev;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('baia_wifi_voucher_dispense'));

  if (select count(*) from public.wifi_vouchers where claimed_at >= v_day_start) >= p_daily_cap then
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
      set is_claimed = true, claimed_card = p_card_id, claimed_at = now()
      where id = v_id;
    return query select v_code, v_dur, v_dev;
  end if;
end;
$$;

revoke all on function public.claim_wifi_voucher_for_card(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_wifi_voucher_for_card(uuid, integer) to service_role;

-- 5. Redeem a reward from the counter, for a walk-in card or a linked one
create or replace function public.redeem_card_reward(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card public.loyalty_cards%rowtype;
  v_stamps int;
  v_redemptions int;
  v_next int;
begin
  select * into v_card from public.loyalty_cards where id = p_card_id and status = 'active' for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'This card is not active.');
  end if;

  if v_card.user_id is not null then
    return public.redeem_loyalty_reward(v_card.user_id, 'coffee');
  end if;

  select count(*) into v_stamps from public.stamps where card_id = p_card_id and user_id is null;
  select count(*) into v_redemptions from public.redemptions where card_id = p_card_id and user_id is null;

  if floor(v_stamps / 10) <= v_redemptions then
    return jsonb_build_object('success', false, 'error', 'No free coffee ready on this card yet.');
  end if;

  v_next := v_redemptions + 1;
  insert into public.redemptions (card_id, reward_type, milestone_number)
  values (p_card_id, 'coffee', v_next);

  return jsonb_build_object(
    'success', true,
    'milestoneNumber', v_next,
    'remainingPendingRewards', greatest(0, floor(v_stamps / 10)::int - v_next)
  );
end;
$$;

revoke all on function public.redeem_card_reward(uuid) from public, anon, authenticated;
grant execute on function public.redeem_card_reward(uuid) to service_role;

-- 6. Link a walk-in card to a brand-new account (atomic, new accounts only)
create or replace function public.link_walkin_card(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card public.loyalty_cards%rowtype;
  v_moved int;
begin
  select * into v_card from public.loyalty_cards where link_token = p_token for update;

  if not found or v_card.link_token_expires_at is null or v_card.link_token_expires_at < now() then
    return jsonb_build_object('success', false, 'code', 'expired');
  end if;

  if v_card.status <> 'active' or v_card.user_id is not null then
    return jsonb_build_object('success', false, 'code', 'already_linked');
  end if;

  -- Serialize links per account so two cards can't race onto the same new account
  perform pg_advisory_xact_lock(hashtext('baia_link_card_' || p_user_id::text));

  if exists (select 1 from public.stamps where user_id = p_user_id)
     or exists (select 1 from public.redemptions where user_id = p_user_id)
     or exists (select 1 from public.loyalty_cards where user_id = p_user_id and status = 'active') then
    return jsonb_build_object('success', false, 'code', 'not_new_account');
  end if;

  update public.loyalty_cards
    set user_id = p_user_id, link_token = null, link_token_expires_at = null
    where id = v_card.id;

  update public.stamps set user_id = p_user_id where card_id = v_card.id and user_id is null;
  get diagnostics v_moved = row_count;
  update public.redemptions set user_id = p_user_id where card_id = v_card.id and user_id is null;
  update public.wifi_vouchers set claimed_by = p_user_id where claimed_card = v_card.id and claimed_by is null;

  -- They have a card now, so an online order waiting at the counter is no longer needed
  update public.card_requests
    set status = 'cancelled', notes = 'Linked a walk-in card instead'
    where user_id = p_user_id and status = 'pending';

  return jsonb_build_object('success', true, 'stampsMoved', v_moved);
end;
$$;

revoke all on function public.link_walkin_card(text, uuid) from public, anon, authenticated;
grant execute on function public.link_walkin_card(text, uuid) to service_role;

-- Verify:
-- select column_name, is_nullable from information_schema.columns
--   where table_name in ('loyalty_cards','stamps','redemptions') and column_name in ('user_id','card_id');
