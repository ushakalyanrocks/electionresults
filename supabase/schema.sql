-- ============================================================
-- TJ Election Results v2 — Supabase Schema + RLS
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- ============================================================

-- ---------- 1. ROLES ----------
create table if not exists public.rolemapping (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','field_entry','viewer')),
  full_name text,
  created_at timestamptz default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from rolemapping where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_field_entry() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from rolemapping where user_id = auth.uid() and role in ('admin','field_entry'));
$$;

-- ---------- 2. ALLIANCES & PARTIES ----------
create table if not exists public.alliances (
  code text primary key,
  name text not null,
  color text not null,
  sort_order int default 0
);

create table if not exists public.parties (
  code text primary key,
  name text not null,
  alliance_code text references alliances(code),
  color text,
  sort_order int default 0
);

-- ---------- 3. CONSTITUENCIES (master, all 234) ----------
create table if not exists public.constituencies (
  id int primary key,
  name_en text not null,
  name_ta text,
  district text not null,
  seat_no int
);

-- ---------- 4. ELECTION CONFIG (admin-controlled scope, singleton row) ----------
create table if not exists public.election_config (
  id int primary key default 1,
  mode text not null default 'general' check (mode in ('general','by_election')),
  selected_constituency_ids int[] default '{}',
  majority_line int default 118,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now(),
  constraint singleton check (id = 1)
);
insert into public.election_config (id, mode) values (1,'general') on conflict (id) do nothing;

-- ---------- 5. CANDIDATES ----------
create table if not exists public.candidates (
  id bigserial primary key,
  constituency_id int references constituencies(id) on delete cascade,
  party_code text references parties(code),
  candidate_name text not null,
  photo_url text,
  unique(constituency_id, party_code)
);

-- ---------- 6. CONSTITUENCY STATUS (live, one row per constituency) ----------
create table if not exists public.constituency_status (
  constituency_id int primary key references constituencies(id) on delete cascade,
  status text not null default 'waitlist' check (status in ('waitlist','counting','declared')),
  manual_leader_party text references parties(code),
  manual_leader_round int,
  current_round int default 0,
  winning_margin int,
  updated_at timestamptz default now()
);

-- ---------- 7. PARTY VOTES (round-wise, per PARTY not just alliance) ----------
create table if not exists public.party_votes (
  id bigserial primary key,
  constituency_id int references constituencies(id) on delete cascade,
  party_code text references parties(code),
  round int not null,
  votes int not null check (votes >= 0),
  is_estimated boolean default false,
  entry_mode text default 'total' check (entry_mode in ('total','round_only')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(constituency_id, party_code, round)
);

-- ---------- 8. UPDATE LOGS (chat-style feed) ----------
create table if not exists public.update_logs (
  id bigserial primary key,
  constituency_id int references constituencies(id),
  party_code text,
  round int,
  action text,
  message text,
  actor uuid references auth.users(id),
  actor_name text,
  reason text,
  created_at timestamptz default now()
);

-- ---------- 9. AUDIT LOG (manual corrections) ----------
create table if not exists public.audit_log (
  id bigserial primary key,
  table_name text,
  row_id text,
  field text,
  old_value text,
  new_value text,
  reason text,
  actor uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ---------- 10. VIEW: constituencies_latest ----------
-- security_invoker = true means the view respects the CALLER's RLS, not the
-- view owner's — same pattern used on the Charan Logistics driver app.
create or replace view public.constituencies_latest
with (security_invoker = true) as
select
  c.id, c.name_en, c.name_ta, c.district, c.seat_no,
  coalesce(s.status,'waitlist') as status,
  s.manual_leader_party, s.manual_leader_round,
  coalesce(s.current_round,0) as current_round,
  s.winning_margin, s.updated_at
from constituencies c
left join constituency_status s on s.constituency_id = c.id;

-- ---------- 11. TRIGGER: keep constituency_status.current_round in sync ----------
create or replace function public.trg_touch_status() returns trigger
language plpgsql as $$
begin
  update constituency_status
    set current_round = greatest(current_round, new.round), updated_at = now()
    where constituency_id = new.constituency_id;
  if not found then
    insert into constituency_status(constituency_id, current_round, status)
    values (new.constituency_id, new.round, 'counting');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_party_votes_touch on public.party_votes;
create trigger trg_party_votes_touch
after insert or update on public.party_votes
for each row execute function public.trg_touch_status();

-- ---------- 12. Realtime ----------
alter publication supabase_realtime add table public.party_votes;
alter publication supabase_realtime add table public.constituency_status;
alter publication supabase_realtime add table public.update_logs;
alter publication supabase_realtime add table public.election_config;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.rolemapping enable row level security;
alter table public.alliances enable row level security;
alter table public.parties enable row level security;
alter table public.constituencies enable row level security;
alter table public.election_config enable row level security;
alter table public.candidates enable row level security;
alter table public.constituency_status enable row level security;
alter table public.party_votes enable row level security;
alter table public.update_logs enable row level security;
alter table public.audit_log enable row level security;

-- rolemapping
drop policy if exists rolemapping_select_self on public.rolemapping;
create policy rolemapping_select_self on public.rolemapping for select using (user_id = auth.uid() or is_admin());
drop policy if exists rolemapping_admin_all on public.rolemapping;
create policy rolemapping_admin_all on public.rolemapping for all using (is_admin()) with check (is_admin());

-- read-only master/live data: any authenticated user can read
drop policy if exists alliances_read on public.alliances;
create policy alliances_read on public.alliances for select using (auth.role() = 'authenticated');
drop policy if exists parties_read on public.parties;
create policy parties_read on public.parties for select using (auth.role() = 'authenticated');
drop policy if exists constituencies_read on public.constituencies;
create policy constituencies_read on public.constituencies for select using (auth.role() = 'authenticated');
drop policy if exists candidates_read on public.candidates;
create policy candidates_read on public.candidates for select using (auth.role() = 'authenticated');
drop policy if exists status_read on public.constituency_status;
create policy status_read on public.constituency_status for select using (auth.role() = 'authenticated');
drop policy if exists votes_read on public.party_votes;
create policy votes_read on public.party_votes for select using (auth.role() = 'authenticated');
drop policy if exists logs_read on public.update_logs;
create policy logs_read on public.update_logs for select using (auth.role() = 'authenticated');

-- election_config: everyone authenticated reads the current scope;
-- ONLY admin can change it — this is what enforces "constituency
-- selection at admin level only, not browser level".
drop policy if exists config_read on public.election_config;
create policy config_read on public.election_config for select using (auth.role() = 'authenticated');
drop policy if exists config_admin_write on public.election_config;
create policy config_admin_write on public.election_config for update using (is_admin()) with check (is_admin());
drop policy if exists config_admin_insert on public.election_config;
create policy config_admin_insert on public.election_config for insert with check (is_admin());

-- master data writes: admin only
drop policy if exists alliances_admin_write on public.alliances;
create policy alliances_admin_write on public.alliances for insert with check (is_admin());
drop policy if exists alliances_admin_update on public.alliances;
create policy alliances_admin_update on public.alliances for update using (is_admin()) with check (is_admin());
drop policy if exists alliances_admin_delete on public.alliances;
create policy alliances_admin_delete on public.alliances for delete using (is_admin());

drop policy if exists parties_admin_write on public.parties;
create policy parties_admin_write on public.parties for insert with check (is_admin());
drop policy if exists parties_admin_update on public.parties;
create policy parties_admin_update on public.parties for update using (is_admin()) with check (is_admin());
drop policy if exists parties_admin_delete on public.parties;
create policy parties_admin_delete on public.parties for delete using (is_admin());

drop policy if exists constituencies_admin_write on public.constituencies;
create policy constituencies_admin_write on public.constituencies for insert with check (is_admin());
drop policy if exists constituencies_admin_update on public.constituencies;
create policy constituencies_admin_update on public.constituencies for update using (is_admin()) with check (is_admin());
drop policy if exists constituencies_admin_delete on public.constituencies;
create policy constituencies_admin_delete on public.constituencies for delete using (is_admin());

drop policy if exists candidates_admin_write on public.candidates;
create policy candidates_admin_write on public.candidates for insert with check (is_admin());
drop policy if exists candidates_admin_update on public.candidates;
create policy candidates_admin_update on public.candidates for update using (is_admin()) with check (is_admin());
drop policy if exists candidates_admin_delete on public.candidates;
create policy candidates_admin_delete on public.candidates for delete using (is_admin());

-- field entry: field_entry + admin can write votes & status
drop policy if exists votes_field_insert on public.party_votes;
create policy votes_field_insert on public.party_votes for insert with check (is_field_entry());
drop policy if exists votes_field_update on public.party_votes;
create policy votes_field_update on public.party_votes for update using (is_field_entry()) with check (is_field_entry());
drop policy if exists votes_field_delete on public.party_votes;
create policy votes_field_delete on public.party_votes for delete using (is_field_entry());

drop policy if exists status_field_write on public.constituency_status;
create policy status_field_write on public.constituency_status for insert with check (is_field_entry());
drop policy if exists status_field_update on public.constituency_status;
create policy status_field_update on public.constituency_status for update using (is_field_entry()) with check (is_field_entry());

-- logs: field entry + admin can insert; only admin can delete (immutable feed otherwise)
drop policy if exists logs_field_insert on public.update_logs;
create policy logs_field_insert on public.update_logs for insert with check (is_field_entry());
drop policy if exists logs_admin_delete on public.update_logs;
create policy logs_admin_delete on public.update_logs for delete using (is_admin());

-- audit: admin only
drop policy if exists audit_admin_all on public.audit_log;
create policy audit_admin_all on public.audit_log for all using (is_admin()) with check (is_admin());

-- ============================================================
-- SEED: alliances + parties (edit party membership as candidates are finalized)
-- ============================================================
insert into public.alliances (code, name, color, sort_order) values
  ('dmk',  'DMK+',   '#e0223b', 1),
  ('admk', 'ADMK+',  '#0a9d4f', 2),
  ('tvk',  'TVK',    '#9b30d0', 3),
  ('ntk',  'NTK',    '#ff8c00', 4),
  ('oth',  'Others', '#7d8296', 5)
on conflict (code) do update set name = excluded.name, color = excluded.color, sort_order = excluded.sort_order;

insert into public.parties (code, name, alliance_code, color, sort_order) values
  ('dmk', 'DMK', 'dmk', '#e0223b', 1),
  ('cpi', 'CPI', 'dmk', '#c0392b', 2),
  ('cpm', 'CPM', 'dmk', '#a93226', 3),
  ('vck', 'VCK', 'dmk', '#922b21', 4),
  ('admk', 'ADMK', 'admk', '#0a9d4f', 1),
  ('pmk', 'PMK', 'admk', '#0e8f47', 2),
  ('tvk', 'TVK', 'tvk', '#9b30d0', 1),
  ('ntk', 'NTK', 'ntk', '#ff8c00', 1),
  ('oth', 'Others/Independent', 'oth', '#7d8296', 1)
on conflict (code) do update set name = excluded.name, alliance_code = excluded.alliance_code, color = excluded.color;

-- ============================================================
-- NOTE ON CONSTITUENCY SEED DATA
-- ============================================================
-- The 234 constituency names/districts were not present in the old v1 zip
-- (they already lived in your existing Supabase project). Two options:
--   1) If reusing the SAME Supabase project as v1: this schema adds NEW
--      tables (constituency_status, party_votes v2, election_config, etc.)
--      alongside old ones — just run:
--        insert into public.constituencies (id, name_en, district)
--        select id, name, district from public.constituencies_latest; -- old table/view
--      then drop the old table/view once verified.
--   2) Fresh project: import your 234-row constituency CSV with
--      supabase/seed_constituencies_template.csv as the column reference.
