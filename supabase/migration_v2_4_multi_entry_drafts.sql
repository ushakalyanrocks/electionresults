-- ============================================================
-- Migration v2.4 — Multi-Constituency Entry drafts in DB
-- One row per user. Stores the whole multi-entry session
-- (selected seats, gridOpen, per-card drafts) as jsonb so the
-- user can continue from ANY machine / browser with the same login.
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================

create table if not exists public.multi_entry_drafts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.multi_entry_drafts enable row level security;

-- Each user can only see / write / delete THEIR OWN draft row.
drop policy if exists med_select_own on public.multi_entry_drafts;
create policy med_select_own on public.multi_entry_drafts
  for select using (auth.uid() = user_id);

drop policy if exists med_insert_own on public.multi_entry_drafts;
create policy med_insert_own on public.multi_entry_drafts
  for insert with check (auth.uid() = user_id);

drop policy if exists med_update_own on public.multi_entry_drafts;
create policy med_update_own on public.multi_entry_drafts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists med_delete_own on public.multi_entry_drafts;
create policy med_delete_own on public.multi_entry_drafts
  for delete using (auth.uid() = user_id);
