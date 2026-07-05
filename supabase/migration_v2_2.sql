-- ============================================================
-- Migration v2.2 — auto-compute winning_margin
-- Run once, after migration_v2_1.sql.
-- ============================================================

-- ---------- 1. Current standing total per party per constituency ----------
-- Honors the "Total is the source of truth" rule discussed for reconciling
-- round-only vs total entries: take the latest 'total' entry as a baseline,
-- then add any 'round_only' entries submitted AFTER that round. If no
-- 'total' entry exists yet, just sum every 'round_only' entry so far.
create or replace function public.party_current_total(p_constituency_id int, p_party_code text)
returns bigint
language sql stable as $$
  with last_total as (
    select round, votes from public.party_votes
    where constituency_id = p_constituency_id and party_code = p_party_code and entry_mode = 'total'
    order by round desc limit 1
  )
  select
    coalesce((select votes from last_total), 0)
    + coalesce((
        select sum(votes) from public.party_votes
        where constituency_id = p_constituency_id and party_code = p_party_code
          and entry_mode = 'round_only'
          and round > coalesce((select round from last_total), 0)
      ), 0);
$$;

-- ---------- 2. Recompute winning_margin = (1st place total) - (2nd place total) ----------
create or replace function public.recompute_margin(p_constituency_id int) returns void
language plpgsql as $$
declare
  v_margin bigint;
begin
  with contesting as (
    select distinct party_code from public.party_votes where constituency_id = p_constituency_id
  ), totals as (
    select party_code, public.party_current_total(p_constituency_id, party_code) as total
    from contesting
  ), ranked as (
    select total, row_number() over (order by total desc) rn
    from totals
  )
  select (select total from ranked where rn = 1) - coalesce((select total from ranked where rn = 2), 0)
  into v_margin;

  update public.constituency_status
  set winning_margin = v_margin
  where constituency_id = p_constituency_id;
end;
$$;

-- ---------- 3. Hook it into the existing party_votes trigger ----------
-- trg_touch_status already runs after every insert/update on party_votes
-- and keeps current_round in sync — extend it to also recompute margin,
-- so the Margin column / "top margin wins" chart populate automatically
-- as soon as any vote count is entered, no manual step required.
create or replace function public.trg_touch_status() returns trigger
language plpgsql as $$
begin
  update public.constituency_status
    set current_round = greatest(current_round, new.round), updated_at = now()
    where constituency_id = new.constituency_id;
  if not found then
    insert into public.constituency_status(constituency_id, current_round, status)
    values (new.constituency_id, new.round, 'counting');
  end if;

  perform public.recompute_margin(new.constituency_id);

  return new;
end;
$$;

-- ---------- 4. Backfill margin for any votes already entered ----------
do $$
declare
  cid int;
begin
  for cid in select distinct constituency_id from public.party_votes loop
    perform public.recompute_margin(cid);
  end loop;
end $$;
