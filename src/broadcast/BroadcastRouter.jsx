import { useEffect } from 'react';
import './broadcast.css';
import { useBroadcastControl } from '../hooks/useBroadcastControl';
import TickerPanel from './panels/TickerPanel';
import SpotlightPanel from './panels/SpotlightPanel';
import DistrictPanel from './panels/DistrictPanel';
import VoteSharePanel from './panels/VoteSharePanel';
import ScoreboardPanel from './panels/ScoreboardPanel';

// URL contract (all panels):
//   ?mode=broadcast&panel=ticker|spotlight|district|voteshare|scoreboard
//   &bg=transparent          → OBS compositing over camera
//   district:  &code=Chennai  (+ &lock=1 to ignore producer pushes)
//   voteshare: &alliances=dmk,admk (optional filter)
//
// No nav, no filters, no admin chrome — the stage is the entire page.
// Data comes from the single useElectionData() call in App (passed via
// `data`); this component never fetches election data itself.
export default function BroadcastRouter({ data, majorityLine, params }) {
  const panel = (params.get('panel') || '').toLowerCase();
  const transparent = params.get('bg') === 'transparent';
  const control = useBroadcastControl();

  // Body-level flags so html/body backgrounds cooperate with OBS.
  useEffect(() => {
    document.body.classList.add('bcast-mode');
    if (transparent) document.body.classList.add('bcast-transparent');
    return () => {
      document.body.classList.remove('bcast-mode', 'bcast-transparent');
    };
  }, [transparent]);

  const common = {
    alliances: data.alliances,
    parties: data.parties,
    constituencies: data.constituencies,
    votes: data.votes,
    candidates: data.candidates
  };

  switch (panel) {
    case 'ticker':
      return <TickerPanel {...common} />;
    case 'spotlight':
      return <SpotlightPanel {...common} control={control} />;
    case 'district':
      return (
        <DistrictPanel {...common} control={control}
          urlCode={params.get('code')} locked={params.get('lock') === '1'} />
      );
    case 'voteshare':
      return <VoteSharePanel {...common} allianceFilter={params.get('alliances')} />;
    case 'scoreboard':
      return (
        <ScoreboardPanel {...common} majorityLine={majorityLine}
          totalSeats={data.constituencies.length} />
      );
    default:
      return (
        <div className="bcast-stage bcast-card" style={{ width: 600, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.7)', fontSize: 15 }}>
          Unknown panel “{panel}”. Use ticker · spotlight · district · voteshare · scoreboard
        </div>
      );
  }
}
