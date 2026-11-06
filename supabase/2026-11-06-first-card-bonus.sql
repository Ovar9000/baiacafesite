-- ==============================================================================
-- BAIA CAFE: FIRST-CARD BONUS STAMP (2026-11-06)
-- Run AFTER schema.sql / security-hardening.sql / 2026-09-30-audit-fixes.sql.
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
--
-- When a customer earns their 10th stamp (finishes their first card), the
-- database adds 1 bonus stamp on us. It lands on their next card, so card 2
-- needs 9 drinks instead of 10. The rule itself does not change: still 10
-- stamps per free coffee, and every count (redeem_loyalty_reward, the admin
-- roster, the card page) keeps working because the bonus is a normal stamps row.
--
-- Safe against double awards: a unique index allows only one bonus row per
-- account, ever. It is awarded by a trigger, so every way a stamp gets in
-- (QR scan, staff manual stamp, NFC tap card) is covered.
-- ==============================================================================

begin;

-- 1. Mark each stamp as earned (a bought drink) or bonus (given by us).
alter table public.stamps add column if not exists kind text not null default 'earned';
alter table public.stamps drop constraint if exists stamps_kind_check;
alter table public.stamps add constraint stamps_kind_check check (kind in ('earned', 'bonus'));

-- 2. The 1-stamp-per-day rule is about drinks, so it only counts earned stamps.
--    Without this the bonus would collide with the 10th stamp (same day).
--    The name stays the same so schema.sql / security-hardening.sql still skip it.
drop index if exists public.stamps_user_single_daily_stamp_idx;
create unique index stamps_user_single_daily_stamp_idx
  on public.stamps (user_id, (timezone('Asia/Manila', awarded_at)::date))
  where kind = 'earned';

-- 3. One bonus per account, ever. This is what makes a double award impossible.
create unique index if not exists stamps_user_first_card_bonus_idx
  on public.stamps (user_id)
  where kind = 'bonus';

-- 4. Award the bonus the moment the 10th earned stamp is recorded.
--    Exactly 10, not "10 or more": customers who finished their first card
--    before this ran don't get one on their next visit (see the optional
--    backfill at the bottom if you want to give it to them too).
--    Walk-in NFC card stamps without an account (user_id null) are skipped.
create or replace function public.award_first_card_bonus()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_earned int;
begin
  if new.kind <> 'earned' or new.user_id is null then
    return null;
  end if;

  select count(*) into v_earned
  from public.stamps
  where user_id = new.user_id
    and kind = 'earned';

  if v_earned = 10 then
    -- 1 ms after the 10th stamp so it sorts as stamp #11, the first on card 2
    insert into public.stamps (user_id, awarded_at, distance_meters, staff_note, kind)
    values (
      new.user_id,
      new.awarded_at + interval '1 millisecond',
      null,
      'First card bonus: 1 stamp on us',
      'bonus'
    )
    on conflict do nothing;
  end if;

  return null;
end;
$$;

revoke all on function public.award_first_card_bonus() from public, anon, authenticated;

drop trigger if exists stamps_first_card_bonus on public.stamps;
create trigger stamps_first_card_bonus
  after insert on public.stamps
  for each row execute function public.award_first_card_bonus();

commit;

-- ------------------------------------------------------------------------------
-- OPTIONAL BACKFILL (not run by default). Gives the bonus to customers who
-- already finished their first card before this migration. Heads up: anyone
-- sitting at 19 stamps would jump to 20 and unlock a free coffee right away.
-- Uncomment to run.
-- ------------------------------------------------------------------------------
-- insert into public.stamps (user_id, awarded_at, distance_meters, staff_note, kind)
-- select user_id,
--        (array_agg(awarded_at order by awarded_at, id))[10] + interval '1 millisecond',
--        null,
--        'First card bonus: 1 stamp on us',
--        'bonus'
-- from public.stamps
-- where kind = 'earned' and user_id is not null
-- group by user_id
-- having count(*) >= 10
-- on conflict do nothing;

-- Verify:
-- select column_name, data_type, column_default from information_schema.columns
--   where table_name = 'stamps' and column_name = 'kind';
-- select indexname, indexdef from pg_indexes
--   where tablename = 'stamps' and indexname in ('stamps_user_single_daily_stamp_idx', 'stamps_user_first_card_bonus_idx');
-- select tgname from pg_trigger where tgname = 'stamps_first_card_bonus';
-- select user_id, awarded_at, staff_note from public.stamps where kind = 'bonus' order by awarded_at desc limit 10;
