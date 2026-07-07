import { useMemo, useRef, useState } from 'react';
import { sb } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fmtNum, normCode } from '../lib/format';
import { computePartyTotals } from './RoundManager';

// ============================================================
// Upload tab — candidate list + results (per round or full).
// CSV only (Excel: File → Save As → CSV UTF-8).
//
// Candidate CSV columns:
//   constituency_id, constituency_name, party_code, candidate_name
// Results CSV columns:
//   constituency_id, constituency_name, party_code, round, votes,
//   entry_mode (optional: total | round_only, default total),
//   status (optional: counting | declared)
//
// constituency_id OR constituency_name is enough (id wins if both).
// Full results later = same file, one row per candidate with the
// final round number and status=declared.
// ============================================================

const CHUNK = 500;

// Minimal RFC-ish CSV parser: quotes, escaped quotes, CRLF, BOM.
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

function downloadCSV(filename, rows) {
  const esc = v => {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Zone({ onFile, children }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`upload-zone${drag ? ' drag' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      {children}
      <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

function PreviewTable({ rows, columns }) {
  const shown = rows.slice(0, 8);
  return (
    <div className="scroll-thin" style={{ overflowX: 'auto', marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c} style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-lo)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{c}</th>
            ))}
            <th style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-lo)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>Check</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className={r.error ? 'row-err' : r.warning ? 'row-warn' : ''}>
              {columns.map(c => (
                <td key={c} className={/votes|round|id/.test(c) ? 'tabular' : ''} style={{ fontSize: 11.5, padding: '7px 8px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{r.display[c] ?? ''}</td>
              ))}
              <td style={{ fontSize: 11.5, padding: '7px 8px', borderBottom: '1px solid var(--line)' }}>
                {r.error ? <span className="err-text">✕ {r.error}</span>
                  : r.warning ? <span className="warn-text">⚠ {r.warning}</span>
                    : <span className="row-ok">✓ OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <div style={{ fontSize: 11, color: 'var(--text-lo)', padding: '6px 8px' }}>… {rows.length - shown.length} more rows</div>
      )}
    </div>
  );
}

export default function Upload({ constituencies, parties, votes, candidates, refresh }) {
  const { user, fullName, isAdmin, isFieldEntry } = useAuth();
  const { push } = useToast();
  const [candRows, setCandRows] = useState(null);
  const [resRows, setResRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const constById = useMemo(() => Object.fromEntries(constituencies.map(c => [c.id, c])), [constituencies]);
  const constByName = useMemo(
    () => Object.fromEntries(constituencies.map(c => [c.name_en.trim().toLowerCase(), c])), [constituencies]);
  const partyByCode = useMemo(() => Object.fromEntries(parties.map(p => [p.code, p])), [parties]);

  const headerIndex = (header, names) => {
    const h = header.map(x => x.trim().toLowerCase().replace(/\s+/g, '_'));
    for (const n of names) { const i = h.indexOf(n); if (i !== -1) return i; }
    return -1;
  };

  const resolveConst = (idRaw, nameRaw) => {
    const id = Number((idRaw || '').toString().trim());
    if (idRaw && !Number.isNaN(id) && constById[id]) return constById[id];
    const name = (nameRaw || '').trim().toLowerCase();
    if (name && constByName[name]) return constByName[name];
    return null;
  };

  // ---------- templates ----------
  const dlCandidateTemplate = () => {
    const rows = [['constituency_id', 'constituency_name', 'party_code', 'candidate_name']];
    constituencies.forEach(c => rows.push([c.id, c.name_en, '', '']));
    downloadCSV('candidates_template.csv', rows);
  };
  const dlResultsTemplate = () => {
    const rows = [['constituency_id', 'constituency_name', 'party_code', 'round', 'votes', 'entry_mode', 'status']];
    constituencies.forEach(c => {
      const cands = candidates[c.id];
      const codes = cands ? Object.keys(cands) : [''];
      codes.forEach(code => rows.push([c.id, c.name_en, code, '', '', 'total', 'counting']));
    });
    downloadCSV('results_template.csv', rows);
  };
  const dlPartyCodes = () => {
    const rows = [['party_code', 'party_name', 'alliance_code']];
    parties.forEach(p => rows.push([p.code, p.name, p.alliance_code || '']));
    downloadCSV('party_codes.csv', rows);
  };

  // ---------- candidate CSV ----------
  const loadCandidateFile = async (file) => {
    const raw = parseCSV(await file.text());
    if (raw.length < 2) return push('File is empty or missing header row', 'error');
    const [header, ...body] = raw;
    const iId = headerIndex(header, ['constituency_id']);
    const iName = headerIndex(header, ['constituency_name', 'constituency']);
    const iParty = headerIndex(header, ['party_code', 'party']);
    const iCand = headerIndex(header, ['candidate_name', 'candidate']);
    if (iParty === -1 || iCand === -1 || (iId === -1 && iName === -1)) {
      return push('Header must include constituency_id (or constituency_name), party_code, candidate_name', 'error');
    }
    const seen = new Set();
    const out = body.map((r, idx) => {
      const c = resolveConst(iId !== -1 ? r[iId] : '', iName !== -1 ? r[iName] : '');
      const code = normCode(r[iParty]);
      const cand = (r[iCand] || '').trim();
      const display = { line: idx + 2, constituency: c?.name_en || r[iName] || r[iId] || '?', party_code: code, candidate_name: cand };
      let error = null;
      if (!c) error = 'Unknown constituency (not in current scope)';
      else if (!partyByCode[code]) error = `Unknown party_code "${code}"`;
      else if (!cand) error = 'candidate_name is empty';
      else {
        const key = `${c.id}|${code}`;
        if (seen.has(key)) error = 'Duplicate constituency+party row';
        seen.add(key);
      }
      return { c, code, cand, display, error };
    });
    setCandRows(out);
  };

  const commitCandidates = async () => {
    const valid = (candRows || []).filter(r => !r.error);
    if (!valid.length) return;
    setBusy(true);
    try {
      const payload = valid.map(r => ({
        constituency_id: r.c.id, party_code: r.code, candidate_name: r.cand
      }));
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { error } = await sb.from('candidates')
          .upsert(payload.slice(i, i + CHUNK), { onConflict: 'constituency_id,party_code' });
        if (error) throw error;
      }
      await sb.from('update_logs').insert([{
        action: 'upload',
        message: `Candidate list uploaded: ${payload.length} rows accepted${(candRows.length - valid.length) ? `, ${candRows.length - valid.length} rejected` : ''}`,
        actor: user.id, actor_name: fullName || user.email
      }]);
      push(`Candidates: ${payload.length} rows saved`, 'success');
      setCandRows(null);
      refresh();
    } catch (e) {
      push(e.message || 'Candidate upload failed (admin only)', 'error');
    } finally { setBusy(false); }
  };

  // ---------- results CSV ----------
  const loadResultsFile = async (file) => {
    const raw = parseCSV(await file.text());
    if (raw.length < 2) return push('File is empty or missing header row', 'error');
    const [header, ...body] = raw;
    const iId = headerIndex(header, ['constituency_id']);
    const iName = headerIndex(header, ['constituency_name', 'constituency']);
    const iParty = headerIndex(header, ['party_code', 'party']);
    const iRound = headerIndex(header, ['round']);
    const iVotes = headerIndex(header, ['votes']);
    const iMode = headerIndex(header, ['entry_mode']);
    const iStatus = headerIndex(header, ['status']);
    if (iParty === -1 || iRound === -1 || iVotes === -1 || (iId === -1 && iName === -1)) {
      return push('Header must include constituency_id (or constituency_name), party_code, round, votes', 'error');
    }
    const seen = new Set();
    const out = body.map((r, idx) => {
      const c = resolveConst(iId !== -1 ? r[iId] : '', iName !== -1 ? r[iName] : '');
      const code = normCode(r[iParty]);
      const round = Number((r[iRound] || '').toString().trim());
      const votesN = Number((r[iVotes] || '').toString().replace(/,/g, '').trim());
      const mode = iMode !== -1 && (r[iMode] || '').trim() ? (r[iMode] || '').trim().toLowerCase() : 'total';
      const status = iStatus !== -1 ? (r[iStatus] || '').trim().toLowerCase() : '';
      const display = {
        line: idx + 2, constituency: c?.name_en || r[iName] || r[iId] || '?',
        party_code: code, round: r[iRound], votes: Number.isFinite(votesN) ? fmtNum(votesN) : r[iVotes]
      };
      let error = null, warning = null;
      if (!c) error = 'Unknown constituency (not in current scope)';
      else if (!partyByCode[code]) error = `Unknown party_code "${code}"`;
      else if (!Number.isInteger(round) || round < 1) error = 'round must be a whole number ≥ 1';
      else if (!Number.isInteger(votesN) || votesN < 0) error = 'votes must be a whole number ≥ 0';
      else if (!['total', 'round_only'].includes(mode)) error = 'entry_mode must be total or round_only';
      else if (status && !['counting', 'declared'].includes(status)) error = 'status must be counting or declared';
      else {
        const key = `${c.id}|${code}|${round}`;
        if (seen.has(key)) error = 'Duplicate constituency+party+round row';
        seen.add(key);
        if (round > 40) warning = 'Round > 40 — check';
        else if (votesN > 300000) warning = 'Unusually high votes — check';
      }
      return { c, code, round, votesN, mode, status, display, error, warning };
    });
    setResRows(out);
  };

  const commitResults = async () => {
    const valid = (resRows || []).filter(r => !r.error);
    if (!valid.length) return;
    setBusy(true);
    try {
      // 1. All vote rows in chunked upserts (same conflict key as DataEntry).
      const payload = valid.map(r => ({
        constituency_id: r.c.id, party_code: r.code, round: r.round,
        votes: r.votesN, entry_mode: r.mode, created_by: user.id
      }));
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { error } = await sb.from('party_votes')
          .upsert(payload.slice(i, i + CHUNK), { onConflict: 'constituency_id,party_code,round' });
        if (error) throw error;
      }

      // 2. Per-constituency: recompute leader/margin from existing votes (pre-refresh)
      //    merged with the uploaded rows — the same running rule as DataEntry.
      const byConst = new Map();
      valid.forEach(r => {
        if (!byConst.has(r.c.id)) byConst.set(r.c.id, []);
        byConst.get(r.c.id).push(r);
      });
      const statusRows = [];
      byConst.forEach((rows, cid) => {
        const merged = JSON.parse(JSON.stringify(votes[cid] || {}));
        rows.forEach(r => {
          merged[r.code] ??= {};
          merged[r.code][r.round] = { votes: r.votesN, entryMode: r.mode };
        });
        const totals = computePartyTotals(merged, parties);
        const ranked = Object.entries(totals).sort(([, a], [, b]) => b - a);
        const leader = ranked[0] || null;
        const margin = ranked.length > 1 ? ranked[0][1] - ranked[1][1] : (leader ? leader[1] : null);
        const declared = rows.some(r => r.status === 'declared');
        const maxRound = Math.max(...rows.map(r => r.round));
        statusRows.push({
          constituency_id: cid,
          status: declared ? 'declared' : 'counting',
          manual_leader_party: leader ? leader[0] : null,
          manual_leader_round: maxRound,
          winning_margin: margin,
          updated_at: new Date().toISOString()
        });
      });
      for (let i = 0; i < statusRows.length; i += CHUNK) {
        const { error } = await sb.from('constituency_status')
          .upsert(statusRows.slice(i, i + CHUNK), { onConflict: 'constituency_id' });
        if (error) throw error;
      }

      // 3. One summary log line for the whole file.
      await sb.from('update_logs').insert([{
        action: 'upload',
        message: `Results uploaded: ${payload.length} rows across ${byConst.size} constituencies${(resRows.length - valid.length) ? `, ${resRows.length - valid.length} rejected` : ''}`,
        actor: user.id, actor_name: fullName || user.email
      }]);

      push(`Results: ${payload.length} rows saved (${byConst.size} constituencies)`, 'success');
      setResRows(null);
      refresh();
    } catch (e) {
      push(e.message || 'Results upload failed', 'error');
    } finally { setBusy(false); }
  };

  if (!isFieldEntry) {
    return (
      <div className="container" style={{ marginTop: 20 }}>
        <div className="glass" style={{ padding: 24, textAlign: 'center', color: 'var(--text-mid)' }}>
          Upload is only available to Field-Entry and Admin roles.
        </div>
      </div>
    );
  }

  const candValid = (candRows || []).filter(r => !r.error).length;
  const candErr = (candRows || []).length - candValid;
  const resValid = (resRows || []).filter(r => !r.error).length;
  const resErr = (resRows || []).length - resValid;

  return (
    <div className="container" style={{ marginTop: 20, maxWidth: 860, marginBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* -------- Candidate list (admin only, matches RLS) -------- */}
      {isAdmin && (
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>👤 Candidate list upload</div>
          <Zone onFile={loadCandidateFile}>Drag CSV here or <b>browse files</b></Zone>
          <ul style={{ fontSize: 11.5, color: 'var(--text-mid)', margin: '10px 0 0', paddingLeft: 18 }}>
            <li>Columns: constituency_id, constituency_name, party_code, candidate_name</li>
            <li>Re-uploading a constituency+party row overwrites the candidate name</li>
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={dlCandidateTemplate}>↓ Template ({constituencies.length} seats)</button>
            <button className="btn btn-ghost btn-sm" onClick={dlPartyCodes}>↓ Party codes</button>
          </div>
          {candRows && (
            <>
              <PreviewTable rows={candRows} columns={['line', 'constituency', 'party_code', 'candidate_name']} />
              {candErr > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--bad)', background: 'var(--bad-soft)', borderRadius: 6, padding: '8px 10px', marginTop: 10 }}>
                  ⚠ {candErr} row{candErr > 1 ? 's' : ''} failed validation and will be skipped.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => setCandRows(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !candValid} onClick={commitCandidates}>
                  {busy ? 'Saving…' : `Commit ${candValid} valid row${candValid !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* -------- Results (round-wise or full) -------- */}
      <div className="glass" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>📥 Results upload — per round or full</div>
        <Zone onFile={loadResultsFile}>Drag CSV here or <b>browse files</b></Zone>
        <ul style={{ fontSize: 11.5, color: 'var(--text-mid)', margin: '10px 0 0', paddingLeft: 18 }}>
          <li>Columns: constituency_id, constituency_name, party_code, round, votes, entry_mode (optional), status (optional)</li>
          <li>entry_mode: <b>total</b> = cumulative so far (default) · <b>round_only</b> = this round's votes only</li>
          <li>Full/final results: one row per candidate with the last round number and status = declared</li>
          <li>Leader, margin and round are recomputed automatically after commit — same rules as Data Entry</li>
        </ul>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={dlResultsTemplate}>↓ Template (from candidate list)</button>
          <button className="btn btn-ghost btn-sm" onClick={dlPartyCodes}>↓ Party codes</button>
        </div>
        {resRows && (
          <>
            <PreviewTable rows={resRows} columns={['line', 'constituency', 'party_code', 'round', 'votes']} />
            {resErr > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--bad)', background: 'var(--bad-soft)', borderRadius: 6, padding: '8px 10px', marginTop: 10 }}>
                ⚠ {resErr} row{resErr > 1 ? 's' : ''} failed validation and will be skipped. Valid rows can still be committed.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => setResRows(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !resValid} onClick={commitResults}>
                {busy ? 'Saving…' : `Commit ${resValid} valid row${resValid !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
