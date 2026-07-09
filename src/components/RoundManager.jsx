import { useMemo, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { fmtNum } from '../lib/format';
import PartySymbol from './PartySymbol';

// Running-total rule: walk rounds ascending — a 'total' entry REPLACES the
// running total, a 'round_only' entry ADDS to it. Handles mixed-mode entry
// safely (same convention as DataEntry's two submit modes).
export function computePartyTotals(votesForConst, parties) {
  const totals = {};
  parties.forEach(p => {
    const byRound = votesForConst?.[p.code];
    if (!byRound) return;
    const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
    if (!rounds.length) return;
    let running = 0;
    rounds.forEach(r => {
      const cell = byRound[r];
      if (cell.entryMode === 'round_only') running += cell.votes;
      else running = cell.votes; // 'total' (or legacy null) replaces
    });
    totals[p.code] = running;
  });
  return totals;
}

// Cumulative totals per round (same running rule) — used by the
// Round-wise Leader panel in DataEntry.
export function computeRoundCumulative(votesForConst, parties) {
  const roundSet = new Set();
  Object.values(votesForConst || {}).forEach(byRound => Object.keys(byRound).forEach(r => roundSet.add(Number(r))));
  const rounds = [...roundSet].sort((a, b) => a - b);
  const running = {};
  const byRound = {};
  rounds.forEach(r => {
    parties.forEach(p => {
      const cell = votesForConst?.[p.code]?.[r];
      if (!cell) return;
      if (cell.entryMode === 'round_only') running[p.code] = (running[p.code] || 0) + cell.votes;
      else running[p.code] = cell.votes;
    });
    byRound[r] = { ...running };
  });
  return { rounds, byRound };
}

export function PartyTotalsBarChart({ parties, totals, candidatesForConst = {} }) {
  const { t } = useLang();
  const entries = parties
    .filter(p => totals[p.code] > 0)
    .sort((a, b) => totals[b.code] - totals[a.code]);
  if (!entries.length) return null;

  const grand = entries.reduce((s, p) => s + totals[p.code], 0);
  const max = Math.max(...entries.map(p => totals[p.code]));
  const H = 90; // px chart height

  return (
    <div style={{
      marginTop: 12, padding: '16px 18px', borderRadius: 10,
      background: 'var(--glass-hi)', border: '1px solid var(--line)', width: '100%'
    }}>
      <div style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.08em',
        fontWeight: 700, color: 'var(--text-mid)', marginBottom: 14
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
          <span>📊</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('total')} — {t('partyTotalsAllRounds')}
          </span>
        </span>
      </div>

      {/* names */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 10 }}>
        {entries.map(p => (
          <div key={p.code} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: p.color || 'var(--text-hi)' }}>
            <PartySymbol party={p} size={32} style={{ marginBottom: 4 }} />
            <div>{p.name}</div>
            {candidatesForConst[p.code]?.name && (
              <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-mid)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {candidatesForConst[p.code].name}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* bars */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${entries.length}, 1fr)`, gap: 6, alignItems: 'end', height: H }}>
        {entries.map(p => {
          const v = totals[p.code];
          const h = Math.max((v / max) * (H - 18), 4);
          return (
            <div key={p.code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: H, gap: 3 }}>
              <div style={{ fontSize: 10, color: 'var(--text-lo)' }}>{((v / grand) * 100).toFixed(1)}%</div>
              <div style={{
                width: '100%', height: h, background: p.color || 'var(--accent)',
                borderRadius: '4px 4px 0 0', transition: 'height .6s ease'
              }} />
            </div>
          );
        })}
      </div>

      {/* counts */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${entries.length}, 1fr)`, gap: 6,
        marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6
      }}>
        {entries.map(p => (
          <div key={p.code} className="tabular" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: p.color || 'var(--text-hi)' }}>
            {fmtNum(totals[p.code])}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--line)',
        display: 'flex', justifyContent: 'space-between', fontSize: 11.5
      }}>
        <span style={{ color: 'var(--text-lo)' }}>{t('grandTotal')}</span>
        <span className="tabular" style={{ fontWeight: 700 }}>{fmtNum(grand)}</span>
      </div>
    </div>
  );
}

// Full round-wise manager for ONE constituency:
// table of rounds × parties, inline Edit/Save per round, Delete round,
// plus the party-totals vertical bar chart.
export default function RoundManager({ constituency, parties, votesForConst, candidatesForConst = {}, refresh, showChart = true, readOnly = false }) {
  const { user, isFieldEntry, fullName } = useAuth();
  const { t } = useLang();
  const { push } = useToast();
  const [editingRound, setEditingRound] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const canEdit = isFieldEntry && !readOnly;
  const rounds = useMemo(() => {
    const set = new Set();
    Object.values(votesForConst || {}).forEach(byRound => Object.keys(byRound).forEach(r => set.add(Number(r))));
    return [...set].sort((a, b) => a - b);
  }, [votesForConst]);

  const relevantParties = useMemo(
    () => parties.filter(p => votesForConst?.[p.code]),
    [parties, votesForConst]
  );

  const totals = useMemo(
    () => computePartyTotals(votesForConst, parties),
    [votesForConst, parties]
  );

  if (!constituency) return null;

  if (rounds.length === 0) {
    return <div style={{ padding: '10px 4px', fontSize: 12.5, color: 'var(--text-lo)' }}>{t('noRoundDataYet')}</div>;
  }

  const startEdit = (r) => {
    const d = {};
    relevantParties.forEach(p => {
      const cell = votesForConst[p.code]?.[r];
      d[p.code] = cell ? String(cell.votes) : '';
    });
    setDraft(d);
    setEditingRound(r);
  };

  const cancelEdit = () => { setEditingRound(null); setDraft({}); };

  const saveEdit = async (r) => {
    setBusy(true);
    try {
      const ops = [];
      const changes = [];
      const diff = []; // structured old->new, stored as JSON in update_logs.reason
      for (const p of relevantParties) {
        const before = votesForConst[p.code]?.[r];
        const raw = (draft[p.code] ?? '').trim();
        if (raw === '' && before) {
          ops.push(sb.from('party_votes').delete()
            .match({ constituency_id: constituency.id, party_code: p.code, round: r }));
          changes.push(`${p.code.toUpperCase()} ${fmtNum(before.votes)} → removed`);
          diff.push({ party: p.code, old: before.votes, new: null });
        } else if (raw !== '' && Number(raw) !== before?.votes) {
          ops.push(sb.from('party_votes').upsert({
            constituency_id: constituency.id, party_code: p.code, round: r,
            votes: Number(raw), created_by: user.id
          }, { onConflict: 'constituency_id,party_code,round' }));
          changes.push(`${p.code.toUpperCase()} ${before ? fmtNum(before.votes) : '—'} → ${fmtNum(raw)}`);
          diff.push({ party: p.code, old: before?.votes ?? null, new: Number(raw) });
        }
      }
      if (!ops.length) { cancelEdit(); return; }
      for (const op of ops) {
        const { error } = await op;
        if (error) throw error;
      }
      await sb.from('update_logs').insert([{
        constituency_id: constituency.id, round: r, action: 'correction',
        message: `Round ${r} corrected: ${changes.join(', ')}`,
        reason: diff.length ? JSON.stringify(diff) : null,
        actor: user.id, actor_name: fullName || user.email
      }]);
      push(`Round ${r} updated`, 'success');
      cancelEdit();
      refresh();
    } catch (e) {
      push(e.message || 'Failed to save round edit', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteRound = async (r) => {
    if (!window.confirm(`Delete ALL party entries for Round ${r} of ${constituency.name_en}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { error } = await sb.from('party_votes').delete()
        .match({ constituency_id: constituency.id, round: r });
      if (error) throw error;

      // trg_touch_status only ever RAISES current_round — recompute it after delete
      const remaining = rounds.filter(x => x !== r);
      const newMax = remaining.length ? Math.max(...remaining) : 0;
      await sb.from('constituency_status')
        .update({ current_round: newMax, updated_at: new Date().toISOString() })
        .eq('constituency_id', constituency.id);

      await sb.from('update_logs').insert([{
        constituency_id: constituency.id, round: r, action: 'delete',
        message: `Round ${r} deleted (all parties)`,
        actor: user.id, actor_name: fullName || user.email
      }]);
      push(`Round ${r} deleted`, 'success');
      refresh();
    } catch (e) {
      push(e.message || 'Failed to delete round', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scroll-thin" style={{ overflowX: 'auto', padding: '10px 4px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-mid)' }}>{t('round')}</th>
            {relevantParties.map(p => (
              <th key={p.code} style={{ textAlign: 'right', padding: '4px 8px', color: p.color || 'var(--text-mid)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <PartySymbol party={p} size={35} />
                  {p.name}
                </span>
                {candidatesForConst[p.code]?.name && (
                  <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-mid)' }}>{candidatesForConst[p.code].name}</div>
                )}
              </th>
            ))}
            {canEdit && <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-mid)' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rounds.map(r => {
            const isEditing = editingRound === r;
            return (
              <tr key={r} style={isEditing ? { background: 'var(--glass-hi)' } : undefined}>
                <td style={{ padding: '4px 8px', color: 'var(--text-mid)' }}>{r}</td>
                {relevantParties.map(p => {
                  const cell = votesForConst[p.code]?.[r];
                  return (
                    <td key={p.code} className="tabular" style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {isEditing ? (
                        <input
                          type="number" inputMode="numeric"
                          value={draft[p.code] ?? ''}
                          onChange={e => setDraft(d => ({ ...d, [p.code]: e.target.value }))}
                          style={{ width: 90, textAlign: 'right', padding: '3px 6px', fontSize: 12.5 }}
                        />
                      ) : (
                        <>{cell ? fmtNum(cell.votes) : '—'}{cell?.estimated ? ' *' : ''}</>
                      )}
                    </td>
                  );
                })}
                {canEdit && (
                  <td style={{ textAlign: 'right', padding: '4px 8px', whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <>
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={(e) => { e.stopPropagation(); saveEdit(r); }}>Save</button>{' '}
                        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={(e) => { e.stopPropagation(); cancelEdit(); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={(e) => { e.stopPropagation(); startEdit(r); }}>✏️ Edit</button>{' '}
                        <button className="btn btn-sm btn-danger" disabled={busy} onClick={(e) => { e.stopPropagation(); deleteRound(r); }}>🗑</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: 'var(--text-lo)', marginTop: 4 }}>{t('estimatedNote')}</div>

      {showChart && <PartyTotalsBarChart parties={parties} totals={totals} candidatesForConst={candidatesForConst} />}
    </div>
  );
}
