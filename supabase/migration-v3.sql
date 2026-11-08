-- Optional: lets the sign-in screen show real posters on the very first launch
-- (before anyone has signed in). Run once in the Supabase SQL editor.
--
-- It exposes ONLY the TMDB key you saved in the admin panel, to the signed-out
-- app. A TMDB key is a free, read-only key, but if you would rather not expose
-- it, skip this file: posters then appear from the second launch onwards.

create or replace function public.get_public_tmdb_key()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select value from public.app_settings where key = 'tmdb_api_key' limit 1;
$$;

revoke all on function public.get_public_tmdb_key() from public;
grant execute on function public.get_public_tmdb_key() to anon, authenticated;

-- Watch Together needs no SQL: it uses Supabase Realtime broadcast, which is
-- enabled by default (Project Settings -> API -> Realtime must not be disabled).
