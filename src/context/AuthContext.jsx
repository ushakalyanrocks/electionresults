import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { sb } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null); // 'admin' | 'field_entry' | 'viewer' | null
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);

  const loadRole = useCallback(async (userId) => {
    if (!userId) { setRole(null); setFullName(''); return; }
    const { data, error } = await sb
      .from('rolemapping')
      .select('role, full_name')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Unable to load role mapping', error);
      setRole('viewer');
      setFullName('');
      return;
    }

    if (data) {
      setRole(data.role);
      setFullName(data.full_name || '');
    } else {
      // No rolemapping row yet -> treat as viewer (read-only) until admin assigns a role
      setRole('viewer');
      setFullName('');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      await loadRole(session?.user?.id);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      await loadRole(session?.user?.id);
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, [loadRole]);

  const login = async (email, password) => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await sb.auth.signOut();
  };

  const value = {
    session,
    user: session?.user || null,
    role,
    fullName,
    isAdmin: role === 'admin',
    isFieldEntry: role === 'admin' || role === 'field_entry',
    loading,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
