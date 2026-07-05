import { useEffect, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Admin-only. This is the piece that was missing: previously the only way to
// turn a freshly-created auth user into 'field_entry' or 'admin' was to run
// SQL by hand in the Supabase dashboard, which is why every new sign-up sat
// as 'viewer' with data-entry locked out. This panel calls two
// security-definer RPCs (admin_list_users / admin_lookup_user_by_email,
// see supabase/migration_v2_1.sql) which only ever return rows to a caller
// whose own rolemapping.role = 'admin' — enforced server-side, not just hidden UI.
export default function AdminUsers({ onClose }) {
  const { isAdmin } = useAuth();
  const { push } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('field_entry');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await sb.rpc('admin_list_users');
    if (!error) setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const assignRole = async (e) => {
    e.preventDefault();
    if (!email.trim()) { push('Enter the user\'s email', 'error'); return; }
    setBusy(true);
    try {
      const { data: found, error: e1 } = await sb.rpc('admin_lookup_user_by_email', { p_email: email.trim() });
      if (e1) throw e1;
      if (!found || found.length === 0) {
        push('No signed-up user found with that email — ask them to sign up first', 'error');
        return;
      }
      const userId = found[0].id;
      const { error: e2 } = await sb.from('rolemapping').upsert({
        user_id: userId, role, full_name: fullName || null
      }, { onConflict: 'user_id' });
      if (e2) throw e2;
      push(`${email} set to ${role}`, 'success');
      setEmail(''); setFullName('');
      load();
    } catch (err) {
      push(err.message || 'Failed to assign role', 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId, newRole) => {
    const { error } = await sb.from('rolemapping').update({ role: newRole }).eq('user_id', userId);
    if (error) push(error.message, 'error');
    else { push('Role updated', 'success'); load(); }
  };

  if (!isAdmin) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div className="modal-surface" style={{ width: 640, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Users & Roles</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mid)', marginTop: 4 }}>
          Every new sign-up starts as <b>viewer</b> (read-only) until assigned a role here.
        </div>

        <form onSubmit={assignRole} style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <input
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="user's email (must have signed up already)"
            style={{ flex: '2 1 220px' }}
          />
          <input
            value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Display name (optional)"
            style={{ flex: '1 1 140px' }}
          />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ flex: '0 0 140px' }}>
            <option value="field_entry">Field Entry</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Assign role'}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 12.5, color: 'var(--text-mid)' }}>Existing users</div>
        <div className="scroll-thin" style={{ overflowY: 'auto', flex: 1, marginTop: 8, border: '1px solid var(--line)', borderRadius: 10 }}>
          {loading ? (
            <div style={{ padding: 16, color: 'var(--text-lo)' }}>Loading…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-lo)' }}>No users yet.</div>
          ) : users.map(u => (
            <div key={u.user_id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 13.5, gap: 10
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                {u.full_name && <div style={{ fontSize: 11.5, color: 'var(--text-lo)' }}>{u.full_name}</div>}
              </div>
              <select
                value={u.role || 'viewer'}
                onChange={e => changeRole(u.user_id, e.target.value)}
                style={{ flex: '0 0 130px' }}
              >
                <option value="viewer">Viewer</option>
                <option value="field_entry">Field Entry</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
