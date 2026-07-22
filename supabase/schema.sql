-- MicroManus — Supabase schema
-- Run each phase's block in the Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to re-run: statements use IF NOT EXISTS / OR REPLACE where possible.

-- ===== Phase 2: credits =====
-- One row per user. No INSERT/UPDATE/DELETE policy is defined for the
-- `authenticated` role on purpose — only the server (via the service role
-- key, which bypasses RLS) is allowed to grant or change credits. Users can
-- only ever read their own balance.

create table if not exists public.credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.credits enable row level security;

drop policy if exists "Users can view own credits" on public.credits;
create policy "Users can view own credits"
  on public.credits for select
  using (auth.uid() = user_id);
