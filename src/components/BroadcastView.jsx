import { useMemo } from 'react';
import { fmtNum, normCode } from '../lib/format';

export default function BroadcastView({ alliances, parties, constituencies, majorityLine, totalSeats }) {
  const partyByCode = useMemo(() => Object.fromEntries(parties.map(p => [p.code, p])), [parties]);

  const totals = useMemo(() => {
    const map = {};
    alliances.forEach(a => { map[a.code] = 0; });
    constituencies.forEach(c => {
      if (!c.manual_leader_party) return;
      const p = partyByCode[normCode(c.manual_leader_party)];
      if (!p || map[p.alliance_code] === undefined) return;
      map[p.alliance_code] += 1;
    });
    return map;
  }, [alliances, constituencies, partyByCode]);

  const ticker = useMemo(() => {
    return constituencies
      .filter(c => c.status !== 'waitlist')
      .map(c => `${c.name_en}: ${partyByCode[normCode(c.manual_leader_party)]?.name || 'Counting'}${c.status === 'declared' ? ' (WON)' : ''}`)
      .join('     •     ');
  }, [constituencies, partyByCode]);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-0)', color: 'var(--text-hi)', padding: '48px 64px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center'
    }}>
      <style>{`
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 22, letterSpacing: '.15em', color: 'var(--accent)', fontWeight: 700 }}>● TJ MEDIA — LIVE COUNTING</div>
        <div style={{ fontSize: 15, color: 'var(--text-mid)', marginTop: 6 }}>Majority: {majorityLine} / {totalSeats}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 50, flexWrap: 'wrap' }}>
        {alliances.map(a => (
          <div key={a.code} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: a.color }}>{a.name}</div>
            <div className="display tabular" style={{ fontSize: 96, fontWeight: 700, lineHeight: 1 }}>{fmtNum(totals[a.code] || 0)}</div>
          </div>
        ))}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.55)',
        borderTop: '1px solid var(--glass-border)', padding: '14px 0', overflow: 'hidden', whiteSpace: 'nowrap'
      }}>
        <div style={{ display: 'inline-block', animation: 'ticker 60s linear infinite', fontSize: 18 }}>
          {ticker}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{ticker}
        </div>
      </div>
    </div>
  );
}
