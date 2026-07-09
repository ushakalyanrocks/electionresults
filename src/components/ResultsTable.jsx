import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../context/LangContext';
import { fmtNum, normCode } from '../lib/format';
import RoundManager, { computePartyTotals } from './RoundManager';
import PartySymbol from './PartySymbol';

const PAGE_SIZE = 25;

function StatusPill({ status, t }) {
  const map = { counting: 'pill-counting', declared: 'pill-declared', waitlist: 'pill-waitlist' };
  return (
    <span className={`pill ${map[status] || 'pill-waitlist'}`}>
      {status === 'declared' ? <span className="check-badge">✓</span> : <span className="dot" />}
      {t(status || 'waitlist')}
    </span>
  );
}

// Small "party + votes" cell like the v1 UI: colored dot + party name,
// candidate name (if mapped), votes below.
function PartyCell({ entry, candidate }) {
  if (!entry) return <span style={{ color: 'var(--text-lo)' }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <PartySymbol party={entry.party} size={30} />
      <div style={{ lineHeight: 1.25, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: entry.party.color || 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.party.name}
        </div>
        {candidate?.name && (
          <div style={{ fontSize: 11, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
            {candidate.name}
          </div>
        )}
        <div className="tabular" style={{ fontSize: 12, color: 'var(--text-mid)' }}>{fmtNum(entry.total)}</div>
      </div>
    </div>
  );
}

export default function ResultsTable({ constituencies, parties, votes, candidates = {}, filters, refresh }) {
  const { t, lang } = useLang();
  const [sortKey, setSortKey] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);

  const partyByCode = useMemo(() => Object.fromEntries(parties.map(p => [p.code, p])), [parties]);

  // Flash rows whose leader total changed since the last data refresh
  // (visual only — mirrors the sample's live-update highlight).
  const prevTotalsRef = useRef({});
  const [flashIds, setFlashIds] = useState(() => new Set());

  // Enrich every constituency with ranked party totals: leader / 2nd / 3rd / 4th + margin.
  const enriched = useMemo(() => {
    return constituencies.map(c => {
      const totals = computePartyTotals(votes[c.id] || {}, parties);
      const ranked = Object.entries(totals)
        .sort(([, a], [, b]) => b - a)
        .map(([code, total]) => ({ party: partyByCode[code], total }))
        .filter(e => e.party);
      const leader = ranked[0] || null;
      const second = ranked[1] || null;
      // No votes yet? fall back to the manually-marked leader (status-only entries).
      const manualLeader = !leader && c.manual_leader_party && partyByCode[normCode(c.manual_leader_party)]
        ? { party: partyByCode[normCode(c.manual_leader_party)], total: 0, manual: true }
        : null;
      return {
        ...c,
        _leader: leader || manualLeader,
        _second: second,
        _third: ranked[2] || null,
        _fourth: ranked[3] || null,
        _leaderTotal: leader ? leader.total : 0,
        _margin: leader && second ? leader.total - second.total : (leader ? leader.total : 0)
      };
    });
  }, [constituencies, votes, parties, partyByCode]);

  useEffect(() => {
    const changed = [];
    enriched.forEach(c => {
      const prev = prevTotalsRef.current[c.id];
      if (prev !== undefined && prev !== c._leaderTotal) changed.push(c.id);
      prevTotalsRef.current[c.id] = c._leaderTotal;
    });
    if (changed.length) {
      setFlashIds(new Set(changed));
      const timer = setTimeout(() => setFlashIds(new Set()), 1500);
      return () => clearTimeout(timer);
    }
  }, [enriched]);

  const filtered = useMemo(() => {
    const s = filters.search.trim().toLowerCase();
    return enriched.filter(c => {
      if (s && !c.name_en.toLowerCase().includes(s) && !(c.name_ta || '').includes(s) && !c.district.toLowerCase().includes(s)) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.district && c.district !== filters.district) return false;
      if (filters.alliance) {
        if (!c._leader || c._leader.party.alliance_code !== filters.alliance) return false;
      }
      return true;
    });
  }, [enriched, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'name') { av = a.name_en; bv = b.name_en; }
      if (av === undefined || av === null) av = '';
      if (bv === undefined || bv === null) bv = '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const thStyle = {
    textAlign: 'left', padding: '10px 12px', fontSize: 11.5, color: 'var(--text-mid)',
    textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap'
  };
  const Th = ({ label, k }) => (
    <th onClick={() => toggleSort(k)} style={{ ...thStyle, cursor: 'pointer' }}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="container" style={{ marginTop: 16, marginBottom: 40 }}>
      <div className="glass" style={{ overflow: 'hidden' }}>
        {/* Desktop table */}
        <div className="scroll-thin" style={{ overflowX: 'auto' }}>
          <table className="results-desktop" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-1)', zIndex: 1 }}>
              <tr>
                <th style={thStyle}>#</th>
                <Th label={lang === 'ta' ? 'தொகுதி' : 'Constituency'} k="name" />
                <Th label={lang === 'ta' ? 'மாவட்டம்' : 'District'} k="district" />
                <th style={thStyle}>{lang === 'ta' ? 'முன்னிலை கட்சி' : 'Leader'}</th>
                <Th label={lang === 'ta' ? 'மொத்த வாக்கு' : 'Total Votes'} k="_leaderTotal" />
                <th style={thStyle}>{lang === 'ta' ? '2வது கட்சி' : '2nd Party'}</th>
                <Th label={lang === 'ta' ? 'வித்தியாசம்' : 'Margin'} k="_margin" />
                <th style={thStyle}>{lang === 'ta' ? '3வது கட்சி' : '3rd Party'}</th>
                <th style={thStyle}>{lang === 'ta' ? '4வது கட்சி' : '4th Party'}</th>
                <Th label={lang === 'ta' ? 'சுற்று' : 'Round'} k="current_round" />
                <Th label={lang === 'ta' ? 'நிலை' : 'Status'} k="status" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c, i) => {
                const isOpen = expanded === c.id;
                const leaderColor = c._leader?.party?.color;
                const rowNumber = pageSafe * PAGE_SIZE + i + 1;
                const isOddRow = rowNumber % 2 === 1;
                return (
                  <Fragment key={c.id}>
                    <tr
                      className={flashIds.has(c.id) ? 'flash-row' : ''}
                      style={{
                        background: isOddRow ? 'var(--accent-soft)' : 'var(--bg-1)',
                        borderLeft: `3px solid ${leaderColor || 'transparent'}`,
                        cursor: 'pointer'
                      }}
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--text-lo)', fontSize: 12 }}>{pageSafe * PAGE_SIZE + i + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {lang === 'ta' && c.name_ta ? c.name_ta : c.name_en}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-mid)' }}>{c.district}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13 }}>
                        {c._leader ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <PartySymbol party={c._leader.party} size={30} />
                            <div style={{ lineHeight: 1.25, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: leaderColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {c._leader.party.name}{c._leader.manual ? ' 📌' : ''}
                              </div>
                              {candidates[c.id]?.[c._leader.party.code]?.name && (
                                <div style={{ fontSize: 11, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
                                  {candidates[c.id][c._leader.party.code].name}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="tabular" style={{ padding: '10px 12px', fontWeight: 700, color: leaderColor }}>
                        {c._leaderTotal ? fmtNum(c._leaderTotal) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12.5 }}><PartyCell entry={c._second} candidate={c._second && candidates[c.id]?.[c._second.party.code]} /></td>
                      <td className="tabular" style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--good, #22c55e)' }}>
                        {c._second ? `+${fmtNum(c._margin)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12.5 }}><PartyCell entry={c._third} candidate={c._third && candidates[c.id]?.[c._third.party.code]} /></td>
                      <td style={{ padding: '10px 12px', fontSize: 12.5 }}><PartyCell entry={c._fourth} candidate={c._fourth && candidates[c.id]?.[c._fourth.party.code]} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="tabular" style={{
                          background: 'var(--warn, #f59e0b)', color: '#000', fontWeight: 800,
                          borderRadius: 6, padding: '2px 7px', fontSize: 12
                        }}>R{c.current_round || 0}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}><StatusPill status={c.status} t={t} /></td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-lo)' }}>{isOpen ? '▲' : '▼'}</td>
                    </tr>
                    {isOpen && (
                      <tr key={`${c.id}-detail`}>
                        <td colSpan={12} style={{ background: 'var(--bg-1)', padding: 0 }}>
                          {/* Read-only here — editing + chart live in the Summary tab */}
                          <RoundManager constituency={c} parties={parties} votesForConst={votes[c.id] || {}} refresh={refresh} readOnly showChart={false} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {pageRows.length === 0 && (
                <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center', color: 'var(--text-lo)' }}>No constituencies match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="results-mobile" style={{ display: 'none', flexDirection: 'column' }}>
          {pageRows.map((c, i) => {
            const isOpen = expanded === c.id;
            const leaderColor = c._leader?.party?.color;
            const rowNumber = pageSafe * PAGE_SIZE + i + 1;
            const isOddRow = rowNumber % 2 === 1;
            return (
              <div key={c.id} className={flashIds.has(c.id) ? 'flash-row' : ''} style={{ background: isOddRow ? 'var(--accent-soft)' : 'var(--bg-1)', borderLeft: `3px solid ${leaderColor || 'transparent'}`, borderBottom: '1px solid var(--line)', padding: 12 }}
                onClick={() => setExpanded(isOpen ? null : c.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 600 }}>{lang === 'ta' && c.name_ta ? c.name_ta : c.name_en}</div>
                  <StatusPill status={c.status} t={t} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>{c.district} · R{c.current_round || 0}</div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
                  <PartyCell entry={c._leader && !c._leader.manual ? c._leader : null} candidate={c._leader && candidates[c.id]?.[c._leader.party.code]} />
                  <PartyCell entry={c._second} candidate={c._second && candidates[c.id]?.[c._second.party.code]} />
                  <PartyCell entry={c._third} candidate={c._third && candidates[c.id]?.[c._third.party.code]} />
                  {c._second && <span className="tabular" style={{ fontWeight: 700, alignSelf: 'center', color: 'var(--good, #22c55e)' }}>+{fmtNum(c._margin)}</span>}
                </div>
                {isOpen && (
                  <div onClick={e => e.stopPropagation()}>
                    <RoundManager constituency={c} parties={parties} votesForConst={votes[c.id] || {}} refresh={refresh} readOnly showChart={false} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <style>{`
          @media (max-width: 780px) {
            .results-desktop { display: none; }
            .results-mobile { display: flex !important; }
          }
        `}</style>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{sorted.length} results</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" disabled={pageSafe === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span className="tabular" style={{ fontSize: 12.5 }}>{pageSafe + 1} / {pageCount}</span>
            <button className="btn btn-ghost btn-sm" disabled={pageSafe >= pageCount - 1} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
