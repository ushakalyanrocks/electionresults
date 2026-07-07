import { useMemo } from 'react';
import { fmtNum, fmtRelative, normCode } from '../lib/format';

// Colored dot per action — matches the sample audit log:
// green = vote update / declared, amber = correction, red = delete, navy = upload.
const ACTION_COLOR = {
  vote_update: 'var(--good)',
  correction: 'var(--warn)',
  delete: 'var(--bad)',
  upload: 'var(--accent)'
};

// Corrections store a structured diff as JSON in `reason`:
// [{ party: 'admk', old: 3890, new: 3990 }, ...]
function parseDiff(reason) {
  if (!reason) return null;
  try {
    const d = JSON.parse(reason);
    return Array.isArray(d) && d.length && d[0].party !== undefined ? d : null;
  } catch { return null; }
}

export default function UpdateLog({ logs, parties, constituencies }) {
  const partyByCode = useMemo(() => Object.fromEntries(parties.map(p => [p.code, p])), [parties]);
  const constById = useMemo(() => Object.fromEntries(constituencies.map(c => [c.id, c])), [constituencies]);

  return (
    <div className="container" style={{ marginTop: 20, maxWidth: 620, marginBottom: 40 }}>
      <style>{`@keyframes slideIn { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }`}</style>
      <div className="glass scroll-thin" style={{ padding: 8, maxHeight: 640, overflowY: 'auto' }}>
        {logs.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-lo)' }}>No updates yet.</div>}
        {logs.map(l => {
          const p = partyByCode[normCode(l.party_code)];
          const c = constById[l.constituency_id];
          const diff = l.action === 'correction' ? parseDiff(l.reason) : null;
          const dotColor = ACTION_COLOR[l.action] || p?.color || 'var(--text-lo)';
          return (
            <div key={l.id} style={{
              display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--line)',
              animation: 'slideIn .25s var(--ease)'
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 5 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>
                  <b>{c?.name_en || (l.constituency_id ? `#${l.constituency_id}` : 'Bulk')}</b> — {l.message}
                </div>
                {diff && (
                  <div className="log-diff">
                    {diff.map((d, i) => (
                      <span key={i} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>
                        {(partyByCode[normCode(d.party)]?.name || d.party).toUpperCase()}{' '}
                        <span className="old">{d.old === null ? '—' : fmtNum(d.old)}</span>
                        <span className="new">{d.new === null ? 'removed' : fmtNum(d.new)}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--text-lo)', marginTop: 2 }}>
                  {l.actor_name || 'System'} · {fmtRelative(l.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
