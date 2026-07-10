import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { fmtNum } from '../lib/format';
import ReorderPanel from './ReorderPanel';
import MajorityTrack from './MajorityTrack';
import PartySymbol from './PartySymbol';

function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function computeTally(constituencies, parties) {
  const byParty = {}; // code -> { won, leading }
  parties.forEach(p => { byParty[p.code] = { won: 0, leading: 0 }; });
  constituencies.forEach(c => {
    if (!c.manual_leader_party) return;
    const bucket = byParty[c.manual_leader_party];
    if (!bucket) return;
    if (c.status === 'declared') bucket.won += 1;
    else if (c.status === 'counting') bucket.leading += 1;
  });
  return byParty;
}

function AllianceCard({ a, totals, pct, memberParties, partyTally, trend, view }) {
  const total = totals.won + totals.leading;
  const animated = useCountUp(total);
  return (
    <div className="glass" style={{ padding: 16, borderTop: `3px solid ${a.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: a.color }}>{a.name}</div>
        {trend !== 0 && (
          <span style={{ fontSize: 12, color: trend > 0 ? 'var(--good)' : 'var(--bad)' }}>
            {trend > 0 ? '▲' : '▼'}{Math.abs(trend)}
          </span>
        )}
      </div>
      <div className="display tabular" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
        {fmtNum(animated)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)' }} className="tabular">
        {totals.won} won · {totals.leading} leading
      </div>
      <div style={{ height: 6, background: 'var(--glass-hi)', borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: a.color, transition: 'width .5s var(--ease)' }} />
      </div>

      {view === 'party' && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {memberParties.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-lo)', fontStyle: 'italic' }}>No parties assigned to this alliance yet.</div>
          )}
          {memberParties.map(p => {
            const t2 = partyTally[p.code] || { won: 0, leading: 0 };
            const sum = t2.won + t2.leading;
            // Always render — even at 0 — so an alliance_code change (e.g. moving
            // a party into a new alliance) is visible immediately, before any
            // leads/wins have been recorded for it. Zero rows are just muted.
            return (
              <div
                key={p.code}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 8px', fontSize: 12.5,
                  opacity: sum === 0 ? 0.5 : 1
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <PartySymbol party={p} size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </span>
                <span className="tabular">{sum}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HeroScoreboard({ alliances, parties, constituencies, majorityLine, totalSeats, refresh }) {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const [view, setView] = useState('alliance'); // 'alliance' | 'party'
  const [reordering, setReordering] = useState(false);
  const prevTotalsRef = useRef({});

  const partyTally = useMemo(() => computeTally(constituencies, parties), [constituencies, parties]);

  const allianceTotals = useMemo(() => {
    const map = {};
    alliances.forEach(a => { map[a.code] = { won: 0, leading: 0 }; });
    parties.forEach(p => {
      const t = partyTally[p.code] || { won: 0, leading: 0 };
      if (!map[p.alliance_code]) map[p.alliance_code] = { won: 0, leading: 0 };
      map[p.alliance_code].won += t.won;
      map[p.alliance_code].leading += t.leading;
    });
    return map;
  }, [alliances, parties, partyTally]);

  const trends = useMemo(() => {
    const out = {};
    alliances.forEach(a => {
      const cur = (allianceTotals[a.code]?.won || 0) + (allianceTotals[a.code]?.leading || 0);
      const prev = prevTotalsRef.current[a.code] ?? cur;
      out[a.code] = cur - prev;
    });
    return out;
  }, [alliances, allianceTotals]);

  useEffect(() => {
    const snap = {};
    alliances.forEach(a => {
      snap[a.code] = (allianceTotals[a.code]?.won || 0) + (allianceTotals[a.code]?.leading || 0);
    });
    prevTotalsRef.current = snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allianceTotals)]);

  // Order is now whatever admin saved via ReorderPanel (persisted server-side
  // as alliances.sort_order / parties.sort_order, fetched already-sorted by
  // useElectionData). No client-side reshuffling needed here anymore.
  const orderedAlliances = alliances;

  return (
    <div className="container" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-mid)' }} className="tabular">
          Majority: {majorityLine} &nbsp;·&nbsp; {totalSeats} {t('constituencies')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button className="btn btn-sm" onClick={() => setReordering(true)}>⠿ Reorder</button>
          )}
          <div className="glass" style={{ display: 'flex', padding: 4, borderRadius: 999 }}>
            {['alliance', 'party'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className="btn btn-sm"
                style={{
                  border: 'none', borderRadius: 999,
                  background: view === v ? 'var(--accent)' : 'transparent',
                  color: view === v ? '#fff' : 'var(--text-mid)'
                }}>
                {v === 'alliance' ? t('allianceView') : t('partyView')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-grid" style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: `repeat(${Math.min(orderedAlliances.length || 1, 5)}, minmax(150px, 1fr))`
      }}>
        {orderedAlliances.map(a => {
          const totals = allianceTotals[a.code] || { won: 0, leading: 0 };
          const total = totals.won + totals.leading;
          const pct = totalSeats ? Math.min(100, (total / totalSeats) * 100) : 0;
          const memberParties = parties.filter(p => p.alliance_code === a.code);
          const trend = trends[a.code] || 0;
          return (
            <AllianceCard
              key={a.code} a={a} totals={totals} pct={pct} memberParties={memberParties}
              partyTally={partyTally} trend={trend} view={view}
            />
          );
        })}
      </div>

      <MajorityTrack
        alliances={orderedAlliances}
        allianceTotals={allianceTotals}
        majorityLine={majorityLine}
        totalSeats={totalSeats}
      />

      <style>{`
        @media (max-width: 920px) {
          .hero-grid { grid-template-columns: repeat(3, minmax(130px, 1fr)) !important; }
        }
        @media (max-width: 620px) {
          .hero-grid { grid-template-columns: repeat(2, minmax(130px, 1fr)) !important; }
        }
        @media (max-width: 380px) {
          .hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {reordering && (
        <ReorderPanel
          alliances={alliances}
          parties={parties}
          onClose={() => setReordering(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
