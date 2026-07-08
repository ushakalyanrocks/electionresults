import { useMemo } from 'react';
import { fmtNum } from '../../lib/format';
import { allianceVoteTotals } from '../../lib/broadcastData';

// Compact corner overlay (560×180): alliance vote share % + raw totals.
// Optional ?alliances=dmk,admk restricts the comparison; default shows
// every alliance with votes, biggest first.
export default function VoteSharePanel({ alliances, parties, constituencies, votes, allianceFilter }) {
  const totals = useMemo(
    () => allianceVoteTotals(constituencies, votes, parties),
    [constituencies, votes, parties]
  );

  const rows = useMemo(() => {
    const wanted = (allianceFilter || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    let list = alliances
      .map(a => ({ alliance: a, votes: totals[a.code] || 0 }))
      .filter(r => (wanted.length ? wanted.includes(r.alliance.code) : r.votes > 0))
      .sort((a, b) => b.votes - a.votes);
    return list;
  }, [alliances, totals, allianceFilter]);

  const grand = rows.reduce((s, r) => s + r.votes, 0) || 1;

  return (
    <div className="bcast-stage bcast-voteshare bcast-card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="bcast-brand">VOTE SHARE</div>
        <div className="bcast-tabular" style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
          {fmtNum(grand)} votes counted
        </div>
      </div>

      {/* Single stacked bar */}
      <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,.08)' }}>
        {rows.map(r => (
          <div key={r.alliance.code} style={{
            width: `${(r.votes / grand) * 100}%`, background: r.alliance.color,
            transition: 'width .6s cubic-bezier(.2,.8,.2,1)'
          }} />
        ))}
      </div>

      {/* Legend with % + raw */}
      <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>No votes counted yet</div>}
        {rows.map(r => (
          <div key={r.alliance.code} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.alliance.color, alignSelf: 'center' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: r.alliance.color }}>{r.alliance.name}</span>
            <span className="bcast-tabular" style={{ fontSize: 17, fontWeight: 800 }}>
              {((r.votes / grand) * 100).toFixed(1)}%
            </span>
            <span className="bcast-tabular" style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)' }}>{fmtNum(r.votes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
