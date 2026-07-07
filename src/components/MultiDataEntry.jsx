import { useEffect, useMemo, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { fmtNum, normCode } from '../lib/format';
import { computePartyTotals } from './RoundManager';

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

// ---- Persistence: survive tab-switch / navigate-away / reload. ----
// Only an explicit Reset clears this — everything else (opening another
// tab, "Change seats", closing the browser) must leave it intact.
const STORAGE_PREFIX = 'multiEntryDraft_';

function storageKeyFor(userId) {
  return userId ? `${STORAGE_PREFIX}${userId}` : null;
}

function loadPersisted(userId) {
  const key = storageKeyFor(userId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersisted(userId, state) {
  const key = storageKeyFor(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage full / unavailable — fail silently, in-memory state still works
  }
}

function clearPersisted(userId) {
  const key = storageKeyFor(userId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch { /* noop */ }
}

function draftFor(c) {
  return {
    round: '', mode: 'total',
    status: c.status === 'waitlist' ? 'counting' : (c.status || 'counting'),
    inputs: {}, busy: false, done: false
  };
}

function Card({ c, draft, setDraft, parties, votesForConst, candsForConst, onSubmit, onReset, lang, t }) {
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
        const raw = (draft.inputs[p.code] ?? '').trim();
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

  const anyTyped = entryParties.some(p => (draft.inputs[p.code] ?? '').trim() !== '');
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
        <span className="tabular" style={{ fontSize: 10.5, color: 'var(--text-lo)', whiteSpace: 'nowrap' }}>
          {c.district} · R{lastRound}
        </span>
      </div>

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
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color || 'var(--text-lo)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: p.color || 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflowEllipsis: 'ellipsis', textOverflow: 'ellipsis', minWidth: 0 }}>
              {p.name}
              {candsForConst[p.code]?.name && (
                <span style={{ fontWeight: 400, color: 'var(--text-lo)', fontSize: 10 }}> · {candsForConst[p.code].name}</span>
              )}
            </span>
            <input
              type="number" min="0" inputMode="numeric" placeholder="—"
              value={draft.inputs[p.code] ?? ''}
              onChange={e => set({ inputs: { ...draft.inputs, [p.code]: e.target.value } })}
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

  const persisted = useMemo(() => loadPersisted(user?.id), [user?.id]);

  const [selected, setSelected] = useState(() => new Set(persisted?.selected || []));
  const [gridOpen, setGridOpen] = useState(() => persisted?.gridOpen || false);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState(() => persisted?.drafts || {}); // { [cid]: draft }
  const [bulkBusy, setBulkBusy] = useState(false);

  // Persist after every change — this is what makes tab-out/tab-back (and
  // even a full reload) keep whatever was typed. Nothing here clears it;
  // clearing only happens from the explicit Reset actions below.
  useEffect(() => {
    if (!user?.id) return;
    savePersisted(user.id, { selected: [...selected], gridOpen, drafts });
  }, [user?.id, selected, gridOpen, drafts]);

  const partyByCode = useMemo(() => Object.fromEntries(parties.map(p => [p.code, p])), [parties]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return constituencies;
    return constituencies.filter(c =>
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

  const setDraft = (cid) => (updater) =>
    setDrafts(prev => ({ ...prev, [cid]: typeof updater === 'function' ? updater(prev[cid]) : updater }));

  // Explicit per-card reset (the ↺ button) — clears one card's typed round/votes.
  const resetCard = (c) => setDraft(c.id)(() => draftFor(c));

  // Explicit "Reset all" — clears the whole saved session (selection, grid,
  // every card's draft) and wipes localStorage. This is the ONLY thing that
  // should discard everything; tab-switching or navigating away must not.
  const resetAll = () => {
    if (!window.confirm(t('resetAllConfirm') || 'Clear all unsaved entries in this multi-entry session?')) return;
    setSelected(new Set());
    setDrafts({});
    setGridOpen(false);
    clearPersisted(user?.id);
  };

  // ---- Submit one card: mirrors DataEntry.submitAll exactly ----
  const submitCard = async (c, draft, entryParties, roundNum, correcting) => {
    if (!isFieldEntry) return push(t('noAccess'), 'error');
    setDraft(c.id)(d => ({ ...d, busy: true }));
    try {
      const rows = entryParties
        .map(p => ({ code: p.code, raw: (draft.inputs[p.code] ?? '').trim() }))
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

      setDraft(c.id)(d => ({ ...d, busy: false, done: true, round: '', inputs: {} }));
      push(`${c.name_en} · R${roundNum} ${correcting ? t('correctionLabel') : '✓'}`, 'success');
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
      const anyTyped = entryParties.some(p => (draft.inputs[p.code] ?? '').trim() !== '');
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
    return d && d.round !== '' && Object.values(d.inputs).some(v => (v ?? '').trim() !== '');
  }).length;

  // ---------- Phase 1: pick constituencies ----------
  if (!gridOpen) {
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
            lang={lang} t={t}
          />
        ))}
      </div>
    </div>
  );
}
