import { useMemo } from 'react';
import { useLang } from '../context/LangContext';

export default function Filters({ constituencies, alliances, filters, setFilters }) {
  const { t } = useLang();
  const districts = useMemo(
    () => [...new Set(constituencies.map(c => c.district))].sort(),
    [constituencies]
  );

  const activeCount = (filters.status ? 1 : 0) + (filters.alliance ? 1 : 0) + (filters.district ? 1 : 0);

  const clearAll = () => setFilters({ search: filters.search, status: null, alliance: null, district: null });

  return (
    <div className="container" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder={t('search')}
          style={{ minWidth: 220, flex: '1 1 220px' }}
        />

        {['waitlist', 'counting', 'declared'].map(s => (
          <button
            key={s}
            onClick={() => setFilters(f => ({ ...f, status: f.status === s ? null : s }))}
            className="btn btn-sm"
            style={{ background: filters.status === s ? 'var(--accent)' : 'var(--glass-hi)', color: filters.status === s ? '#fff' : 'var(--text-hi)' }}
          >
            {t(s)}
          </button>
        ))}

        <select value={filters.alliance || ''} onChange={e => setFilters(f => ({ ...f, alliance: e.target.value || null }))}>
          <option value="">All alliances</option>
          {alliances.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
        </select>

        <select value={filters.district || ''} onChange={e => setFilters(f => ({ ...f, district: e.target.value || null }))}>
          <option value="">All districts</option>
          {districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        {activeCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={clearAll}>
            Clear ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
