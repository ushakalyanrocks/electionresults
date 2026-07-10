import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { fmtNum, normCode } from '../lib/format';
import RoundManager, { computePartyTotals } from './RoundManager';
import PartySymbol from './PartySymbol';

// ============================================================
// Multi-Constituency Data Entry — up to MAX_SELECT seats in one
// grid, each card is a compact version of the single Data Entry
// form (no charts). Writes are IDENTICAL to DataEntry.submitAll:
// same party_votes upsert conflict key, same constituency_status
// upsert, same update_logs line with correction diff in `reason`.
// ============================================================

const MAX_SELECT = 25;

// Legible input/select box shared by every card in the grid.
// Rendered once (see <style> tag below) instead of inline per-field,
// so we get real :focus/:hover states without duplicating <style> tags per card.
const FIELD_CSS = `
  .me-field {
    padding: 7px 9px !important;
    border: 1.5px solid #94a3b8 !important;
    border-radius: 6px !important;
    background: #ffffff !important;
    color: #0f172a !important;
    outline: none !important;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.06) !important;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }
  .me-field::placeholder { color: #94a3b8 !important; opacity: 1; }
  .me-field:hover { border-color: var(--accent, #2563eb) !important; }
  .me-field:focus {
    border-color: var(--accent, #2563eb) !important;
    box-shadow: 0 0 0 3px var(--accent-soft, rgba(37,99,235,0.18)) !important;
  }
  .me-field.me-round-missing { border-color: var(--bad, #dc2626) !important; }
  .me-vote-field { font-variant-numeric: tabular-nums; }
`;

// ---- Persistence: survive tab-switch / navigate-away / reload / MACHINE SWITCH. ----
// Source of truth is Supabase (`multi_entry_drafts`, one row per user), so the
// same login continues from any machine / any browser. localStorage is kept
// only as a fast local cache for instant first paint; the DB copy wins if newer.
// Only an explicit Reset clears this — everything else (opening another
// tab, "Change seats", closing the browser) must leave it intact.
const STORAGE_PREFIX = 'multiEntryDraft_';
const DB_SAVE_DEBOUNCE_MS = 800; // don't hit Supabase on every keystroke

function storageKeyFor(userId) {
  return userId ? `${STORAGE_PREFIX}${userId}` : null;
}

function loadLocal(userId) {
  const key = storageKeyFor(userId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocal(userId, state) {
  const key = storageKeyFor(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage full / unavailable — fail silently, DB copy still works
  }
}

function clearLocal(userId) {
  const key = storageKeyFor(userId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch { /* noop */ }
}

// ---- DB copy (works across machines) ----
async function loadDraftFromDB(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await sb
      .from('multi_entry_drafts')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[MultiEntry] draft load failed:', error.message);
      return null;
    }
    return data?.state || null;
  } catch (e) {
    console.warn('[MultiEntry] draft load failed:', e);
    return null;
  }
}

async function saveDraftToDB(userId, state) {
  if (!userId) return;
  try {
    const { error } = await sb.from('multi_entry_drafts').upsert(
      { user_id: userId, state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) console.warn('[MultiEntry] draft save failed:', error.message);
  } catch (e) {
    console.warn('[MultiEntry] draft save failed:', e);
  }
}

async function deleteDraftFromDB(userId) {
  if (!userId) return;
  try {
    const { error } = await sb.from('multi_entry_drafts').delete().eq('user_id', userId);
    if (error) console.warn('[MultiEntry] draft delete failed:', error.message);
  } catch { /* noop */ }
}

function draftFor(c) {
  return {
    round: '', mode: 'total',
    // waitlist → counting (entry is starting); declared STAYS declared so a
    // vote correction on a declared seat doesn't silently un-declare it on
    // the live board. The operator can still change the dropdown manually.
    status: c.status === 'waitlist' ? 'counting' : (c.status || 'counting'),
    inputs: {}, busy: false, done: false
  };
}

// Drafts can arrive from the DB / old localStorage sessions with fields
// missing (older shape, partial writes). Every draft entering state goes
// through this so `inputs` etc. are ALWAYS present — no crash on
// Object.values(d.inputs).
const DRAFT_DEFAULTS = { round: '', mode: 'total', status: 'counting', inputs: {}, busy: false, done: false };

function normalizeDraft(d) {
  return { ...DRAFT_DEFAULTS, ...(d || {}), inputs: (d && d.inputs) || {} };
}

// Restore path (cache / DB): also clear transient flags — a draft must never
// wake up stuck in "busy" from a session that closed mid-save.
function normalizeDrafts(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => { out[k] = { ...normalizeDraft(v), busy: false }; });
  return out;
}

function Card({ c, draft, setDraft, parties, votesForConst, candsForConst, onSubmit, onReset, onRemove, onViewResults, lang, t }) {
  // Same contestant rule as DataEntry: only candidate-mapped parties,
  // fallback to all parties so entry is never blocked.
  const entryParties = useMemo(() => {
    const withCand = parties.filter(p => candsForConst[p.code]);
    return withCand.length > 0 ? withCand : parties;
  }, [parties, candsForConst]);

  const existingRounds = useMemo(() => {
    const set = new Set();
    Object.values(votesForConst).forEach(byRound => Object.keys(byRound).forEach(r => set.add(Number(r))));
    return [...set].sort((a, b) => a - b);
  }, [votesForConst]);
  const lastRound = existingRounds.length ? existingRounds[existingRounds.length - 1] : 0;
  const suggested = lastRound + 1;

  const roundNum = Number(draft.round);
  const roundBad = draft.round !== '' && (!Number.isInteger(roundNum) || roundNum < 1 || roundNum > 100);
  const correcting = draft.round !== '' && existingRounds.includes(roundNum);

  // Live leader/margin preview including what's being typed (same as DataEntry).
  const preview = useMemo(() => {
    const merged = JSON.parse(JSON.stringify(votesForConst));
    if (roundNum >= 1) {
      entryParties.forEach(p => {
        const raw = ((draft.inputs || {})[p.code] ?? '').trim();
        if (raw === '') return;
        merged[p.code] ??= {};
        merged[p.code][roundNum] = { votes: Number(raw), entryMode: draft.mode };
      });
    }
    const totals = computePartyTotals(merged, parties);
    const ranked = Object.entries(totals).sort(([, a], [, b]) => b - a);
    return {
      leader: ranked[0] || null,
      margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : (ranked[0]?.[1] || 0)
    };
  }, [votesForConst, draft.inputs, draft.mode, roundNum, entryParties, parties]);

  const anyTyped = entryParties.some(p => ((draft.inputs || {})[p.code] ?? '').trim() !== '');
  const canSubmit = !draft.busy && !roundBad && draft.round !== '' && anyTyped;
  const roundMissing = anyTyped && draft.round === '';
  const leaderParty = preview.leader ? parties.find(p => p.code === preview.leader[0]) : null;

  const set = (patch) => setDraft(d => ({ ...d, ...patch, done: false }));

  // Pre-fill round with the suggested value once, on mount, so Submit
  // isn't blocked just because the person forgot to type a round number.
  // Only runs once per card (Card remounts per constituency via `key={c.id}`),
  // so it never overwrites a value the user has since cleared on purpose.
  useEffect(() => {
    if (draft.round === '' && suggested >= 1) {
      set({ round: String(suggested) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="glass" style={{
      padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
      borderRadius: 10,
      border: `1.5px solid ${leaderParty?.color ? leaderParty.color + '55' : 'var(--glass-border)'}`,
      borderTop: `3px solid ${leaderParty?.color || 'var(--glass-border)'}`,
      background: 'var(--glass)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lang === 'ta' && c.name_ta ? c.name_ta : c.name_en}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
          <span className="tabular" style={{ fontSize: 10.5, color: 'var(--text-lo)', whiteSpace: 'nowrap' }}>
            {c.district} · R{lastRound}
          </span>
          <button
            type="button" title={t('multiRemoveCard') || 'Remove from grid'}
            onClick={() => onRemove(c)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-lo)', fontSize: 13, lineHeight: 1, padding: '2px 4px', borderRadius: 4
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--bad, #dc2626)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-lo)'; }}
          >✕</button>
        </div>
      </div>

      {existingRounds.length > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 10.5, padding: '3px 8px', alignSelf: 'flex-start' }}
          onClick={() => onViewResults(c)}
        >
          📊 {t('viewResults') || 'View Results'}
        </button>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1 }}>
          <input
            type="number" min="1" placeholder={`${t('round')} (${t('suggested')} ${suggested})`}
            value={draft.round} onChange={e => set({ round: e.target.value })}
            className={`me-field${roundMissing ? ' me-round-missing' : ''}`}
            title={roundMissing ? t('roundRequiredForSubmit') || 'Enter a round number to enable Submit' : undefined}
            style={{ width: '100%', fontSize: 12.5 }}
          />
        </div>
        <select value={draft.status} onChange={e => set({ status: e.target.value })}
          className="me-field"
          style={{ fontSize: 12, cursor: 'pointer' }}>
          <option value="counting">{t('counting')}</option>
          <option value="declared">{t('declared')}</option>
        </select>
      </div>

      <div style={{ display: 'flex', border: '1px solid var(--glass-border)', borderRadius: 6, overflow: 'hidden' }}>
        {['total', 'round_only'].map(m => (
          <button key={m} type="button" onClick={() => set({ mode: m })} style={{
            flex: 1, padding: '5px 4px', fontSize: 10.5, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: draft.mode === m ? 'var(--accent)' : 'transparent',
            color: draft.mode === m ? '#fff' : 'var(--text-mid)'
          }}>
            {m === 'total' ? t('totalSoFar') : t('thisRoundOnly')}
          </button>
        ))}
      </div>

      {correcting && (
        <div style={{ fontSize: 10.5, color: 'var(--warn)', background: 'var(--warn-soft)', borderRadius: 5, padding: '4px 8px' }}>
          ⚠ R{roundNum} {t('roundCorrectionWarning')}
        </div>
      )}
      {roundBad && (
        <div style={{ fontSize: 10.5, color: 'var(--bad)', background: 'var(--bad-soft)', borderRadius: 5, padding: '4px 8px' }}>
          ⚠ {t('roundWarning')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entryParties.map(p => (
          <div key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PartySymbol party={p} size={32} />
            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: p.color || 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflowEllipsis: 'ellipsis', textOverflow: 'ellipsis', minWidth: 0 }}>
              {p.name}
              {candsForConst[p.code]?.name && (
                <span style={{ fontWeight: 400, color: 'var(--text-lo)', fontSize: 10 }}> · {candsForConst[p.code].name}</span>
              )}
            </span>
            <input
              type="number" min="0" inputMode="numeric" placeholder="—"
              value={(draft.inputs || {})[p.code] ?? ''}
              onChange={e => set({ inputs: { ...(draft.inputs || {}), [p.code]: e.target.value } })}
              className="tabular me-field me-vote-field"
              style={{ width: 88, textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 10.5, color: 'var(--text-mid)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {leaderParty && anyTyped ? (
            <>
              <b style={{ color: leaderParty.color }}>{leaderParty.name}</b>
              <span className="tabular"> +{fmtNum(preview.margin)}</span>
            </>
          ) : ' '}
        </span>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {anyTyped && !draft.busy && (
            <button type="button" className="btn btn-ghost btn-sm" title={t('undo')} onClick={() => onReset(c)}>
              ↺
            </button>
          )}
          <button className="btn btn-primary btn-sm" disabled={!canSubmit} onClick={() => onSubmit(c, draft, entryParties, roundNum, correcting)}>
            {draft.busy ? t('savingLabel') : draft.done ? '✓' : `${t('submit')}${correcting ? ` ${t('correctionLabel')}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MultiDataEntry({ constituencies, parties, votes, candidates = {}, refresh, onBack }) {
  const { t, lang } = useLang();
  const { user, isFieldEntry, fullName } = useAuth();
  const { push } = useToast();

  // Local cache gives an instant first paint on the same machine; the DB
  // copy (fetched below) replaces it if the DB version is newer.
  const cached = useMemo(() => loadLocal(user?.id), [user?.id]);

  const [selected, setSelected] = useState(() => new Set(cached?.selected || []));
  const [gridOpen, setGridOpen] = useState(() => cached?.gridOpen || false);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState(() => normalizeDrafts(cached?.drafts)); // { [cid]: draft }
  const [bulkBusy, setBulkBusy] = useState(false);
  const [resultsModal, setResultsModal] = useState(null); // constituency object, or null when closed

  // hydratedRef gates saving: until the DB copy has been fetched and applied,
  // we must NOT write, or an empty first render would overwrite the real
  // draft saved from another machine.
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const latestStateRef = useRef(null);

  // ---- Hydrate from DB once per user ----
  useEffect(() => {
    hydratedRef.current = false;
    let cancelled = false;
    (async () => {
      const dbState = await loadDraftFromDB(user?.id);
      if (cancelled) return;
      const dbAt = dbState?.savedAt || 0;
      const localAt = cached?.savedAt || 0;
      // DB wins unless this machine's cache is strictly newer (e.g. offline typing).
      if (dbState && dbAt >= localAt) {
        setSelected(new Set(dbState.selected || []));
        setGridOpen(!!dbState.gridOpen);
        setDrafts(normalizeDrafts(dbState.drafts));
      }
      hydratedRef.current = true;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persist after every change — this is what makes tab-out/tab-back, a full
  // reload, AND switching to another machine/browser keep whatever was typed.
  // localStorage is written immediately (cheap); the DB write is debounced so
  // we don't upsert on every keystroke. Nothing here clears it; clearing only
  // happens from the explicit Reset actions below.
  useEffect(() => {
    if (!user?.id || !hydratedRef.current) return;
    const state = { selected: [...selected], gridOpen, drafts, savedAt: Date.now() };
    latestStateRef.current = state;
    saveLocal(user.id, state);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveDraftToDB(user.id, latestStateRef.current);
    }, DB_SAVE_DEBOUNCE_MS);
  }, [user?.id, selected, gridOpen, drafts]);

  // Flush any pending debounced DB write when leaving the screen, so the last
  // few keystrokes before navigating away still reach the DB.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        if (user?.id && latestStateRef.current) saveDraftToDB(user.id, latestStateRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // NOTE (v2.4.1): there used to be an effect here that pruned `selected`
  // whenever the constituency list changed (dropping declared seats). That
  // was destructive — when seats got declared or the list briefly refreshed,
  // it silently shrank the user's saved selection and then PERSISTED the
  // shrunk set to the DB, ending in the "0 constituencies" dead grid.
  // Selection is now never auto-modified: stale ids are simply ignored at
  // render time, and only the user adds/removes seats.

  const partyByCode = useMemo(() => Object.fromEntries(parties.map(p => [p.code, p])), [parties]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const pool = constituencies;
    if (!s) return pool;
    return pool.filter(c =>
      c.name_en.toLowerCase().includes(s) || (c.name_ta || '').includes(s) || c.district.toLowerCase().includes(s));
  }, [constituencies, search]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
      else push(`${t('multiMaxMsg')} ${MAX_SELECT}`, 'error');
      return next;
    });
  };

  const openGrid = () => {
    setDrafts(prev => {
      const d = { ...prev };
      constituencies.filter(c => selected.has(c.id)).forEach(c => {
        if (!d[c.id]) d[c.id] = draftFor(c); // only seed newly-added seats, keep existing typed drafts
      });
      return d;
    });
    setGridOpen(true);
  };

  // Updater always receives a COMPLETE draft (normalized), even if this card
  // was never seeded — Card's round pre-fill effect can fire before openGrid
  // seeds a draft, which previously created a partial object and crashed
  // Object.values(d.inputs) later.
  const setDraft = (cid) => (updater) =>
    setDrafts(prev => {
      const cur = normalizeDraft(prev[cid]);
      const next = typeof updater === 'function' ? updater(cur) : updater;
      return { ...prev, [cid]: normalizeDraft(next) };
    });

  // ---- Removing cards from the grid ----
  const hasUnsavedInput = (cid) => {
    const d = drafts[cid];
    return !!d && Object.values(d.inputs || {}).some(v => (v ?? '').trim() !== '');
  };

  // Silent removal (no confirm) — used after a Declared submit and by the
  // auto-declare effect. Drops the seat from selection AND deletes its draft.
  const removeCardSilent = (cid) => {
    setSelected(prev => { const s = new Set(prev); s.delete(cid); return s; });
    setDrafts(prev => { const d = { ...prev }; delete d[cid]; return d; });
  };

  // ✕ button — confirm only if the card still holds unsaved typed votes.
  const removeCard = (c) => {
    if (hasUnsavedInput(c.id) &&
      !window.confirm(t('multiRemoveConfirm') || `${c.name_en}: remove from grid? Typed votes not yet submitted will be discarded.`)) return;
    removeCardSilent(c.id);
  };

  // Auto-remove seats that BECOME declared while sitting in the grid — e.g.
  // declared from Single Entry or by another operator (arrives via refresh /
  // realtime). Two guards so this can never eat data like the old prune did:
  //   1. Transition-only: a seat that was ALREADY declared when the user
  //      selected it (correction workflow) is left alone.
  //   2. A card with unsaved typed votes is never auto-removed — the operator
  //      keeps it until they submit or ✕ it themselves.
  const prevStatusRef = useRef(null);
  useEffect(() => {
    if (constituencies.length === 0) return;
    const prev = prevStatusRef.current;
    const next = {};
    constituencies.forEach(c => { next[c.id] = c.status; });
    prevStatusRef.current = next;
    if (!prev) return; // first pass — just record statuses, remove nothing
    const toRemove = constituencies.filter(c =>
      selected.has(c.id) &&
      c.status === 'declared' &&
      prev[c.id] && prev[c.id] !== 'declared' &&
      !hasUnsavedInput(c.id)
    );
    if (toRemove.length === 0) return;
    setSelected(prevSel => { const s = new Set(prevSel); toRemove.forEach(c => s.delete(c.id)); return s; });
    setDrafts(prevD => { const d = { ...prevD }; toRemove.forEach(c => delete d[c.id]); return d; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constituencies]);

  // Explicit per-card reset (the ↺ button) — clears one card's typed round/votes.
  const resetCard = (c) => setDraft(c.id)(() => draftFor(c));

  // Explicit "Reset all" — clears the whole saved session (selection, grid,
  // every card's draft) and wipes BOTH the local cache and the DB row, so the
  // reset takes effect on every machine. This is the ONLY thing that should
  // discard everything; tab-switching or navigating away must not.
  const resetAll = () => {
    if (!window.confirm(t('resetAllConfirm') || 'Clear all unsaved entries in this multi-entry session?')) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSelected(new Set());
    setDrafts({});
    setGridOpen(false);
    clearLocal(user?.id);
    latestStateRef.current = { selected: [], gridOpen: false, drafts: {}, savedAt: Date.now() };
    deleteDraftFromDB(user?.id);
  };

  // ---- Submit one card: mirrors DataEntry.submitAll exactly ----
  const submitCard = async (c, draft, entryParties, roundNum, correcting) => {
    if (!isFieldEntry) return push(t('noAccess'), 'error');
    setDraft(c.id)(d => ({ ...d, busy: true }));
    try {
      const rows = entryParties
        .map(p => ({ code: p.code, raw: ((draft.inputs || {})[p.code] ?? '').trim() }))
        .filter(x => x.raw !== '')
        .map(x => ({
          constituency_id: c.id, party_code: x.code, round: roundNum,
          votes: Number(x.raw), entry_mode: draft.mode, created_by: user.id
        }));
      if (!rows.length) throw new Error(t('enterVotesErr'));

      const { error: e1 } = await sb.from('party_votes')
        .upsert(rows, { onConflict: 'constituency_id,party_code,round' });
      if (e1) throw e1;

      // Leader/margin from existing votes (pre-refresh) merged with typed rows.
      const merged = JSON.parse(JSON.stringify(votes[c.id] || {}));
      rows.forEach(r => {
        merged[r.party_code] ??= {};
        merged[r.party_code][roundNum] = { votes: r.votes, entryMode: r.entry_mode };
      });
      const totals = computePartyTotals(merged, parties);
      const ranked = Object.entries(totals).sort(([, a], [, b]) => b - a);
      const leaderCode = ranked[0]?.[0] || null;
      const margin = ranked.length > 1 ? ranked[0][1] - ranked[1][1] : (ranked[0]?.[1] ?? null);

      const { error: e2 } = await sb.from('constituency_status').upsert({
        constituency_id: c.id,
        status: draft.status,
        manual_leader_party: leaderCode,
        manual_leader_round: roundNum,
        winning_margin: margin,
        updated_at: new Date().toISOString()
      }, { onConflict: 'constituency_id' });
      if (e2) throw e2;

      // Correction diff (old -> new) exactly like DataEntry.
      let diff = null;
      if (correcting) {
        const prevForConst = votes[c.id] || {};
        const d = rows
          .map(rw => ({ party: rw.party_code, old: prevForConst[rw.party_code]?.[roundNum]?.votes ?? null, new: rw.votes }))
          .filter(x => x.old !== x.new);
        if (d.length) diff = JSON.stringify(d);
      }
      const detail = rows.map(r => `${(partyByCode[r.party_code]?.name || r.party_code).toUpperCase()} ${fmtNum(r.votes)}`).join(' · ');
      await sb.from('update_logs').insert([{
        constituency_id: c.id, party_code: leaderCode, round: roundNum,
        action: correcting ? 'correction' : 'vote_update',
        message: `Round ${roundNum}: ${detail} — ${(partyByCode[leaderCode]?.name || '').toUpperCase()} leading (+${fmtNum(margin)})${correcting ? ' [corrected]' : ''}`,
        reason: diff,
        actor: user.id, actor_name: fullName || user.email
      }]);

      if (draft.status === 'declared') {
        // Seat is done — take its card out of the grid right away instead of
        // waiting for the refresh round-trip.
        removeCardSilent(c.id);
        push(`${c.name_en} · R${roundNum} ✓ ${t('declared')}`, 'success');
      } else {
        setDraft(c.id)(d => ({ ...d, busy: false, done: true, round: '', inputs: {} }));
        push(`${c.name_en} · R${roundNum} ${correcting ? t('correctionLabel') : '✓'}`, 'success');
      }
      refresh();
      return true;
    } catch (e) {
      setDraft(c.id)(d => ({ ...d, busy: false }));
      push(`${c.name_en}: ${e.message || t('saveFailed')}`, 'error');
      return false;
    }
  };

  // Submit every card that has a round + at least one vote typed, one by one.
  const submitAllFilled = async () => {
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const c of constituencies.filter(x => selected.has(x.id))) {
      const draft = drafts[c.id];
      if (!draft || draft.busy) continue;
      const roundNum = Number(draft.round);
      const candsForConst = candidates[c.id] || {};
      const withCand = parties.filter(p => candsForConst[p.code]);
      const entryParties = withCand.length > 0 ? withCand : parties;
      const anyTyped = entryParties.some(p => ((draft.inputs || {})[p.code] ?? '').trim() !== '');
      if (draft.round === '' || !Number.isInteger(roundNum) || roundNum < 1 || !anyTyped) continue;
      const existing = new Set();
      Object.values(votes[c.id] || {}).forEach(byRound => Object.keys(byRound).forEach(r => existing.add(Number(r))));
      const done = await submitCard(c, draft, entryParties, roundNum, existing.has(roundNum));
      done ? ok++ : fail++;
    }
    setBulkBusy(false);
    if (ok || fail) push(`${t('multiBulkDone')}: ${ok} ✓${fail ? ` · ${fail} ✕` : ''}`, fail ? 'error' : 'success');
  };

  if (!isFieldEntry) {
    return (
      <div className="container" style={{ marginTop: 20 }}>
        <div className="glass" style={{ padding: 24, textAlign: 'center', color: 'var(--text-mid)' }}>{t('viewerOnlyMsg')}</div>
      </div>
    );
  }

  const selectedList = constituencies.filter(c => selected.has(c.id));
  const filledCount = selectedList.filter(c => {
    const d = drafts[c.id];
    return d && d.round !== '' && Object.values(d.inputs || {}).some(v => (v ?? '').trim() !== '');
  }).length;

  // Constituency master list not loaded yet — don't render an empty grid or
  // an empty picker (both would look like lost data). Just wait.
  if (constituencies.length === 0) {
    return (
      <div className="container" style={{ marginTop: 20 }}>
        <div className="glass" style={{ padding: 24, textAlign: 'center', color: 'var(--text-mid)' }}>…</div>
      </div>
    );
  }

  // Recovery: if a saved session says "grid open" but resolves to zero seats
  // (e.g. state saved by the old buggy prune, or scope changed in Election
  // Setup), fall back to the picker instead of a dead "0 constituencies" grid.
  const showPicker = !gridOpen || selectedList.length === 0;

  // ---------- Phase 1: pick constituencies ----------
  if (showPicker) {
    return (
      <div className="container" style={{ marginTop: 20, maxWidth: 720, marginBottom: 40 }}>
        <div className="glass" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>⊞ {t('multiEntry')}</div>
            <button className="btn btn-ghost btn-sm" onClick={onBack}>← {t('singleEntry')}</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>
            {t('multiPickHint')} {MAX_SELECT}.
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')}
            style={{ width: '100%', marginTop: 12 }} />

          {selectedList.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {selectedList.map(c => (
                <span key={c.id} onClick={() => toggle(c.id)} style={{
                  fontSize: 11.5, fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)',
                  padding: '3px 9px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap'
                }}>
                  {lang === 'ta' && c.name_ta ? c.name_ta : c.name_en} ✕
                </span>
              ))}
            </div>
          )}

          <div className="scroll-thin" style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, marginTop: 12 }}>
            {filtered.map(c => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderBottom: '1px solid var(--line)', cursor: 'pointer', fontSize: 13
              }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <span style={{ flex: 1 }}>
                  {lang === 'ta' && c.name_ta ? c.name_ta : c.name_en}
                  <span style={{ color: 'var(--text-lo)', fontSize: 11.5 }}> · {c.district}</span>
                  {c.status === 'declared' && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--good, #16a34a)',
                      background: 'var(--good-soft, rgba(22,163,74,0.12))', padding: '1px 6px', borderRadius: 10
                    }}>
                      ✓ {t('declared')}
                    </span>
                  )}
                </span>
                <span className="tabular" style={{ fontSize: 11, color: 'var(--text-lo)' }}>R{c.current_round || 0}</span>
              </label>
            ))}
            {filtered.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-lo)' }}>—</div>}
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }}
            disabled={selected.size === 0} onClick={openGrid}>
            {t('multiOpenGrid')} ({selected.size}/{MAX_SELECT})
          </button>
        </div>
      </div>
    );
  }

  // ---------- Phase 2: entry grid ----------
  return (
    <div className="container" style={{ marginTop: 20, marginBottom: 40 }}>
      <style>{FIELD_CSS}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setGridOpen(false)}>← {t('multiChangeSeats')}</button>
          <span style={{ fontSize: 12.5, color: 'var(--text-mid)' }} className="tabular">
            {selectedList.length} {t('constituencies')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetAll}>↺ {t('undo')}</button>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>{t('singleEntry')}</button>
          <button className="btn btn-primary btn-sm" disabled={bulkBusy || filledCount === 0} onClick={submitAllFilled}>
            {bulkBusy ? t('savingLabel') : `${t('multiSubmitAll')} (${filledCount})`}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {selectedList.map(c => (
          <Card
            key={c.id} c={c}
            draft={drafts[c.id] || draftFor(c)}
            setDraft={setDraft(c.id)}
            parties={parties}
            votesForConst={votes[c.id] || {}}
            candsForConst={candidates[c.id] || {}}
            onSubmit={submitCard}
            onReset={resetCard}
            onRemove={removeCard}
            onViewResults={setResultsModal}
            lang={lang} t={t}
          />
        ))}
      </div>

      {resultsModal && (
        <div
          role="dialog" aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
          onClick={() => setResultsModal(null)}
        >
          <div
            className="glass"
            style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 16, borderRadius: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {lang === 'ta' && resultsModal.name_ta ? resultsModal.name_ta : resultsModal.name_en}
                <span style={{ fontSize: 11.5, color: 'var(--text-lo)', fontWeight: 400, marginLeft: 8 }}>
                  {resultsModal.district}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setResultsModal(null)}>
                ✕ {t('close') || 'Close'}
              </button>
            </div>
            <RoundManager
              constituency={resultsModal}
              parties={parties}
              votesForConst={votes[resultsModal.id] || {}}
              candidatesForConst={candidates[resultsModal.id] || {}}
              refresh={refresh}
              readOnly
              showChart
            />
          </div>
        </div>
      )}
    </div>
  );
}
