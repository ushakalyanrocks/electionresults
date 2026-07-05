-- ============================================================
-- Migration v2.1 — fixes for:
--   1) alliance breakdown not reflecting party moves (missing party rows)
--   2) no way to assign roles to new users from the app
-- Run once in Supabase SQL editor.
-- ============================================================

-- ---------- 1. Add parties that were referenced in an UPDATE but never seeded ----------
-- Your earlier statement:
--   update parties set alliance_code = 'tvk' where code in ('inc','vck','cpi','cpm','iuml');
-- 'inc' and 'iuml' didn't exist yet, so that update matched 0 rows for them.
-- This inserts them (edit name/color if you want something different) and
-- re-applies the alliance move for the full set in one place.
insert into public.parties (code, name, alliance_code, color, sort_order) values
  ('inc',  'INC',  'tvk', '#0b6fbf', 5),
  ('iuml', 'IUML', 'tvk', '#2e9e4f', 6)
on conflict (code) do update set alliance_code = excluded.alliance_code;

update public.parties
set alliance_code = 'tvk'
where code in ('inc','vck','cpi','cpm','iuml');

-- Sanity check — run this after, to confirm every party has a valid alliance:
--   select code, name, alliance_code from public.parties order by alliance_code, sort_order;

-- ---------- 2. Admin-only lookup: find a user's id by email ----------
-- The client can't query auth.users directly (no anon/authenticated grant on it).
-- This function runs as definer but is gated by is_admin(), so only an admin
-- session can ever get a result back — everyone else gets an empty set.
create or replace function public.admin_lookup_user_by_email(p_email text)
returns table(id uuid, email text)
language sql security definer set search_path = public as $$
  select u.id, u.email
  from auth.users u
  where u.email = p_email
    and public.is_admin();
$$;

revoke all on function public.admin_lookup_user_by_email(text) from public;
grant execute on function public.admin_lookup_user_by_email(text) to authenticated;

-- ---------- 3. Admin-only listing: current rolemapping + email, for the Users panel ----------
create or replace function public.admin_list_users()
returns table(user_id uuid, email text, role text, full_name text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select u.id, u.email, r.role, r.full_name, r.created_at
  from auth.users u
  left join public.rolemapping r on r.user_id = u.id
  where public.is_admin()
  order by u.created_at desc;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;
