import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useLang } from './context/LangContext';
import { useElectionData } from './hooks/useElectionData';
import Login from './components/Login';
import Header from './components/Header';
import HeroScoreboard from './components/HeroScoreboard';
import StatusStrip from './components/StatusStrip';
import Filters from './components/Filters';
import ResultsTable from './components/ResultsTable';
import DataEntry from './components/DataEntry';
import UpdateLog from './components/UpdateLog';
import Summary from './components/Summary';
import BroadcastView from './components/BroadcastView';
import ElectionModeSetup from './components/ElectionModeSetup';
import AdminUsers from './components/AdminUsers';

const TABS = ['liveResults', 'dataEntry', 'summary', 'updateLog'];

export default function App() {
  const { session, loading, isAdmin } = useAuth();
  const { t } = useLang();
  const data = useElectionData();
  const [tab, setTab] = useState('liveResults');
  const [filters, setFilters] = useState({ search: '', status: null, alliance: null, district: null });
  const [showSetup, setShowSetup] = useState(false);
  const [showUsers, setShowUsers] = useState(false);

  const isBroadcast = new URLSearchParams(window.location.search).get('mode') === 'broadcast';

  if (isBroadcast) {
    if (data.loading) return null;
    return (
      <BroadcastView
        alliances={data.alliances} parties={data.parties} constituencies={data.constituencies}
        majorityLine={data.config?.majority_line || 118} totalSeats={data.constituencies.length}
      />
    );
  }

  if (loading) return <div style={{ minHeight: '100vh' }} />;
  if (!session) return <Login />;

  if (data.loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mid)' }}>Loading live data…</div>;
  }
  if (data.error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: 'var(--bad)' }}>Couldn't load data: {data.error}</div>
        <button className="btn btn-primary" onClick={data.refresh}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <Header lastUpdated={data.lastUpdated} onRefresh={data.refresh} integrityWarning={data.integrityWarning} />

      <HeroScoreboard
        alliances={data.alliances} parties={data.parties} constituencies={data.constituencies}
        majorityLine={data.config?.majority_line || 118} totalSeats={data.constituencies.length}
        refresh={data.refresh}
      />

      <StatusStrip constituencies={data.constituencies} />

      <div className="container" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div className="glass scroll-thin" style={{ display: 'flex', padding: 4, borderRadius: 999, overflowX: 'auto', flex: '1 1 auto', minWidth: 0, maxWidth: '100%' }}>
          {TABS.map(tb => (
            <button key={tb} onClick={() => setTab(tb)} className="btn btn-sm" style={{
              border: 'none', borderRadius: 999, whiteSpace: 'nowrap',
              background: tab === tb ? 'var(--accent)' : 'transparent',
              color: tab === tb ? '#fff' : 'var(--text-mid)'
            }}>
              {t(tb)}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-sm" onClick={() => setShowUsers(true)}>👤 Users</button>
            <button className="btn btn-sm" onClick={() => setShowSetup(true)}>⚙ {t('settings')}</button>
          </div>
        )}
      </div>

      {tab === 'liveResults' && (
        <>
          <Filters constituencies={data.constituencies} alliances={data.alliances} filters={filters} setFilters={setFilters} />
          <ResultsTable constituencies={data.constituencies} parties={data.parties} votes={data.votes} candidates={data.candidates} filters={filters} refresh={data.refresh} />
        </>
      )}

      {tab === 'dataEntry' && (
        <DataEntry constituencies={data.constituencies} parties={data.parties} alliances={data.alliances} votes={data.votes} candidates={data.candidates} refresh={data.refresh} />
      )}

      {tab === 'summary' && (
        <Summary alliances={data.alliances} parties={data.parties} constituencies={data.constituencies} majorityLine={data.config?.majority_line || 118} votes={data.votes} candidates={data.candidates} refresh={data.refresh} />
      )}

      {tab === 'updateLog' && (
        <UpdateLog logs={data.logs} parties={data.parties} constituencies={data.constituencies} />
      )}

      {showSetup && (
        <ElectionModeSetup config={data.config} onClose={() => { setShowSetup(false); data.refresh(); }} />
      )}

      {showUsers && (
        <AdminUsers onClose={() => setShowUsers(false)} />
      )}
    </div>
  );
}
