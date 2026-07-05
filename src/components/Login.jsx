import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

export default function Login() {
  const { login } = useAuth();
  const { t, lang, toggle } = useLang();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !pass) { setErr('Email and password required'); return; }
    setBusy(true); setErr('');
    try {
      await login(email, pass);
    } catch (e2) {
      setErr(e2.message || 'Login failed');
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20
    }}>
      <form
        onSubmit={submit}
        className="glass"
        style={{
          width: 380, maxWidth: '100%', padding: 36,
          animation: shake ? 'shake .4s' : 'none'
        }}
      >
        <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }`}</style>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff'
          }}>TJ</div>
          <div>
            <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>TJ Election Results</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>Live counting dashboard</div>
          </div>
        </div>

        <div style={{ height: 20 }} />

        <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{t('email')}</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', marginTop: 6, marginBottom: 14 }} autoComplete="username"
        />

        <label style={{ fontSize: 12.5, color: 'var(--text-mid)' }}>{t('password')}</label>
        <div style={{ position: 'relative', marginTop: 6 }}>
          <input
            type={showPass ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
            style={{ width: '100%' }} autoComplete="current-password"
          />
          <button type="button" onClick={() => setShowPass(v => !v)}
            className="btn btn-ghost btn-sm"
            style={{ position: 'absolute', right: 4, top: 4 }}>
            {showPass ? 'Hide' : 'Show'}
          </button>
        </div>

        {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 12 }}>{err}</div>}

        <button className="btn btn-primary" disabled={busy} type="submit" style={{ width: '100%', marginTop: 20 }}>
          {busy ? 'Logging in…' : `${t('login')} →`}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={toggle}>
            {lang === 'en' ? 'தமிழ்' : 'English'}
          </button>
        </div>
      </form>
    </div>
  );
}
