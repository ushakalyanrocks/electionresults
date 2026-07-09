import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '../supabaseClient';

const PAGE = 1000;

// NOTE: party codes are case-sensitive foreign keys into parties(code)
// (e.g. 'admk', 'dmk' — all lowercase in this schema). Only trim stray
// whitespace here — never change case, or writes will violate the FK.
const normCode = (v) => (v || '').toString().trim();

// Loop until exhausted — never trust a single page, this was the #1 bug in v1.
async function fetchAllPaged(build) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export function useElectionData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alliances, setAlliances] = useState([]);
  const [parties, setParties] = useState([]);
  const [config, setConfig] = useState(null); // { mode, selected_constituency_ids, majority_line }
  const [constituencies, setConstituencies] = useState([]); // scoped, joined w/ status
  const [votes, setVotes] = useState({}); // { [constituency_id]: { [party_code]: { [round]: votes } } }
  const [candidates, setCandidates] = useState({}); // { [constituency_id]: { [party_code]: { name, photo } } }
  const [logs, setLogs] = useState([]);
  const [integrityWarning, setIntegrityWarning] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mountedRef = useRef(true);

  const loadAll = useCallback(async () => {
    try {
      setError(null);

      const { data: cfg, error: e0 } = await sb
        .from('election_config')
        .select('*')
        .eq('id', 1)
        .limit(1)
        .maybeSingle();
      if (e0) throw e0;

      const safeCfg = cfg || { id: 1, mode: 'general', selected_constituency_ids: [], majority_line: 118 };

      const { data: alli, error: e1 } = await sb.from('alliances').select('*').order('sort_order');
      if (e1) throw e1;

      const { data: partsRaw, error: e2 } = await sb.from('parties').select('*').order('sort_order');
      if (e2) throw e2;
      const parts = (partsRaw || []).map(p => ({ ...p, code: normCode(p.code) }));

      let constQuery = sb.from('constituencies_latest').select('*').order('id');
      const expectedIds = safeCfg.mode === 'by_election' ? (safeCfg.selected_constituency_ids || []) : null;
      if (expectedIds && expectedIds.length > 0) {
        constQuery = constQuery.in('id', expectedIds);
      }
      const { data: cs, error: e3 } = await constQuery;
      if (e3) throw e3;

      const scopedIds = cs.map(c => c.id);

      const allVotes = await fetchAllPaged((from, to) =>
        sb.from('party_votes')
          .select('constituency_id,party_code,round,votes,is_estimated,entry_mode')
          .in('constituency_id', scopedIds.length ? scopedIds : [-1])
          .order('constituency_id').order('round')
          .range(from, to)
      );

      const allCands = await fetchAllPaged((from, to) =>
        sb.from('candidates')
          .select('constituency_id,party_code,candidate_name,photo_url')
          .order('id')
          .range(from, to)
      );

      const { data: recentLogs, error: e4 } = await sb
        .from('update_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (e4) throw e4;

      const voteMap = {};
      allVotes.forEach(r => {
        const code = normCode(r.party_code);
        voteMap[r.constituency_id] ??= {};
        voteMap[r.constituency_id][code] ??= {};
        voteMap[r.constituency_id][code][r.round] = { votes: r.votes, estimated: r.is_estimated, entryMode: r.entry_mode || 'total' };
      });

      const candMap = {};
      allCands.forEach(r => {
        const code = normCode(r.party_code);
        candMap[r.constituency_id] ??= {};
        candMap[r.constituency_id][code] = { name: r.candidate_name, photo: r.photo_url };
      });

      if (!mountedRef.current) return;

      const expectedCount = safeCfg.mode === 'general' ? 234 : (expectedIds?.length || 0);
      setIntegrityWarning(
        expectedCount && cs.length !== expectedCount
          ? `Expected ${expectedCount} constituencies, fetched ${cs.length}. Check election_config / constituencies table.`
          : null
      );

      setConfig(safeCfg);
      setAlliances(alli || []);
      setParties(parts || []);
      setConstituencies(cs || []);
      setVotes(voteMap);
      setCandidates(candMap);
      setLogs(recentLogs || []);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (e) {
      if (mountedRef.current) { setError(e.message || String(e)); setLoading(false); }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadAll();

    // Realtime: any change to these tables triggers a scoped refetch.
    const channel = sb.channel('election-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_votes' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'constituency_status' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'update_logs' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'election_config' }, loadAll)
      .subscribe();

    // Adaptive polling fallback (in case realtime drops): faster while counting is active.
    const interval = setInterval(() => {
      const activeCounting = constituencies.some(c => c.status === 'counting');
      loadAll();
    }, 15000);

    return () => {
      mountedRef.current = false;
      sb.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAll]);

  return {
    loading, error, alliances, parties, config, constituencies, votes, candidates, logs,
    integrityWarning, lastUpdated, refresh: loadAll
  };
}
