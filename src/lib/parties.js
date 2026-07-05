// Client-side display config. The source of truth for which alliances/parties
// exist is the `alliances` / `parties` tables in Supabase (fetched at boot) —
// this file only supplies fallback colors/labels if a code isn't in memory yet,
// and the canonical alliance color variables used across CSS.
export const ALLIANCE_COLOR_VAR = {
  dmk: '--c-dmk',
  admk: '--c-admk',
  tvk: '--c-tvk',
  ntk: '--c-ntk',
  oth: '--c-oth'
};

export function allianceColor(code) {
  const v = ALLIANCE_COLOR_VAR[code] || '--c-oth';
  if (typeof document !== 'undefined') {
    const val = getComputedStyle(document.documentElement).getPropertyValue(v);
    if (val) return val.trim();
  }
  return '#7d8296';
}

export const MAJORITY_LINE_DEFAULT = 118;
export const TOTAL_SEATS_DEFAULT = 234;
