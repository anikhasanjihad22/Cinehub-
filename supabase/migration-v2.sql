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
