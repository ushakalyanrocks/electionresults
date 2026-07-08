import { useState } from 'react';
import PARTY_SYMBOLS from '../lib/partySymbols';

// Three-tier party mark, cheapest-first fallback:
//   1. party.symbol_icon_url — real ballot symbol, if you've set one on the row (DB override)
//   2. party.favicon_url, or the hardcoded PARTY_SYMBOLS[code].favicon — website favicon
//   3. initials badge        — party.color background + 1-2 letter initials, always works
//
// Tiers 1 and 2 fall through to the next on image load error (dead domain,
// missing file, CORS block, etc.) so nothing ever renders as a broken icon.
function initialsOf(party) {
  const src = (party.short_name || party.name || '').trim();
  if (!src) return '?';
  const words = src.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function PartySymbol({ party, size = 16, style }) {
  const staticEntry = PARTY_SYMBOLS[(party?.code || '').toUpperCase()];
  const symbolUrl = party?.symbol_icon_url || staticEntry?.symbolUrl || null;
  const faviconUrl = party?.favicon_url || staticEntry?.favicon || null;
  const initialTier = symbolUrl ? 0 : faviconUrl ? 1 : 2;
  const [tier, setTier] = useState(initialTier);

  if (!party) return null;

  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'inline-block', verticalAlign: 'middle', ...style
  };

  if (tier === 0 && symbolUrl) {
    return (
      <img
        src={symbolUrl}
        alt={party.short_name || party.name}
        width={size} height={size}
        style={{ ...base, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)' }}
        onError={() => setTier(faviconUrl ? 1 : 2)}
      />
    );
  }

  if (tier === 1 && faviconUrl) {
    return (
      <img
        src={faviconUrl}
        alt={party.short_name || party.name}
        width={size} height={size}
        style={{ ...base, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)' }}
        onError={() => setTier(2)}
      />
    );
  }

  // tier 2 — always renders, no network dependency
  return (
    <span
      title={party.name}
      style={{
        ...base,
        background: party.color || 'var(--text-lo)',
        color: '#fff',
        fontSize: Math.max(8, Math.round(size * 0.42)),
        fontWeight: 800,
        lineHeight: `${size}px`,
        textAlign: 'center'
      }}
    >
      {initialsOf(party)}
    </span>
  );
}
