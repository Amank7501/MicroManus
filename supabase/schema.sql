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

-- ===== Phase 4: chats & messages =====
-- Unlike credits/api_keys, chat content is owned by the user and safe for
-- them to read/write directly through normal RLS ownership policies.

create extension if not exists pgcrypto;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now()
);

alter table public.chats enable row level security;

drop policy if exists "Users can view own chats" on public.chats;
create policy "Users can view own chats"
  on public.chats for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own chats" on public.chats;
create policy "Users can insert own chats"
  on public.chats for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own chats" on public.chats;
create policy "Users can update own chats"
  on public.chats for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own chats" on public.chats;
create policy "Users can delete own chats"
  on public.chats for delete
  using (auth.uid() = user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists "Users can view own messages" on public.messages;
create policy "Users can view own messages"
  on public.messages for select
  using (exists (
    select 1 from public.chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()
  ));

drop policy if exists "Users can insert own messages" on public.messages;
create policy "Users can insert own messages"
  on public.messages for insert
  with check (exists (
    select 1 from public.chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()
  ));

-- ===== Phase 5: agent tool calls =====
-- Widen messages to store tool-call turns (web search) alongside plain
-- chat turns, and add a stable insertion-order column — the agent loop
-- can insert several rows within the same millisecond, and created_at
-- alone isn't precise enough to reconstruct order reliably.

alter table public.messages drop constraint if exists messages_role_check;
alter table public.messages add constraint messages_role_check
  check (role in ('user', 'assistant', 'system', 'tool'));

alter table public.messages add column if not exists tool_calls jsonb;
alter table public.messages add column if not exists tool_call_id text;
alter table public.messages add column if not exists seq bigserial;

-- ===== Phase 6: PDF reports =====
-- Private storage bucket — like api_keys, only the server (service role)
-- ever reads or writes objects in it. If this insert fails on your Supabase
-- version due to permissions, create the bucket manually instead: Storage →
-- New bucket → name "reports" → Public bucket: OFF.

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  title text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "Users can view own reports" on public.reports;
create policy "Users can view own reports"
  on public.reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own reports" on public.reports;
create policy "Users can insert own reports"
  on public.reports for insert
  with check (auth.uid() = user_id);

-- ===== Phase 7: token usage & cost =====
-- One row per model call (a single agent run can make several — one per
-- tool-call round plus the final answer). user_id/chat_id are denormalized
-- from messages/chats so the stats page can aggregate without joins.

create table if not exists public.usage (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  cost numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.usage enable row level security;

drop policy if exists "Users can view own usage" on public.usage;
create policy "Users can view own usage"
  on public.usage for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own usage" on public.usage;
create policy "Users can insert own usage"
  on public.usage for insert
  with check (auth.uid() = user_id);

-- ===== Amendment: Ollama support (HTTP Basic auth instead of an API key) =====
-- Self-hosted Ollama has no API key concept — it's typically either
-- unprotected (local) or sits behind a reverse proxy with HTTP Basic Auth.
-- encrypted_key becomes optional (only used when auth_type = 'api_key');
-- encrypted_username/password are only used when auth_type = 'basic', and
-- may themselves be empty-string-encrypted if the instance needs no auth.

alter table public.api_keys alter column encrypted_key drop not null;
alter table public.api_keys add column if not exists auth_type text not null default 'api_key';
alter table public.api_keys add column if not exists encrypted_username text;
alter table public.api_keys add column if not exists encrypted_password text;

alter table public.api_keys drop constraint if exists api_keys_auth_type_check;
alter table public.api_keys add constraint api_keys_auth_type_check
  check (auth_type in ('api_key', 'basic'));
