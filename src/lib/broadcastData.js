// Shared derivations for the OBS broadcast panels.
// IMPORTANT: no data fetching here — everything is derived from the single
// useElectionData() result passed down from App. computePartyTotals is
// reused from RoundManager so the running-total rule ('total' replaces,
// 'round_only' adds) stays defined in exactly one place.
import { computePartyTotals } from '../components/RoundManager';
import { normCode } from './format';

// Enrich constituencies with ranked party totals + margin, same shape as
// ResultsTable's enrichment (leader / second / margin), so the broadcast
// panels agree with the newsroom table to the vote.
export function enrichConstituencies(constituencies, votes, parties) {
  const partyByCode = Object.fromEntries(parties.map(p => [p.code, p]));
  return constituencies.map(c => {
    const totals = computePartyTotals(votes[c.id] || {}, parties);
    const ranked = Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .map(([code, total]) => ({ party: partyByCode[code], total }))
      .filter(e => e.party);
    const leader = ranked[0] || null;
    const second = ranked[1] || null;
    const manualLeader = !leader && c.manual_leader_party && partyByCode[normCode(c.manual_leader_party)]
      ? { party: partyByCode[normCode(c.manual_leader_party)], total: 0, manual: true }
      : null;
    return {
      ...c,
      _ranked: ranked,
      _leader: leader || manualLeader,
      _second: second,
      _margin: leader && second ? leader.total - second.total : (leader ? leader.total : 0)
    };
  });
}

// Per-alliance seat tally { code: { won, leading } } — leader party's
// alliance gets the seat, exactly like HeroScoreboard's computeTally
// but grouped at alliance level.
export function allianceSeatTally(constituencies, parties, alliances) {
  const partyByCode = Object.fromEntries(parties.map(p => [p.code, p]));
  const tally = {};
  alliances.forEach(a => { tally[a.code] = { won: 0, leading: 0 }; });
  constituencies.forEach(c => {
    if (!c.manual_leader_party) return;
    const p = partyByCode[normCode(c.manual_leader_party)];
    if (!p || !tally[p.alliance_code]) return;
    if (c.status === 'declared') tally[p.alliance_code].won += 1;
    else if (c.status === 'counting') tally[p.alliance_code].leading += 1;
  });
  return tally;
}

// Total raw votes per alliance across the current scope (for voteshare).
export function allianceVoteTotals(constituencies, votes, parties) {
  const partyByCode = Object.fromEntries(parties.map(p => [p.code, p]));
  const out = {};
  constituencies.forEach(c => {
    const totals = computePartyTotals(votes[c.id] || {}, parties);
    Object.entries(totals).forEach(([code, total]) => {
      const p = partyByCode[code];
      if (!p) return;
      out[p.alliance_code] = (out[p.alliance_code] || 0) + total;
    });
  });
  return out;
}

// "Tightest margins" rotation list for the spotlight panel: seats still
// counting, with a real contest (leader AND runner-up have votes),
// sorted by smallest margin. Falls back to any counting seat with a
// leader if literally nothing has two-party data yet.
export function tightestMargins(enriched, limit = 12) {
  const contested = enriched
    .filter(c => c.status === 'counting' && c._leader && c._second && c._margin >= 0)
    .sort((a, b) => a._margin - b._margin);
  if (contested.length) return contested.slice(0, limit);
  return enriched.filter(c => c.status === 'counting' && c._leader).slice(0, limit);
}

// The alliance's "face" party for ticker symbols: lowest sort_order member.
export function leadPartyOfAlliance(alliance, parties) {
  return parties
    .filter(p => p.alliance_code === alliance.code)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))[0] || null;
}
