-- ==============================================================================
-- BAIA CAFÉ — PHYSICAL NFC LOYALTY CARDS & CARD REQUESTS SCHEMA
-- Execute this script in your Supabase Project SQL Editor
-- Supports 13.56MHz NFC Cards (NTAG215/213) with factory read-only UIDs
-- ==============================================================================

-- 1. Loyalty Cards Table (Maps physical hardware UIDs to member profiles)
create table if not exists public.loyalty_cards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  card_uid text unique not null,
  card_label text default 'Baia Vinyl Tap Card',
  status text default 'active' check (status in ('active', 'deactivated', 'lost')),
  issued_at timestamptz default now() not null,
  last_tapped_at timestamptz,
  created_at timestamptz default now() not null
);

-- Optimize lookups when customer taps card at counter scanner
create index if not exists idx_loyalty_cards_uid on public.loyalty_cards (card_uid);
create index if not exists idx_loyalty_cards_user on public.loyalty_cards (user_id);

-- 2. Card Requests Table (Self-service requests submitted from baia.cafe/card)
create table if not exists public.card_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'fulfilled', 'cancelled')),
  price_php numeric default 120 not null,
  includes_free_coffee boolean default true not null,
  free_coffee_redeemed boolean default false not null,
  requested_at timestamptz default now() not null,
  fulfilled_at timestamptz,
  fulfilled_by text,
  notes text
);

create index if not exists idx_card_requests_user on public.card_requests (user_id);
create index if not exists idx_card_requests_status on public.card_requests (status);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
alter table public.loyalty_cards enable row level security;
alter table public.card_requests enable row level security;

-- Loyalty Cards Policies:
-- Users can view their own registered card
drop policy if exists "Users can view own loyalty cards" on public.loyalty_cards;
create policy "Users can view own loyalty cards" on public.loyalty_cards
  for select using (auth.uid() = user_id);

-- Card Requests Policies:
-- Users can view their own card requests
drop policy if exists "Users can view own card requests" on public.card_requests;
create policy "Users can view own card requests" on public.card_requests
  for select using (auth.uid() = user_id);

-- No client INSERT: requests go through /api/request-physical-card (service_role),
-- which enforces one pending request / no active card and fixed price fields.
drop policy if exists "Users can submit own card request" on public.card_requests;

-- Ensure service_role has full access for backend APIs
grant all on public.loyalty_cards to service_role;
grant all on public.card_requests to service_role;
