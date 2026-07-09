// "Seats toward majority" track — from election-results-full-sample.
// Pure display: reads allianceTotals already computed in HeroScoreboard,
// no data logic of its own.
export default function MajorityTrack({ alliances, allianceTotals, majorityLine, totalSeats }) {
  const total = totalSeats || 1;
  const tickPct = Math.min(100, (majorityLine / total) * 100);

  const declaredTotal = alliances.reduce(
    (sum, a) => sum + (allianceTotals[a.code]?.won || 0), 0
  );
  const countingTotal = alliances.reduce(
    (sum, a) => sum + (allianceTotals[a.code]?.leading || 0), 0
  );

  return (
    <div className="glass" style={{
      padding: '14px 16px 12px', marginTop: 14,
      width: 'calc(100% + 24px)', marginLeft: -12, marginRight: -12,
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
          Seats toward majority
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-lo)' }}>
          <b className="tabular" style={{ color: 'var(--text-hi)' }}>{declaredTotal}</b> of {total} declared
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 26 }}>
        <div className="majority-track">
          {alliances.map(a => {
            const won = allianceTotals[a.code]?.won || 0;
            if (!won) return null;
            return (
              <div key={a.code} className="seg"
                style={{ width: `${(won / total) * 100}%`, background: a.color }} />
            );
          })}
        </div>
        <div className="majority-tick" style={{ left: `${tickPct}%` }} />
        <div className="majority-tick-label" style={{ left: `${tickPct}%` }}>{majorityLine}</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10.5, color: 'var(--text-mid)' }}>
        {alliances.map(a => {
          const won = allianceTotals[a.code]?.won || 0;
          if (!won) return null;
          return (
            <div key={a.code} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, display: 'inline-block' }} />
              {a.name} {won} won
            </div>
          );
        })}
        <div style={{ color: 'var(--text-lo)' }}>
          {Math.max(0, total - declaredTotal - countingTotal)} waitlisted · {countingTotal} counting
        </div>
      </div>
    </div>
  );
}
