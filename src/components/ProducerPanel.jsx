import { useMemo, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useBroadcastControl } from '../hooks/useBroadcastControl';
import { fmtRelative } from '../lib/format';

// Producer live-control screen (?mode=producer, admin only).
// One tap = one UPDATE on broadcast_control → Supabase Realtime pushes the
// change into every open OBS spotlight/district panel instantly. Nothing
// is edited in OBS mid-broadcast.
export default function ProducerPanel({ constituencies }) {
  const { session, isAdmin } = useAuth();
  const control = useBroadcastControl();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  const districts = useMemo(
    () => [...new Set(constituencies.map(c => c.district).filter(Boolean))].sort(),
    [constituencies]
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return constituencies
      .filter(c => c.name_en.toLowerCase().includes(q) || (c.name_ta || '').includes(search.trim()))
      .slice(0, 8);
  }, [constituencies, search]);

  const push = async (patch) => {
    setBusy(true); setErr('');
    const { error } = await sb.from('broadcast_control')
      .update({ ...patch, updated_by: session?.user?.id || null, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) setErr(error.message);
    setBusy(false);
  };

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mid)' }}>
        Producer control is admin-only. Ask an admin to grant your account the admin role.
      </div>
    );
  }

  const pinned = control?.spotlight_pinned ? constituencies.find(c => c.id === control.spotlight_constituency_id) : null;

  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: 30, paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>🎛 Broadcast Producer</h2>
        {control?.updated_at && (
          <span style={{ fontSize: 12, color: 'var(--text-lo)' }}>last push {fmtRelative(control.updated_at)}</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 0 }}>
        Pushes go live instantly on every open OBS panel via realtime — no page reloads needed.
      </p>
      {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 10 }}>{err}</div>}

      {/* ---- Spotlight control ---- */}
      <div className="glass" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Spotlight panel</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mid)', marginBottom: 10 }}>
          Currently: {pinned
            ? <b style={{ color: 'var(--accent)' }}>📌 pinned on {pinned.name_en}</b>
            : 'auto-rotating through tightest margins'}
        </div>

        <input
          className="input" placeholder="Search constituency to spotlight…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text-hi)' }}
        />
        {matches.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {matches.map(c => (
              <button key={c.id} className="btn btn-sm" disabled={busy}
                onClick={() => { push({ spotlight_constituency_id: c.id, spotlight_pinned: true }); setSearch(''); }}
                style={{ justifyContent: 'space-between', display: 'flex' }}>
                <span>{c.name_en} <span style={{ color: 'var(--text-lo)' }}>· {c.district}</span></span>
                <span style={{ color: 'var(--accent)' }}>Spotlight now →</span>
              </button>
            ))}
          </div>
        )}

        {pinned && (
          <button className="btn btn-sm" disabled={busy} style={{ marginTop: 10 }}
            onClick={() => push({ spotlight_constituency_id: null, spotlight_pinned: false })}>
            ▶ Resume auto-rotation
          </button>
        )}
      </div>

      {/* ---- District control ---- */}
      <div className="glass" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>District panel</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mid)', marginBottom: 10 }}>
          Currently showing: {control?.district_code
            ? <b style={{ color: 'var(--accent)' }}>{control.district_code}</b>
            : 'each panel’s own ?code= URL param'}
          <span style={{ display: 'block', color: 'var(--text-lo)', marginTop: 2 }}>
            Panels opened with &lock=1 ignore these pushes and stay on their URL district.
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {districts.map(d => (
            <button key={d} className="btn btn-sm" disabled={busy}
              onClick={() => push({ district_code: d })}
              style={control?.district_code === d ? { background: 'var(--accent)', color: '#fff', border: 'none' } : undefined}>
              {d}
            </button>
          ))}
        </div>
        {control?.district_code && (
          <button className="btn btn-sm" disabled={busy} style={{ marginTop: 12 }}
            onClick={() => push({ district_code: null })}>
            ✕ Clear push (panels fall back to their URL)
          </button>
        )}
      </div>
    </div>
  );
}
