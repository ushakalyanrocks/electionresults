import { useLang } from '../context/LangContext';

function Ring({ pct, color, size = 44 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--glass-hi)" strokeWidth="5" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .6s var(--ease)' }}
      />
    </svg>
  );
}

export default function StatusStrip({ constituencies }) {
  const { t } = useLang();
  const total = constituencies.length || 1;
  const declared = constituencies.filter(c => c.status === 'declared').length;
  const counting = constituencies.filter(c => c.status === 'counting').length;
  const waitlist = constituencies.filter(c => c.status === 'waitlist' || !c.status).length;

  const chips = [
    { label: t('declared'), n: declared, color: 'var(--good)' },
    { label: t('counting'), n: counting, color: 'var(--warn)' },
    { label: t('waitlist'), n: waitlist, color: 'var(--text-lo)' }
  ];

  return (
    <div className="container" style={{ marginTop: 16 }}>
      <div className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        {chips.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ring pct={(c.n / total) * 100} color={c.color} />
            <div>
              <div className="tabular" style={{ fontWeight: 700, fontSize: 16 }}>{c.n}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-mid)' }}>{c.label}</div>
            </div>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 6 }} className="tabular">
            {declared} {t('of')} {total} {t('declared').toLowerCase()}
          </div>
          <div style={{ height: 7, background: 'var(--glass-hi)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ width: `${(declared / total) * 100}%`, height: '100%', background: 'var(--good)', transition: 'width .5s var(--ease)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
