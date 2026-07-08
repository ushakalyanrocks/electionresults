import { useEffect, useMemo, useRef, useState } from 'react';
import { allianceSeatTally } from '../../lib/broadcastData';

// Count-up on change, same easing as HeroScoreboard's useCountUp.
function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else prevRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function Face({ url, label, color, size }) {
  return (
    <div className="bcast-chip" style={{
      width: size, height: size, background: color || '#3a4152', fontSize: size * 0.36,
      border: '3px solid rgba(255,255,255,.25)'
    }}>
      {url ? <img src={url} alt={label} /> : (label || '?').slice(0, 2)}
    </div>
  );
}

function AllianceBlock({ alliance, seats, won }) {
  const animated = useCountUp(seats);
  // Swing vs last election — the one new data field (alliances.last_election_seats).
  const swing = seats - (alliance.last_election_seats || 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 34px' }}>
      <Face url={alliance.leader_photo_url} label={alliance.leader_name || alliance.name} color={alliance.color} size={120} />
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: alliance.color, lineHeight: 1 }}>{alliance.name}</div>
        {alliance.leader_name && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>{alliance.leader_name}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div className="bcast-tabular" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>{animated}</div>
          <div className={`bcast-tabular ${swing >= 0 ? 'bcast-swing-up' : 'bcast-swing-down'}`}
            style={{ fontSize: 30, fontWeight: 800 }}>
            {swing === 0 ? '▬ 0' : swing > 0 ? `▲ ${swing}` : `▼ ${Math.abs(swing)}`}
          </div>
        </div>
        <div className="bcast-tabular" style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }}>
          {won} won · vs {alliance.last_election_seats || 0} in 2021
        </div>
      </div>
    </div>
  );
}

export default function ScoreboardPanel({ alliances, parties, constituencies, majorityLine, totalSeats }) {
  const tally = useMemo(
    () => allianceSeatTally(constituencies, parties, alliances),
    [constituencies, parties, alliances]
  );

  const blocks = alliances
    .map(a => ({ alliance: a, ...((tally[a.code]) || { won: 0, leading: 0 }) }))
    .map(b => ({ ...b, seats: b.won + b.leading }))
    .sort((a, b) => b.seats - a.seats || (a.alliance.sort_order || 0) - (b.alliance.sort_order || 0));

  return (
    <div className="bcast-stage bcast-scoreboard bcast-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 34px 0' }}>
        <div className="bcast-brand">TJ MEDIA · LIVE COUNTING · TAMIL NADU 2026</div>
        <div className="bcast-tabular" style={{ fontSize: 14, color: 'rgba(255,255,255,.6)' }}>
          Majority {majorityLine} / {totalSeats}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {blocks.map((b, i) => (
          <div key={b.alliance.code} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <div style={{ width: 1, height: 150, background: 'rgba(255,255,255,.12)' }} />}
            <AllianceBlock alliance={b.alliance} seats={b.seats} won={b.won} />
          </div>
        ))}
      </div>
    </div>
  );
}
