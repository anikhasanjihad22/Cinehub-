-- CineHub — Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query → Run

create extension if not exists pgcrypto;

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_color text not null default '#E50914',
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Security-definer helper so policies can check "am I admin?" without recursion
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create a profile whenever someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist
insert into public.profiles (id, email, display_name)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users may only change their own name/colour. `role` can NOT be changed from the app.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_color) on public.profiles to authenticated;

-- ───────────────────────── servers (providers) ─────────────────────────
-- One row = one provider source you add from the in-app Admin Panel.
-- Users never see the real provider name — only `label` (e.g. "Server 1").
create table if not exists public.cinehub_servers (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,              -- what USERS see, e.g. "Server 1"
  source_url     text not null,              -- repo / manifest URL of the provider source
  manifest_url   text,                       -- optional explicit manifest.json URL
  provider_value text,                       -- optional: install only this provider from the source
  position       integer not null default 0, -- order users see them in
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.cinehub_servers enable row level security;

drop policy if exists "servers_select" on public.cinehub_servers;
create policy "servers_select" on public.cinehub_servers
  for select to authenticated
  using (enabled or public.is_admin());

drop policy if exists "servers_admin_insert" on public.cinehub_servers;
create policy "servers_admin_insert" on public.cinehub_servers
  for insert to authenticated with check (public.is_admin());

drop policy if exists "servers_admin_update" on public.cinehub_servers;
create policy "servers_admin_update" on public.cinehub_servers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "servers_admin_delete" on public.cinehub_servers;
create policy "servers_admin_delete" on public.cinehub_servers
  for delete to authenticated using (public.is_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists servers_touch on public.cinehub_servers;
create trigger servers_touch before update on public.cinehub_servers
  for each row execute function public.touch_updated_at();

-- ───────────────────────── make YOURSELF admin ─────────────────────────
-- 1) Sign up once inside the app with your email.
-- 2) Then run this (replace the email) :
--
--   update public.profiles set role = 'admin' where email = 'YOUR_EMAIL@example.com';
-- ───────────── CineHub migration v2 (run ONCE in Supabase → SQL editor) ─────────────
-- 1) Admin-controlled app settings (TMDB API key lives here, users never type it)
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "settings_select" on public.app_settings;
create policy "settings_select" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "settings_admin_insert" on public.app_settings;
create policy "settings_admin_insert" on public.app_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "settings_admin_update" on public.app_settings;
create policy "settings_admin_update" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_admin_delete" on public.app_settings;
create policy "settings_admin_delete" on public.app_settings
  for delete to authenticated using (public.is_admin());

drop trigger if exists settings_touch on public.app_settings;
create trigger settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- 2) Admin can hide single providers inside a server
alter table public.cinehub_servers
  add column if not exists hidden_providers text[] not null default '{}';
