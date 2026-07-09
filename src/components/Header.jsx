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
      <div className="glass app-header">
        <div className="app-header-left">
          <div className="app-header-logo">TJ</div>
          <div className="app-header-live">
            <span className="live-dot" />
            <span className="app-header-live-label" style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.06em' }}>{t('live')}</span>
          </div>
          <div className="tabular app-header-clock" style={{ color: 'var(--text-mid)', fontSize: 13 }}>{fmtTime(now)}</div>
        </div>

        <div className="app-header-right scroll-thin">
          <span className="tabular app-header-updated" style={{ fontSize: 12, color: 'var(--text-lo)' }}>
            Updated {lastUpdated ? fmtTime(lastUpdated) : '—'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh now">↻</button>
          <button className="btn btn-ghost btn-sm app-header-broadcast" onClick={openBroadcast} title="Open broadcast/public view in a second monitor">
            <span className="app-header-broadcast-label">⧉ Broadcast</span>
            <span className="app-header-broadcast-icon">⧉</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={toggleLang}>{lang === 'en' ? 'தமிழ்' : 'ஆங்கிலம்'}</button>
          <button className="btn btn-ghost btn-sm" onClick={toggleTheme}>{dayMode ? '🌙' : '☀️'}</button>
          <div className="btn btn-ghost btn-sm app-header-user" style={{ cursor: 'default' }}>
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

      <style>{`
        .app-header {
          position: sticky; top: 12px; z-index: 40;
          width: 100%; max-width: none; margin: 12px 0 0;
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 18px; border-radius: 18px; gap: 12px;
        }
        .app-header-left { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .app-header-right { display: flex; align-items: center; gap: 8px; }
        .app-header-logo {
          width: 32px; height: 32px; border-radius: 9px; background: var(--accent);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; color: #fff; font-size: 13px; flex-shrink: 0;
        }
        .app-header-live { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
        .app-header-broadcast-icon { display: none; }
        .app-header-user span { white-space: nowrap; }

        /* Tablet: keep everything on one row, just drop the extra "Updated" text */
        @media (max-width: 860px) {
          .app-header-updated { display: none; }
        }

        /* Phone: two edge-to-edge rows instead of one cramped row.
           Left group stays compact; right group becomes its own scrollable
           strip so nothing gets clipped or pushes other buttons off-screen. */
        @media (max-width: 640px) {
          .app-header {
            margin: 10px 10px 0; padding: 8px 10px 10px; border-radius: 14px;
            flex-wrap: wrap;
          }
          .app-header-clock { display: none; }
          .app-header-user { display: none; }
          .app-header-right {
            flex: 1 1 100%; overflow-x: auto; justify-content: flex-start;
            padding-top: 6px; border-top: 1px solid var(--line);
          }
          .app-header-right::-webkit-scrollbar { height: 0; }
        }

        /* Small phone: trim label text further, keep icons only where safe */
        @media (max-width: 400px) {
          .app-header-live-label { display: none; }
          .app-header-broadcast-label { display: none; }
          .app-header-broadcast-icon { display: inline; }
        }
      `}</style>
    </div>
  );
}
