import { useEffect, useMemo, useRef, useState } from 'react';
import { allianceSeatTally, leadPartyOfAlliance } from '../../lib/broadcastData';

function Chip({ url, label, color, size, round = true }) {
  return (
    <div className="bcast-chip" style={{
      width: size, height: size, background: color || '#3a4152',
      fontSize: size * 0.4, borderRadius: round ? '50%' : 8,
      border: '2px solid rgba(255,255,255,.25)'
    }}>
      {url ? <img src={url} alt={label} /> : (label || '?').slice(0, 2)}
    </div>
  );
}

function SeatCount({ value, color }) {
  // Pop animation whenever the count changes.
  const prevRef = useRef(value);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setPop(true);
      const t = setTimeout(() => setPop(false), 950);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <div className={`bcast-seat-count bcast-tabular${pop ? ' bcast-pop' : ''}`} style={{ color }}>
      {value}
    </div>
  );
}

export default function TickerPanel({ alliances, parties, constituencies }) {
  const tally = useMemo(
    () => allianceSeatTally(constituencies, parties, alliances),
    [constituencies, parties, alliances]
  );

  const items = useMemo(() => alliances.map(a => {
    const lead = leadPartyOfAlliance(a, parties);
    const t = tally[a.code] || { won: 0, leading: 0 };
    return { alliance: a, leadParty: lead, seats: t.won + t.leading, won: t.won };
  }), [alliances, parties, tally]);

  // Marquee speed scales with content so 5 alliances vs 8 feel the same.
  const dur = Math.max(28, items.length * 9);

  const rail = (keyPrefix) => (
    <>
      {items.map((it, i) => (
        <div key={`${keyPrefix}-${it.alliance.code}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <div className="bcast-ticker-item">
            <Chip url={it.alliance.leader_photo_url} label={it.alliance.leader_name || it.alliance.name}
              color={it.alliance.color} size={72} />
            <Chip url={it.leadParty?.symbol_url} label={it.leadParty?.code} color={it.leadParty?.color || it.alliance.color}
              size={48} round={false} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: it.alliance.color }}>{it.alliance.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }} className="bcast-tabular">
                {it.won} won
              </div>
            </div>
            <SeatCount value={it.seats} color="#fff" />
          </div>
          <div className="bcast-ticker-sep" />
        </div>
      ))}
    </>
  );

  return (
    <div className="bcast-stage bcast-ticker bcast-card" style={{ '--bcast-marquee-dur': `${dur}s` }}>
      <div className="bcast-ticker-label">
        <div className="bcast-brand">TJ LIVE</div>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.04em' }}>TN 2026</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>SEAT TALLY</div>
      </div>
      <div className="bcast-ticker-track">
        {/* Rail duplicated once for a seamless -50% loop, same trick as BroadcastView */}
        <div className="bcast-ticker-rail">
          {rail('a')}
          {rail('b')}
        </div>
      </div>
    </div>
  );
}
