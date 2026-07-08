import { useMemo } from 'react';
import { fmtNum, normCode } from '../../lib/format';
import { enrichConstituencies } from '../../lib/broadcastData';

// District resolution order:
//   1. producer push (broadcast_control.district_code) — unless &lock=1
//   2. the panel's own ?code= param
// &lock=1 lets a producer keep one Browser Source permanently on, say,
// Chennai while pushing other districts to the "floating" district panel.
export default function DistrictPanel({ constituencies, parties, votes, control, urlCode, locked }) {
  const pushed = !locked ? control?.district_code : null;
  const districtCode = (pushed || urlCode || '').trim();

  const inDistrict = useMemo(() => {
    if (!districtCode) return [];
    const target = districtCode.toLowerCase();
    return constituencies.filter(c => (c.district || '').toLowerCase() === target);
  }, [constituencies, districtCode]);

  const enriched = useMemo(
    () => enrichConstituencies(inDistrict, votes, parties),
    [inDistrict, votes, parties]
  );

  // Header: party-wise seat counts within the district (won + leading).
  const partyCounts = useMemo(() => {
    const partyByCode = Object.fromEntries(parties.map(p => [p.code, p]));
    const counts = {};
    inDistrict.forEach(c => {
      if (!c.manual_leader_party || c.status === 'waitlist') return;
      const p = partyByCode[normCode(c.manual_leader_party)];
      if (!p) return;
      counts[p.code] = (counts[p.code] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([code, n]) => ({ party: partyByCode[code], n }))
      .sort((a, b) => b.n - a.n);
  }, [inDistrict, parties]);

  const displayName = inDistrict[0]?.district || districtCode || '—';

  return (
    <div className="bcast-stage bcast-district bcast-card">
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="bcast-brand">TJ DISTRICT WATCH{pushed ? ' · LIVE PUSH' : ''}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }} className="bcast-tabular">
            {inDistrict.length} seats
          </div>
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{displayName}</div>

        {/* Party-wise header row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          {partyCounts.length === 0 && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)' }}>No leads recorded yet</div>
          )}
          {partyCounts.map(({ party, n }) => (
            <div key={party.code} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,.06)', borderLeft: `4px solid ${party.color}`
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: party.color }}>{party.name}</span>
              <span className="bcast-tabular" style={{ fontSize: 20, fontWeight: 800 }}>{n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Every constituency in the district — rows flex to fill the fixed
          stage height, so 6-seat and 16-seat districts both fit exactly. */}
      <div className="bcast-district-list">
        {!districtCode && (
          <div style={{ padding: 24, color: 'rgba(255,255,255,.5)' }}>
            No district selected — add ?code=&lt;district&gt; to the URL or push one from the Producer panel.
          </div>
        )}
        {districtCode && inDistrict.length === 0 && (
          <div style={{ padding: 24, color: 'rgba(255,255,255,.5)' }}>
            No constituencies found for “{districtCode}”. Check the district spelling against the constituencies table.
          </div>
        )}
        {enriched.map(c => (
          <div key={c.id} className="bcast-district-row">
            <div style={{ width: 6, alignSelf: 'stretch', margin: '6px 0', borderRadius: 3, background: c._leader?.party.color || 'rgba(255,255,255,.1)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.name_en}
              </div>
              <div style={{ fontSize: 12.5, color: c._leader ? c._leader.party.color : 'rgba(255,255,255,.4)', fontWeight: 700 }}>
                {c._leader ? c._leader.party.name : 'Awaiting counting'}
                {c._second && <span style={{ color: 'rgba(255,255,255,.55)', fontWeight: 600 }}> · +{fmtNum(c._margin)}</span>}
              </div>
            </div>
            <span className={`bcast-tag ${c.status === 'declared' ? 'won' : c.status === 'counting' ? 'leading' : 'waitlist'}`}>
              {c.status === 'declared' ? 'WON' : c.status === 'counting' ? 'LEADING' : 'WAITLIST'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
