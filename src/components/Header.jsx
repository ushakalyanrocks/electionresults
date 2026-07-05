import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import { fmtTime } from '../lib/format';

export default function Header({ lastUpdated, onRefresh, integrityWarning }) {
  const { user, role, logout } = useAuth();
  const { dayMode, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang, t } = useLang();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const openBroadcast = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'broadcast');
    window.open(url.toString(), '_blank');
  };

  return (
    <div>
      <div className="glass" style={{
        position: 'sticky', top: 12, zIndex: 40, margin: '12px auto 0', maxWidth: 1320,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px', borderRadius: 18
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 13
          }}>TJ</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="live-dot" />
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.06em' }}>{t('live')}</span>
          </div>
          <div className="tabular" style={{ color: 'var(--text-mid)', fontSize: 13 }}>{fmtTime(now)}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-lo)' }} className="tabular">
            Updated {lastUpdated ? fmtTime(lastUpdated) : '—'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh now">↻</button>
          <button className="btn btn-ghost btn-sm" onClick={openBroadcast} title="Open broadcast/public view in a second monitor">⧉ Broadcast</button>
          <button className="btn btn-ghost btn-sm" onClick={toggleLang}>{lang === 'en' ? 'தமிழ்' : 'ஆங்கிலம்'}</button>
          <button className="btn btn-ghost btn-sm" onClick={toggleTheme}>{dayMode ? '🌙' : '☀️'}</button>
          <div className="btn btn-ghost btn-sm" style={{ cursor: 'default' }}>
            👤 {(user?.email || '').split('@')[0]} <span style={{ opacity: .6 }}>· {role}</span>
          </div>
          <button className="btn btn-sm" onClick={logout}>{t('logout')}</button>
        </div>
      </div>

      {integrityWarning && (
        <div className="container" style={{ marginTop: 10 }}>
          <div className="glass" style={{ padding: '10px 16px', borderColor: 'rgba(255,176,32,.5)', fontSize: 13, color: 'var(--warn)' }}>
            ⚠ {integrityWarning}
          </div>
        </div>
      )}
    </div>
  );
}
