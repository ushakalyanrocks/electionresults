import { useMemo } from 'react';
import { fmtRelative, normCode } from '../lib/format';

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
          return (
            <div key={l.id} style={{
              display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--line)',
              animation: 'slideIn .25s var(--ease)'
            }}>
              <div style={{ width: 4, borderRadius: 4, background: p?.color || 'var(--text-lo)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>
                  <b>{c?.name_en || `#${l.constituency_id}`}</b> — {l.message}
                </div>
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
