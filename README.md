# TJ Election Results v2 — React + Vite + Supabase

## What's implemented (Phase 1 + 2 + core of Phase 3 from the spec)
- Dark/light glassmorphism UI, EN/Tamil toggle, sticky header with live clock
- Login (Supabase Auth email/password) + role badge, role-based access via `rolemapping`
- Hero scoreboard: alliance totals with count-up, alliance/party view toggle, pin-favorite, majority bar, trend arrows
- Status strip (waitlist/counting/declared progress rings)
- Filters (search, status, alliance, district) + sortable, paginated results table with expandable round-wise detail, mobile card view
- Data entry: Status-only vs Vote-count modes, This-round vs Total-so-far, round gap detection + backfill/estimated flag, duplicate-entry guard, 30s undo, confirmation screen
- Update log (chat-style feed, newest first)
- Summary tab: seat-share donut, top-margin bar chart, declared-progress line
- Broadcast view at `?mode=broadcast` — big numbers, scrolling ticker, no nav chrome
- Realtime sync (Supabase Realtime) + 15s polling fallback + pagination-safe fetch (loops past the 1000-row cap) + integrity-check banner
- **Election scope (General/By-election + which constituencies) is admin-only** — set in Settings (⚙, visible only to admin role), enforced again server-side via RLS so no client can widen/narrow scope themselves

## Deferred (marked optional in the spec, not built yet — say the word and I'll add them)
PIN/biometric login, GPS booth tagging, photo-attach proof, voice entry, supervisor approval queue, CSV/PDF export, print view, offline entry queue, multi-monitor dual-tab *sync* (the broadcast tab opens fine, just not lock-stepped beyond shared realtime data).

## 1. Supabase setup
1. Create a Supabase project (or reuse your existing TamilJanam one).
2. Open SQL editor → run `supabase/schema.sql` in full. It creates every table, the `constituencies_latest` view, triggers, realtime publication, and **all RLS policies**.
3. Seed the 234 constituencies:
   - If reusing your v1 project, run the one-line migration noted at the bottom of `schema.sql`.
   - Otherwise fill `supabase/seed_constituencies_template.csv` with your real 234 rows and import via Table Editor → Import CSV into `constituencies`.
4. Create user accounts in Authentication → Users, then give each one a role:
   ```sql
   insert into public.rolemapping (user_id, role, full_name)
   values ('<uuid-from-auth-users>', 'admin', 'Karthik');
   ```
   Roles: `admin` (full control + election scope), `field_entry` (can submit rounds/status), `viewer` (read-only, default if no row exists).

## 2. Local dev
```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

## 3. Deploy to GitHub Pages
1. Push this project to a new repo, e.g. `tjnewsroom/tjelectionresults-v2`.
2. If your repo name differs, update `REPO_NAME` in `vite.config.js`.
3. Repo → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Repo → Settings → Secrets and variables → Actions → add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Push to `main` — `.github/workflows/deploy.yml` builds and publishes automatically.

## Notes
- Constituency scope is stored in the single-row `election_config` table and read by every client; only `is_admin()` can write to it (RLS-enforced), so there is no way to change scope from a browser other than the admin Settings panel.
- `party_votes` now tracks **per-party** (not just per-alliance) rounds — the nested breakdown in the hero cards reads directly from this.
