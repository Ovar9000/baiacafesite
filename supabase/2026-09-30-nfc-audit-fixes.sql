-- ==============================================================================
-- BAIA CAFE — NFC CARD AUDIT FIXES (2026-09-30)
-- Run AFTER loyalty_cards_schema.sql and 2026-09-30-audit-fixes.sql.
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
-- ==============================================================================

-- 1. Card requests are created only by /api/request-physical-card (service_role).
--    The client INSERT policy let users bypass its checks (unlimited pending
--    requests, arbitrary status / price_php / fulfilled_by values).
drop policy if exists "Users can submit own card request" on public.card_requests;
revoke insert, update, delete on public.card_requests from anon, authenticated;
revoke insert, update, delete on public.loyalty_cards from anon, authenticated;

-- 2. Store real instants. timezone('Asia/Manila', now()) is Manila wall time with
--    no zone; saved into timestamptz it reads as UTC, i.e. 8 hours in the future.
alter table public.loyalty_cards alter column issued_at set default now();
alter table public.loyalty_cards alter column created_at set default now();
alter table public.card_requests alter column requested_at set default now();

-- 3. Shift existing skewed values back by 8h, exactly once (UTC databases only).
--    issued_at is only skewed where it came from the column default, i.e. where it
--    still equals created_at; re-linked cards have an API-written issued_at.
--    fulfilled_at and last_tapped_at were always written by the API and are correct.
do $$
begin
  if exists (select 1 from public.baia_migrations where id = '2026-09-30-nfc-card-tz') then
    raise notice 'NFC timestamp correction already applied — skipping';
  elsif current_setting('TimeZone') not in ('UTC', 'Etc/UTC', 'GMT', 'Etc/GMT') then
    raise notice 'Database TimeZone is %, not UTC — skipping timestamp correction; review manually', current_setting('TimeZone');
  else
    update public.loyalty_cards
      set issued_at = issued_at - interval '8 hours'
      where issued_at = created_at;
    update public.loyalty_cards
      set created_at = created_at - interval '8 hours';
    update public.card_requests
      set requested_at = requested_at - interval '8 hours';
    insert into public.baia_migrations (id) values ('2026-09-30-nfc-card-tz');
  end if;
end $$;

-- Verify:
-- select * from pg_policies where tablename in ('loyalty_cards', 'card_requests');  -- SELECT policies only
-- select id, requested_at, fulfilled_at from public.card_requests order by requested_at desc limit 5;
