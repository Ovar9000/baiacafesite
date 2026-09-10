-- ==============================================================================
-- BAIA Cafe — Community Photowall migration (Supabase)
-- ------------------------------------------------------------------------------
-- Run this ONCE in Supabase Dashboard → SQL Editor (or via `supabase db push`).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DROP+CREATE).
--
-- What it creates:
--  1. public.community_wall — one row per wall photo, synced from Facebook
--     shared/tagged posts by scripts/sync-guest-photos.js (service_role).
--  2. community-cache — public storage bucket for cached wall images
--     (same pattern as the drops-cache bucket).
--  3. RLS: public read-only. Writes happen exclusively with the
--     SUPABASE_SERVICE_ROLE_KEY (bypasses RLS), mirroring public.drops.
-- ==============================================================================

-- 5. Community Wall table (mirrors `drops` conventions in schema.sql)
create table if not exists public.community_wall (
  id text primary key,
  photo_url text not null,
  caption text,
  guest_name text,
  tagline text,
  date text,
  rating integer not null default 5,
  source text,
  permalink text,
  tilt text,
  gc integer,
  gr integer,
  mgc integer,
  mgr integer,
  z integer,
  created_at timestamptz default now() not null
);

create index if not exists community_wall_created_idx
  on public.community_wall (created_at desc);

alter table public.community_wall enable row level security;

-- Public read-only (writes via service_role only)
drop policy if exists "Anyone can view community wall" on public.community_wall;
create policy "Anyone can view community wall" on public.community_wall
  for select using (true);

-- Explicitly ensure no client-side write policies exist
drop policy if exists "Users can insert community wall" on public.community_wall;
drop policy if exists "Users can update community wall" on public.community_wall;
drop policy if exists "Users can delete community wall" on public.community_wall;

-- 6. Public image bucket for cached wall photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-cache',
  'community-cache',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read on cached wall images (scoped to this bucket only)
drop policy if exists "Public read community-cache" on storage.objects;
create policy "Public read community-cache" on storage.objects
  for select using (bucket_id = 'community-cache');
