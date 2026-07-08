import { useEffect, useMemo, useState } from 'react';
import { fmtNum, normCode } from '../../lib/format';
import { enrichConstituencies, tightestMargins } from '../../lib/broadcastData';

const ROTATE_MS = 12000; // within the requested 10–15s window

function Face({ url, label, color, size }) {
  return (
    <div className="bcast-chip" style={{
      width: size, height: size, background: color || '#3a4152', fontSize: size * 0.38,
      border: '3px solid rgba(255,255,255,.25)'
    }}>
      {url ? <img src={url} alt={label} /> : (label || '?').slice(0, 2)}
    </div>
  );
}

function Symbol({ url, label, color, size = 34 }) {
  return (
    <div className="bcast-chip" style={{ width: size, height: size, background: color || '#3a4152', fontSize: 13, borderRadius: 6 }}>
      {url ? <img src={url} alt={label} /> : (label || '?').slice(0, 3)}
    </div>
  );
}

export default function SpotlightPanel({ constituencies, parties, votes, candidates, control }) {
  const enriched = useMemo(
    () => enrichConstituencies(constituencies, votes, parties),
    [constituencies, votes, parties]
  );
  const rotation = useMemo(() => tightestMargins(enriched), [enriched]);

  const [idx, setIdx] = useState(0);

  // Producer override: pinned constituency wins over auto-rotation.
  const pinnedId = control?.spotlight_pinned ? control?.spotlight_constituency_id : null;

  useEffect(() => {
    if (pinnedId || rotation.length <= 1) return;
    const t = setInterval(() => setIdx(i => i + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [pinnedId, rotation.length]);

  const current = pinnedId
    ? enriched.find(c => c.id === pinnedId)
    : rotation.length ? rotation[idx % rotation.length] : null;

  if (!current) {
    return (
      <div className="bcast-stage bcast-spotlight bcast-card" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 20 }}>Waiting for counting data…</div>
      </div>
    );
  }

  const leader = current._leader;
  const leaderCand = leader ? candidates[current.id]?.[normCode(leader.party.code)] : null;
  const rest = (current._ranked || []).slice(1);

  return (
    <div className="bcast-stage bcast-spotlight bcast-card">
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: `3px solid ${leader?.party.color || '#3a4152'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="bcast-brand">{pinnedId ? 'TJ SPOTLIGHT · PINNED' : 'TJ SPOTLIGHT'}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }} className="bcast-tabular">
            Round {current.current_round || 0} · {current.status === 'declared' ? 'DECLARED' : 'COUNTING'}
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, lineHeight: 1.15 }}>
          {current.name_en}
          {current.name_ta && <span style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,.6)', marginLeft: 10 }}>{current.name_ta}</span>}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }}>{current.district} district</div>
      </div>

      {/* Leader block — key forces the fade animation on every rotation */}
      <div key={current.id} className="bcast-spot-fade" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 20px', background: 'rgba(255,255,255,.04)' }}>
          <Face url={leaderCand?.photo} label={leaderCand?.name || leader?.party.name} color={leader?.party.color} size={110} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {leaderCand?.name || '—'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: leader?.party.color }}>{leader?.party.name}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 16, alignItems: 'baseline' }}>
              <div className="bcast-tabular" style={{ fontSize: 34, fontWeight: 800 }}>{fmtNum(leader?.total || 0)}</div>
              {current._second && (
                <div className="bcast-tabular" style={{ fontSize: 17, fontWeight: 700, color: '#35d07f' }}>
                  +{fmtNum(current._margin)} margin
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Everyone else, ranked */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {rest.map((e, i) => {
            const cand = candidates[current.id]?.[normCode(e.party.code)];
            return (
              <div key={e.party.code} className="bcast-spot-row">
                <div className="bcast-tabular" style={{ width: 26, fontSize: 14, color: 'rgba(255,255,255,.4)', fontWeight: 700 }}>{i + 2}</div>
                <Symbol url={e.party.symbol_url} label={e.party.code} color={e.party.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cand?.name || e.party.name}
                  </div>
                  <div style={{ fontSize: 12, color: e.party.color, fontWeight: 700 }}>{e.party.name}</div>
                </div>
                <div className="bcast-tabular" style={{ fontSize: 20, fontWeight: 800 }}>{fmtNum(e.total)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
