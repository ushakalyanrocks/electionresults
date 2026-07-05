import { useEffect, useMemo, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';

// This panel is the ONLY UI surface in the app that can change election scope
// (general vs by-election + which constituencies are in play). It is gated by
// isAdmin in App.jsx, and additionally enforced server-side: RLS only allows
// UPDATE/INSERT on election_config for is_admin() (see supabase/schema.sql).
// Viewer and Field-Entry roles never see this panel, and even if they called
// the API directly, the RLS policy would reject the write.
export default function ElectionModeSetup({ config, onClose }) {
  const { isAdmin } = useAuth();
  const { t } = useLang();
  const { push } = useToast();
  const [mode, setMode] = useState(config?.mode || 'general');
  const [selected, setSelected] = useState(new Set(config?.selected_constituency_ids || []));
  const [majorityLine, setMajorityLine] = useState(config?.majority_line || 118);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [allConstituencies, setAllConstituencies] = useState([]);

  // Always load the FULL master list here (unscoped), regardless of the
  // current election_config, so admin can pick from every constituency.
  useEffect(() => {
    sb.from('constituencies').select('id,name_en,district').order('id').then(({ data, error }) => {
      if (!error) setAllConstituencies(data || []);
    });
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allConstituencies;
    return allConstituencies.filter(c => c.name_en.toLowerCase().includes(s) || c.district.toLowerCase().includes(s));
  }, [allConstituencies, search]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await sb.from('election_config').update({
        mode,
        selected_constituency_ids: mode === 'by_election' ? [...selected] : [],
        majority_line: Number(majorityLine),
        updated_at: new Date().toISOString()
      }).eq('id', 1);
      if (error) throw error;
      push('Election scope updated', 'success');
      onClose();
    } catch (e) {
      push(e.message || 'Failed to save (admin only)', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div className="modal-surface" style={{ width: 620, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{t('settings')}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mid)', marginTop: 4 }}>
          Admin-only. This controls which constituencies every viewer and field-entry user sees — they cannot change scope themselves.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {['general', 'by_election'].map(m => (
            <button key={m} onClick={() => setMode(m)} className="btn"
              style={{ flex: 1, background: mode === m ? 'var(--accent)' : 'var(--glass-hi)', color: mode === m ? '#fff' : 'var(--text-hi)' }}>
              {m === 'general' ? t('general') : t('byElection')}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>Majority line</label>
          <input type="number" value={majorityLine} onChange={e => setMajorityLine(e.target.value)} style={{ width: 120, marginLeft: 10 }} />
        </div>

        {mode === 'by_election' && (
          <>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search constituencies to include…"
              style={{ width: '100%', marginTop: 16 }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-mid)', margin: '8px 0' }}>{selected.size} selected</div>
            <div className="scroll-thin" style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--line)', borderRadius: 10 }}>
              {filtered.map(c => (
                <label key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderBottom: '1px solid var(--line)', cursor: 'pointer', fontSize: 13.5
                }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  {c.name_en} <span style={{ color: 'var(--text-lo)', fontSize: 12 }}>({c.district})</span>
                </label>
              ))}
              {filtered.length === 0 && <div style={{ padding: 16, color: 'var(--text-lo)', textAlign: 'center' }}>No matches.</div>}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save scope'}
          </button>
        </div>
      </div>
    </div>
  );
}
