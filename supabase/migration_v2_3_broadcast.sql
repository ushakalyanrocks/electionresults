-- ============================================================
-- Migration v2.3 — YouTube/OBS Broadcast Panel System
-- Run once, after migration_v2_2.sql.
--
-- Adds:
--   1) alliances.leader_photo_url / leader_name  (ticker face)
--   2) alliances.last_election_seats             (scoreboard ▲▼ swing)
--   3) parties.symbol_url                        (ticker / spotlight symbol)
--   4) broadcast_control singleton               (producer live control)
-- All columns are optional — panels fall back to colored initial
-- chips when photo/symbol URLs are null, so nothing breaks if the
-- desk never uploads images.
-- ============================================================

-- ---------- 1+2. Alliance broadcast fields ----------
alter table public.alliances
  add column if not exists leader_name text,
  add column if not exists leader_photo_url text,
  add column if not exists last_election_seats int not null default 0;

-- Seed 2021 results for the ▲▼ swing (EDIT if your baseline differs —
-- e.g. if you want party-level or a by-election baseline instead):
update public.alliances set last_election_seats = 159 where code = 'dmk';
update public.alliances set last_election_seats = 75  where code = 'admk';
update public.alliances set last_election_seats = 0   where code = 'tvk';
update public.alliances set last_election_seats = 0   where code = 'ntk';
update public.alliances set last_election_seats = 0   where code = 'oth';

-- ---------- 3. Party symbol ----------
alter table public.parties
  add column if not exists symbol_url text;

-- ---------- 4. Producer control (singleton, like election_config) ----------
-- The producer panel writes here; every open OBS Browser Source panel is
-- subscribed via realtime and reacts instantly — no mid-broadcast edits.
--   spotlight_constituency_id + spotlight_pinned=true  → spotlight panel
--     locks onto that seat; pinned=false → resumes auto-rotation.
--   district_code → district panels (those without a hard ?lock=1) switch
--     to that district; null → panels fall back to their ?code= param.
create table if not exists public.broadcast_control (
  id int primary key default 1,
  spotlight_constituency_id int references constituencies(id),
  spotlight_pinned boolean not null default false,
  district_code text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now(),
  constraint broadcast_control_singleton check (id = 1)
);

insert into public.broadcast_control (id) values (1) on conflict (id) do nothing;

-- Realtime (guarded so re-running the file doesn't error)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'broadcast_control'
  ) then
    alter publication supabase_realtime add table public.broadcast_control;
  end if;
end $$;

-- RLS: any authenticated user (i.e. every logged-in OBS panel) can read;
-- only admin can push. Same pattern as election_config.
alter table public.broadcast_control enable row level security;

drop policy if exists bcast_read on public.broadcast_control;
create policy bcast_read on public.broadcast_control
  for select using (auth.role() = 'authenticated');

drop policy if exists bcast_admin_update on public.broadcast_control;
create policy bcast_admin_update on public.broadcast_control
  for update using (is_admin()) with check (is_admin());

drop policy if exists bcast_admin_insert on public.broadcast_control;
create policy bcast_admin_insert on public.broadcast_control
  for insert with check (is_admin());
