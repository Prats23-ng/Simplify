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
