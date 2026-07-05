import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts';
import { fmtNum, normCode } from '../lib/format';
import { useLang } from '../context/LangContext';
import RoundManager from './RoundManager';

function RoundDataPanel({ constituencies, parties, votes, candidates = {}, refresh }) {
  const { lang } = useLang();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return constituencies
      .filter(c => c.name_en.toLowerCase().includes(s) || (c.name_ta || '').includes(s) || c.district.toLowerCase().includes(s))
      .slice(0, 8);
  }, [search, constituencies]);

  // Default to constituencies that actually have round data, most recently active first
  const withData = useMemo(
    () => constituencies.filter(c => votes[c.id] && Object.keys(votes[c.id]).length > 0),
    [constituencies, votes]
  );

  const selected = constituencies.find(c => c.id === selectedId) || null;

  return (
    <div className="glass" style={{ padding: 20, gridColumn: '1 / -1' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Round data by constituency</div>

      <div style={{ position: 'relative', maxWidth: 420 }}>
        <input
          value={selected ? `${selected.name_en} — ${selected.district}` : search}
          onChange={e => { setSearch(e.target.value); setSelectedId(null); }}
          placeholder="Search constituency…"
          style={{ width: '100%' }}
        />
        {matches.length > 0 && !selectedId && (
          <div className="dropdown scroll-thin" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
            {matches.map(c => (
              <div key={c.id} onClick={() => { setSelectedId(c.id); setSearch(''); }}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                {c.name_en} <span style={{ color: 'var(--text-lo)', fontSize: 12 }}>{c.district}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!selected && withData.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {withData.slice(0, 12).map(c => (
            <button key={c.id} className="btn btn-sm btn-ghost" onClick={() => setSelectedId(c.id)}>
              {lang === 'ta' && c.name_ta ? c.name_ta : c.name_en}
            </button>
          ))}
          {withData.length > 12 && <span style={{ fontSize: 12, color: 'var(--text-lo)', alignSelf: 'center' }}>+{withData.length - 12} more — use search</span>}
        </div>
      )}

      {selected && (
        <RoundManager
          constituency={selected}
          parties={parties}
          votesForConst={votes[selected.id] || {}}
          candidatesForConst={candidates[selected.id] || {}}
          refresh={refresh}
        />
      )}
      {!selected && withData.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-lo)' }}>No round data entered yet.</div>
      )}
    </div>
  );
}

export default function Summary({ alliances, parties, constituencies, majorityLine, votes = {}, candidates = {}, refresh }) {
  const partyByCode = useMemo(() => Object.fromEntries(parties.map(p => [p.code, p])), [parties]);

  const donutData = useMemo(() => {
    const map = {};
    alliances.forEach(a => { map[a.code] = { name: a.name, value: 0, color: a.color }; });
    constituencies.forEach(c => {
      if (c.status !== 'declared' || !c.manual_leader_party) return;
      const p = partyByCode[normCode(c.manual_leader_party)];
      if (!p || !map[p.alliance_code]) return;
      map[p.alliance_code].value += 1;
    });
    return Object.values(map).filter(d => d.value > 0);
  }, [alliances, constituencies, partyByCode]);

  const topMargins = useMemo(() => {
    return [...constituencies]
      .filter(c => c.status === 'declared' && c.winning_margin)
      .sort((a, b) => b.winning_margin - a.winning_margin)
      .slice(0, 8)
      .map(c => ({ name: c.name_en.length > 14 ? c.name_en.slice(0, 13) + '…' : c.name_en, margin: c.winning_margin, color: partyByCode[normCode(c.manual_leader_party)]?.color || '#888' }));
  }, [constituencies, partyByCode]);

  // Simple declared-progress sparkline built from update_logs-independent snapshot: we approximate
  // using current declared count vs total as a single-point reference (true time-series needs a
  // `declared_history` table if precise historical sparkline is required later).
  const declaredCount = constituencies.filter(c => c.status === 'declared').length;
  const sparkData = useMemo(() => ([
    { t: 'Start', v: 0 },
    { t: 'Now', v: declaredCount }
  ]), [declaredCount]);

  return (
    <div className="container" style={{ marginTop: 20, marginBottom: 40, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <RoundDataPanel constituencies={constituencies} parties={parties} votes={votes} candidates={candidates} refresh={refresh} />

      <div className="glass" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Seat share (declared)</div>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v) => fmtNum(v)} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--glass-border)', borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-mid)' }}>Majority line: {majorityLine}</div>
      </div>

      <div className="glass" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Top winning margins</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={topMargins} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-mid)' }} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: 'var(--text-mid)' }} />
            <Tooltip formatter={(v) => fmtNum(v)} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--glass-border)', borderRadius: 8 }} />
            <Bar dataKey="margin" radius={[0, 6, 6, 0]}>
              {topMargins.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="glass" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Declared seats progress</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={sparkData}>
            <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'var(--text-mid)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-mid)' }} />
            <Tooltip contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--glass-border)', borderRadius: 8 }} />
            <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
