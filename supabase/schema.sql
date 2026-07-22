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

-- ===== Phase 3: api_keys =====
-- Stores each user's BYO LLM connection: provider, endpoint, an encrypted
-- API key, and the selected model. No RLS policy is defined for the
-- `authenticated` role at all — every read and write goes through server
-- routes using the service role key, so the encrypted key (and even the
-- fact that a row exists) is never queryable directly from the browser.

create table if not exists public.api_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null,
  endpoint text not null,
  encrypted_key text not null,
  selected_model text not null,
  status text not null default 'untested',
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.api_keys enable row level security;
