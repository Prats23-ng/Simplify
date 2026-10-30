-- simplify — Supabase schema (safe to re-run; it only adds what is missing)
-- Run in: Supabase dashboard -> SQL Editor -> New query -> paste -> Run

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Add every column we need (works whether or not your table already has some of them)
alter table public.profiles add column if not exists email         text;
alter table public.profiles add column if not exists role          text;
alter table public.profiles add column if not exists interests     text[] not null default '{}';
alter table public.profiles add column if not exists reading_time  text;   -- '10 min' | '15 min' | '15+ min'
alter table public.profiles add column if not exists depth         text;   -- 'New to this' | 'Some knowledge' | 'Advanced'
alter table public.profiles add column if not exists delivery_time text;
alter table public.profiles add column if not exists onboarded     boolean not null default false;
alter table public.profiles add column if not exists progress      jsonb   not null default '{}'::jsonb; -- streak, points, stories read/saved, concepts, quiz results
alter table public.profiles add column if not exists updated_at    timestamptz not null default now();

-- If an older version of the table made reading_time numeric, make it text
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles'
               and column_name='reading_time' and data_type <> 'text') then
    alter table public.profiles alter column reading_time type text using reading_time::text;
  end if;
end $$;

-- Row Level Security: each user can only touch their own row
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- Create an empty profile row automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Sanity limits so one account can't store junk of unbounded size
alter table public.profiles drop constraint if exists profiles_progress_size;
alter table public.profiles add constraint profiles_progress_size
  check (pg_column_size(progress) < 200000);


-- ============================================================
-- Added: ask_log (daily AI question cap), events (usage analytics), feedback.
-- Safe to re-run. Run this whole file once in Supabase -> SQL Editor.
-- ============================================================

-- ask_log: one row per AI question attempt. /api/ask counts today's rows per user to enforce the daily cap.
-- No question text is stored.
create table if not exists public.ask_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ask_log_user_day on public.ask_log (user_id, created_at);
alter table public.ask_log enable row level security;
drop policy if exists "ask_log_select_own" on public.ask_log;
drop policy if exists "ask_log_insert_own" on public.ask_log;
create policy "ask_log_select_own" on public.ask_log
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ask_log_insert_own" on public.ask_log
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- events: insert-only usage events (story ids and counts only, never personal text).
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  anon_id    text not null check (char_length(anon_id) between 8 and 64),
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null check (char_length(name) between 1 and 40),
  props      jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2000),
  created_at timestamptz not null default now()
);
create index if not exists events_name_time on public.events (name, created_at);
alter table public.events enable row level security;
drop policy if exists "events_insert_any" on public.events;
create policy "events_insert_any" on public.events
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
-- No select policy on purpose: read events from the Supabase dashboard only.

-- feedback: insert-only messages from the feedback box.
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  anon_id    text check (anon_id is null or char_length(anon_id) between 8 and 64),
  user_id    uuid references auth.users(id) on delete set null,
  message    text not null check (char_length(message) between 1 and 2000),
  contact    text check (contact is null or char_length(contact) <= 200),
  page       text check (page is null or char_length(page) <= 100),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback_insert_any" on public.feedback;
create policy "feedback_insert_any" on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));


-- ============================================================
-- Added: human-reviewed live stories. A daily job drafts stories (status 'draft');
-- only an admin can approve them in /review; the app shows only 'approved'.
-- ============================================================

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins_select_own" on public.admins;
create policy "admins_select_own" on public.admins
  for select to authenticated using ((select auth.uid()) = user_id);

-- First signed-in caller becomes the admin (used once from the /review page). Later calls only report status.
create or replace function public.claim_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.admins) then
    return exists (select 1 from public.admins where user_id = auth.uid());
  end if;
  insert into public.admins (user_id) values (auth.uid());
  return true;
end;
$$;
revoke all on function public.claim_admin() from public, anon;
grant execute on function public.claim_admin() to authenticated;

create table if not exists public.stories_live (
  id            text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  status        text not null default 'draft' check (status in ('draft','approved','rejected')),
  date          date not null,
  category      text not null check (char_length(category) <= 40),
  tags          text[] not null default '{}',
  headline      text not null check (char_length(headline) between 1 and 300),
  dek           text not null default '' check (char_length(dek) <= 600),
  read_mins     int  not null default 3 check (read_mins between 1 and 15),
  relevance     text not null default '' check (char_length(relevance) <= 200),
  what_happened text not null default '' check (char_length(what_happened) <= 1200),
  why           text not null default '' check (char_length(why) <= 1200),
  matters       text not null default '' check (char_length(matters) <= 1200),
  next_text     text not null default '' check (char_length(next_text) <= 1000),
  affected      text[] not null default '{}',
  concepts      text[] not null default '{}',
  source_name   text not null default '' check (char_length(source_name) <= 80),
  source_url    text not null unique check (source_url ~ '^https?://'),
  published_at  timestamptz,
  raw_title     text,
  ai_model      text,
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists stories_live_status_date on public.stories_live (status, date desc);
alter table public.stories_live enable row level security;
drop policy if exists "stories_live_read_approved" on public.stories_live;
drop policy if exists "stories_live_admin_select" on public.stories_live;
drop policy if exists "stories_live_admin_update" on public.stories_live;
drop policy if exists "stories_live_admin_delete" on public.stories_live;
create policy "stories_live_read_approved" on public.stories_live
  for select to anon, authenticated using (status = 'approved');
create policy "stories_live_admin_select" on public.stories_live
  for select to authenticated using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "stories_live_admin_update" on public.stories_live
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "stories_live_admin_delete" on public.stories_live
  for delete to authenticated using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
-- Inserts come only from the daily job using the service key (which bypasses RLS). No public insert policy.
