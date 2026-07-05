import { useMemo, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { fmtNum } from '../lib/format';
import { PartyTotalsBarChart, computePartyTotals, computeRoundCumulative } from './RoundManager';

// Right-side live panel (v1 style): round-wise cumulative totals per party,
// leader + margin per round, and the ALL ROUNDS TOTAL bar chart.
function RoundwiseLeaderPanel({ constituency, parties, votesForConst, candidatesForConst = {} }) {
  const { lang, t } = useLang();
  const { rounds, byRound } = useMemo(
    () => computeRoundCumulative(votesForConst, parties),
    [votesForConst, parties]
  );
  const totals = useMemo(() => computePartyTotals(votesForConst, parties), [votesForConst, parties]);
  const relevantParties = useMemo(
    () => parties.filter(p => votesForConst?.[p.code] || candidatesForConst[p.code]),
    [parties, votesForConst, candidatesForConst]
  );

  if (!constituency) {
    return (
      <div className="glass" style={{ padding: 20, color: 'var(--text-lo)', fontSize: 13 }}>
        {t('selectConstituencyPrompt')}
      </div>
    );
  }
  if (rounds.length === 0) {
    return (
      <div className="glass" style={{ padding: 20, color: 'var(--text-lo)', fontSize: 13 }}>
        <b style={{ color: 'var(--text-hi)' }}>{lang === 'ta' && constituency.name_ta ? constituency.name_ta : constituency.name_en}</b> — {t('noRoundDataYet')}
      </div>
    );
  }

  const lastRound = rounds[rounds.length - 1];

  return (
    <div className="glass" style={{ padding: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        📊 {t('roundWiseLeaderTitle')} — {lang === 'ta' && constituency.name_ta ? constituency.name_ta : constituency.name_en}
      </div>
      <div className="scroll-thin" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-mid)' }}>{t('round')}</th>
              {relevantParties.map(p => (
                <th key={p.code} style={{ textAlign: 'right', padding: '4px 8px', color: p.color || 'var(--text-mid)' }}>
                  {p.name}
                  {candidatesForConst[p.code]?.name && (
                    <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-mid)' }}>{candidatesForConst[p.code].name}</div>
                  )}
                </th>
              ))}
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-mid)' }}>{t('leader')}</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-mid)' }}>{t('margin')}</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map(r => {
              const cum = byRound[r];
              const ranked = relevantParties
                .map(p => ({ p, v: cum[p.code] || 0 }))
                .sort((a, b) => b.v - a.v);
              const leader = ranked[0];
              const margin = ranked.length > 1 ? leader.v - ranked[1].v : leader?.v || 0;
              const isLast = r === lastRound;
              return (
                <tr key={r} style={isLast ? { background: 'var(--glass-hi)' } : undefined}>
                  <td style={{ padding: '4px 8px', fontWeight: 700 }}>R{r}{isLast ? ' ★' : ''}</td>
                  {relevantParties.map(p => (
                    <td key={p.code} className="tabular" style={{
                      textAlign: 'right', padding: '4px 8px',
                      color: leader?.p.code === p.code ? (p.color || 'var(--text-hi)') : 'var(--text-mid)',
                      fontWeight: leader?.p.code === p.code ? 700 : 400
                    }}>
                      {cum[p.code] != null ? fmtNum(cum[p.code]) : '—'}
                    </td>
                  ))}
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                    {leader ? (
                      <span style={{ color: leader.p.color, fontWeight: 700 }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: leader.p.color, marginRight: 4, verticalAlign: 'middle' }} />
                        {leader.p.name}
                      </span>
                    ) : '—'}
                    {leader && candidatesForConst[leader.p.code]?.name && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-mid)' }}>{candidatesForConst[leader.p.code].name}</div>
                    )}
                  </td>
                  <td className="tabular" style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 700, color: 'var(--good, #22c55e)' }}>
                    +{fmtNum(margin)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PartyTotalsBarChart parties={parties} totals={totals} candidatesForConst={candidatesForConst} />
    </div>
  );
}

export default function DataEntry({ constituencies, parties, alliances = [], votes, candidates = {}, refresh }) {
  const { t, lang } = useLang();
  const { user, isFieldEntry, fullName } = useAuth();
  const { push } = useToast();

  const [constId, setConstId] = useState('');
  const [search, setSearch] = useState('');
  const [round, setRound] = useState('');
  const [status, setStatus] = useState('counting');
  const [voteSubMode, setVoteSubMode] = useState('total'); // 'total' | 'round_only'
  const [voteInputs, setVoteInputs] = useState({}); // { partyCode: string }
  const [manualLeader, setManualLeader] = useState(''); // only used when no votes entered
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return constituencies.filter(c => c.name_en.toLowerCase().includes(s) || (c.name_ta || '').includes(s) || c.district.toLowerCase().includes(s)).slice(0, 8);
  }, [search, constituencies]);

  const selectedConst = constituencies.find(c => c.id === Number(constId));
  const votesForConst = constId ? (votes[constId] || {}) : {};
  const candsForConst = constId ? (candidates[constId] || {}) : {};

  const allianceByCode = useMemo(() => Object.fromEntries(alliances.map(a => [a.code, a])), [alliances]);

  // "Party (Alliance)" — e.g. VCK (TVK+). If party name already equals the
  // alliance name (lead party), skip the redundant bracket.
  const partyLabel = (p) => {
    const a = allianceByCode[p.alliance_code];
    if (!a || a.name === p.name) return p.name;
    return `${p.name} (${a.name})`;
  };

  // ONLY the actual contestants: parties with a candidate mapped for this
  // constituency. Each alliance fields one party per seat, so unmapped
  // parties are noise. Fallback: if no candidates are mapped yet for this
  // seat, show all parties so entry is never blocked.
  const entryParties = useMemo(() => {
    const withCand = parties.filter(p => candsForConst[p.code]);
    return withCand.length > 0 ? withCand : parties;
  }, [parties, candsForConst]);
  const candidatesMissing = constId && entryParties === parties && Object.keys(candsForConst).length === 0;

  // Existing rounds across ALL parties for this constituency.
  const existingRounds = useMemo(() => {
    const set = new Set();
    Object.values(votesForConst).forEach(byRound => Object.keys(byRound).forEach(r => set.add(Number(r))));
    return [...set].sort((a, b) => a - b);
  }, [votesForConst]);

  const lastRound = existingRounds.length ? existingRounds[existingRounds.length - 1] : 0;
  const suggestedRound = lastRound + 1;
  const roundNum = Number(round);
  const roundLooksWrong = round !== '' && (roundNum < 1 || roundNum > 100 || !Number.isInteger(roundNum));
  const editingExistingRound = round !== '' && existingRounds.includes(roundNum);

  // Live totals INCLUDING what's being typed, so leader/margin preview is honest.
  const previewTotals = useMemo(() => {
    if (!constId) return {};
    const merged = JSON.parse(JSON.stringify(votesForConst));
    if (roundNum >= 1) {
      entryParties.forEach(p => {
        const raw = (voteInputs[p.code] ?? '').trim();
        if (raw === '') return;
        merged[p.code] ??= {};
        merged[p.code][roundNum] = { votes: Number(raw), entryMode: voteSubMode };
      });
    }
    return computePartyTotals(merged, parties);
  }, [constId, votesForConst, voteInputs, roundNum, voteSubMode, entryParties, parties]);

  const ranked = useMemo(() =>
    Object.entries(previewTotals)
      .map(([code, total]) => ({ code, total }))
      .sort((a, b) => b.total - a.total),
    [previewTotals]
  );
  const anyVotesTyped = entryParties.some(p => (voteInputs[p.code] ?? '').trim() !== '');
  const autoLeader = ranked[0]?.code || '';
  const autoMargin = ranked.length > 1 ? ranked[0].total - ranked[1].total : (ranked[0]?.total || 0);
  const effectiveLeader = anyVotesTyped || ranked.length ? autoLeader : manualLeader;

  const selectConstituency = (c) => {
    setConstId(String(c.id));
    setSearch('');
    setVoteInputs({});
    setManualLeader(c.manual_leader_party || '');
    setStatus(c.status === 'waitlist' ? 'counting' : (c.status || 'counting'));
    setRound('');
  };

  // Picking an existing round prefills all party boxes for correction.
  const pickRound = (r) => {
    setRound(String(r));
    const filled = {};
    entryParties.forEach(p => {
      const cell = votesForConst[p.code]?.[r];
      if (cell) filled[p.code] = String(cell.votes);
    });
    setVoteInputs(filled);
  };

  const resetForm = () => {
    setConstId(''); setSearch(''); setRound(''); setVoteInputs({}); setManualLeader(''); setConfirming(false); setStatus('counting');
  };

  const openConfirm = (e) => {
    e.preventDefault();
    if (!isFieldEntry) { push(t('noAccess'), 'error'); return; }
    if (!constId) { push(t('selectConstituencyErr'), 'error'); return; }
    if (!round) { push(t('enterRoundErr'), 'error'); return; }
    if (roundLooksWrong) { push(t('roundWarning'), 'error'); return; }
    if (!anyVotesTyped && !effectiveLeader && status !== 'waitlist') { push(t('enterVotesErr'), 'error'); return; }
    setConfirming(true);
  };

  const submitAll = async () => {
    setBusy(true);
    try {
      // 1. ALL party rows for this round in ONE upsert call — this is the fix
      //    for "one party blocks the others": nothing is entered party-by-party
      //    any more, the whole round goes together.
      const rows = entryParties
        .map(p => ({ code: p.code, raw: (voteInputs[p.code] ?? '').trim() }))
        .filter(x => x.raw !== '')
        .map(x => ({
          constituency_id: Number(constId),
          party_code: x.code,
          round: roundNum,
          votes: Number(x.raw),
          entry_mode: voteSubMode,
          created_by: user.id
        }));

      if (rows.length) {
        const { error: e1 } = await sb.from('party_votes')
          .upsert(rows, { onConflict: 'constituency_id,party_code,round' });
        if (e1) throw e1;
      }

      // 2. Status + leader + margin on constituency_status.
      const leaderCode = effectiveLeader || null;
      const { error: e2 } = await sb.from('constituency_status').upsert({
        constituency_id: Number(constId),
        status,
        manual_leader_party: leaderCode,
        manual_leader_round: roundNum,
        winning_margin: rows.length || ranked.length ? autoMargin : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'constituency_id' });
      if (e2) throw e2;

      // 3. One log line for the whole round.
      const partyByCode = Object.fromEntries(parties.map(p => [p.code, p]));
      const detail = rows.map(r => `${(partyByCode[r.party_code]?.name || r.party_code).toUpperCase()} ${fmtNum(r.votes)}`).join(' · ');
      await sb.from('update_logs').insert([{
        constituency_id: Number(constId), party_code: leaderCode, round: roundNum,
        action: editingExistingRound ? 'correction' : 'vote_update',
        message: rows.length
          ? `Round ${roundNum}: ${detail} — ${(partyByCode[leaderCode]?.name || '').toUpperCase()} leading (+${fmtNum(autoMargin)})${editingExistingRound ? ' [corrected]' : ''}`
          : `Round ${roundNum}: marked ${(partyByCode[leaderCode]?.name || leaderCode || '').toUpperCase()} leading (status: ${status})`,
        actor: user.id, actor_name: fullName || user.email
      }]);

      push(editingExistingRound ? `${t('round')} ${roundNum} · ${t('correctionLabel')} (${rows.length})` : `${t('round')} ${roundNum} · ${t('submit')} (${rows.length})`, 'success');
      // Keep constituency selected so the operator continues to the next round
      setRound(''); setVoteInputs({}); setConfirming(false);
      refresh();
    } catch (e) {
      push(e.message || t('saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isFieldEntry) {
    return (
      <div className="container" style={{ marginTop: 20 }}>
        <div className="glass" style={{ padding: 24, textAlign: 'center', color: 'var(--text-mid)' }}>
          {t('viewerOnlyMsg')}
        </div>
      </div>
    );
  }

  const partyByCode = Object.fromEntries(parties.map(p => [p.code, p]));

  return (
    <div className="container data-entry-grid" style={{ marginTop: 20, maxWidth: 1160, display: 'grid', gap: 16, gridTemplateColumns: 'minmax(320px, 480px) minmax(320px, 1fr)', alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        <div className="glass" style={{ padding: 20 }}>
          {!confirming ? (
            <form onSubmit={openConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 700 }}>🗳 {t('voteUpdateTitle')}</div>

              {/* Constituency */}
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{t('constituencyLabel')}</label>
                <input
                  value={selectedConst ? `${lang === 'ta' && selectedConst.name_ta ? selectedConst.name_ta : selectedConst.name_en} — ${selectedConst.district}` : search}
                  onChange={e => { setSearch(e.target.value); setConstId(''); }}
                  placeholder={t('search')} style={{ width: '100%', marginTop: 6 }}
                />
                {matches.length > 0 && !constId && (
                  <div className="dropdown scroll-thin" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                    {matches.map(c => (
                      <div key={c.id} onClick={() => selectConstituency(c)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                        {lang === 'ta' && c.name_ta ? c.name_ta : c.name_en} <span style={{ color: 'var(--text-lo)', fontSize: 12 }}>{c.district}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {constId && (
                <>
                  {/* Round + Status side by side (wraps on very narrow phones) */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 130px' }}>
                      <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>
                        {t('roundNumberLabel')} <span style={{ color: 'var(--text-lo)' }}>({t('suggested')}: {suggestedRound})</span>
                      </label>
                      <input type="number" inputMode="numeric" min="1" max="100" value={round}
                        onChange={e => setRound(e.target.value)} placeholder={String(suggestedRound)}
                        style={{ width: '100%', marginTop: 6 }} />
                      {roundLooksWrong && (
                        <div style={{ fontSize: 12, color: 'var(--bad)', marginTop: 4 }}>
                          ⚠ {t('roundWarning')}
                        </div>
                      )}
                      {editingExistingRound && !roundLooksWrong && (
                        <div style={{ fontSize: 12, color: 'var(--warn, #b45309)', marginTop: 4 }}>
                          ✏ {t('round')} {roundNum} {t('roundCorrectionWarning')}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: '1 1 130px' }}>
                      <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{t('statusLabel')}</label>
                      <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', marginTop: 6 }}>
                        <option value="counting">{t('counting')}</option>
                        <option value="declared">{t('declared')}</option>
                        <option value="waitlist">{t('waitlist')}</option>
                      </select>
                    </div>
                  </div>

                  {/* Entered rounds — tap to load for correction */}
                  {existingRounds.length > 0 && (
                    <div>
                      <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{t('enteredRoundsLabel')}</label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {existingRounds.map(r => (
                          <button type="button" key={r} className="btn btn-sm btn-ghost"
                            style={roundNum === r ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                            onClick={() => pickRound(r)}>
                            R{r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Entry mode */}
                  <div>
                    <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{t('entryTypeLabel')}</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {['total', 'round_only'].map(sm => (
                        <button type="button" key={sm} onClick={() => setVoteSubMode(sm)} className="btn btn-sm"
                          style={{ flex: 1, background: voteSubMode === sm ? 'var(--accent)' : 'var(--glass-hi)', color: voteSubMode === sm ? '#fff' : 'var(--text-hi)' }}>
                          {sm === 'total' ? t('totalSoFar') : t('thisRoundOnly')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ALL candidates/parties — one box each */}
                  <div>
                    <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>
                      {t('voteCountLabel')} <span style={{ color: 'var(--text-lo)' }}>{t('optionalIfExists')}</span>
                    </label>
                    {candidatesMissing && (
                      <div style={{ fontSize: 11.5, color: 'var(--warn, #b45309)', marginTop: 4 }}>
                        ⚠ {t('candidatesMissingWarning')}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                      {entryParties.map(p => {
                        const cand = candsForConst[p.code];
                        const isLeaderNow = anyVotesTyped && autoLeader === p.code;
                        return (
                          <div key={p.code} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 10,
                            border: `1px solid ${isLeaderNow ? (p.color || 'var(--accent)') : 'var(--line)'}`,
                            background: 'var(--glass)'
                          }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color || 'var(--text-lo)', flexShrink: 0 }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: p.color || 'var(--text-hi)' }}>
                                {partyLabel(p)} {isLeaderNow ? '👑' : ''}
                              </div>
                              {cand?.name && (
                                <div style={{ fontSize: 11.5, color: 'var(--text-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cand.name}</div>
                              )}
                            </div>
                            <input
                              type="number" inputMode="numeric" min="0"
                              value={voteInputs[p.code] ?? ''}
                              onChange={e => setVoteInputs(v => ({ ...v, [p.code]: e.target.value }))}
                              placeholder={t('voteCountLabel')}
                              style={{ width: 110, textAlign: 'right' }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Leader: auto when votes typed; manual radios only when status-only */}
                  <div>
                    <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>
                      🏆 {t('leaderPartyLabel')} {anyVotesTyped
                        ? <span style={{ color: 'var(--text-lo)' }}>— {t('autoFromVotes')}</span>
                        : <span style={{ color: 'var(--bad)' }}>* — {t('mandatorySelect')}</span>}
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      {entryParties.map(p => {
                        const active = effectiveLeader === p.code;
                        return (
                          <button type="button" key={p.code}
                            disabled={anyVotesTyped}
                            onClick={() => setManualLeader(p.code)}
                            className="btn btn-sm"
                            style={{
                              background: active ? p.color : 'var(--glass-hi)',
                              color: active ? '#fff' : 'var(--text-hi)',
                              borderColor: p.color, opacity: anyVotesTyped && !active ? 0.45 : 1
                            }}>
                            {partyLabel(p)}
                          </button>
                        );
                      })}
                    </div>
                    {anyVotesTyped && ranked.length > 1 && (
                      <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 6 }}>
                        {t('marginPreview')} <b className="tabular" style={{ color: 'var(--good, #16a34a)' }}>+{fmtNum(autoMargin)}</b>
                      </div>
                    )}
                  </div>

                  <button className="btn btn-primary" type="submit" style={{ marginTop: 4 }}>{t('reviewSubmit')}</button>
                </>
              )}
            </form>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 6 }}>{t('confirmRound')} {roundNum}{editingExistingRound ? ` ${t('correctionLabel')}` : ''}</div>
              <div className="glass" style={{ padding: 16, fontSize: 14, lineHeight: 1.8 }}>
                <div><b>{lang === 'ta' && selectedConst?.name_ta ? selectedConst.name_ta : selectedConst?.name_en}</b> ({selectedConst?.district}) · {t(status)}</div>
                {entryParties.filter(p => (voteInputs[p.code] ?? '').trim() !== '').map(p => (
                  <div key={p.code} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: p.color }}>{partyLabel(p)}{candsForConst[p.code]?.name ? ` — ${candsForConst[p.code].name}` : ''}</span>
                    <span className="tabular"><b>{fmtNum(voteInputs[p.code])}</b></span>
                  </div>
                ))}
                {!anyVotesTyped && effectiveLeader && (
                  <div>{t('leader')}: <b style={{ color: partyByCode[effectiveLeader]?.color }}>{partyByCode[effectiveLeader]?.name}</b> {t('statusOnly')}</div>
                )}
                {anyVotesTyped && (
                  <div style={{ marginTop: 4, borderTop: '1px solid var(--line)', paddingTop: 4 }}>
                    {t('leader')}: <b style={{ color: partyByCode[autoLeader]?.color }}>{partyByCode[autoLeader]?.name}</b>
                    {' '}· {t('margin')} <b className="tabular">+{fmtNum(autoMargin)}</b>
                    {' '}· {voteSubMode === 'total' ? t('totalSoFar') : t('thisRoundOnly')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirming(false)}>{t('backLabel')}</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={submitAll}>
                  {busy ? t('savingLabel') : t('submit')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <RoundwiseLeaderPanel
        constituency={selectedConst}
        parties={parties}
        votesForConst={votesForConst}
        candidatesForConst={candsForConst}
      />

      <style>{`
        @media (max-width: 900px) {
          .data-entry-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
