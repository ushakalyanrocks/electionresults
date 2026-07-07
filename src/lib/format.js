// Shared normalizer for party codes — trims stray whitespace only.
// Party codes are case-sensitive foreign keys into parties(code) (lowercase
// in this schema, e.g. 'admk'), so case must never be changed here.
export function normCode(v) {
  return (v || '').toString().trim();
}

export function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-IN');
}

export function fmtTime(d = new Date()) {
  return d.toLocaleTimeString('en-IN', { hour12: false });
}

export function fmtRelative(dateStr) {
  const d = new Date(dateStr);
  const diffSec = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-IN');
}

// Majority = simple majority of the seats actually in play.
// General (234) -> 118. By-election of 5 -> 3. Always derived, never hardcoded.
export function computeMajority(seats) {
  return Math.floor((Number(seats) || 0) / 2) + 1;
}

export const STRINGS = {
  en: {
    live: 'LIVE', declared: 'Declared', counting: 'Counting', waitlist: 'Waitlist',
    of: 'of', constituencies: 'constituencies', search: 'Search constituency…',
    allianceView: 'Alliance view', partyView: 'Party view',
    liveResults: 'Live Results', dataEntry: 'Data Entry', summary: 'Summary', updateLog: 'Update Log', upload: 'Upload',
    login: 'Login', logout: 'Logout', email: 'Email', password: 'Password',
    round: 'Round', total: 'Total', statusUpdate: 'Status Update', voteCountUpdate: 'Vote Count Update',
    thisRoundOnly: 'This Round Only', totalSoFar: 'Total So Far', submit: 'Submit', undo: 'Undo',
    settings: 'Election Setup', general: 'General (234)', byElection: 'By-election (select seats)',

    voteUpdateTitle: 'Vote Update', constituencyLabel: 'Constituency',
    roundNumberLabel: 'Round No.', suggested: 'suggested', statusLabel: 'Status',
    roundWarning: "That doesn't look like a round number. Rounds are usually 1–40; vote counts go in the boxes below.",
    roundCorrectionWarning: 'already exists — saving will correct it.',
    enteredRoundsLabel: 'Entered rounds — tap to correct',
    entryTypeLabel: 'Entry type (applies to all boxes)',
    voteCountLabel: 'Vote Count', optionalIfExists: '(optional — only if available)',
    candidatesMissingWarning: 'No candidates mapped for this constituency yet — showing all parties. Add rows in the candidates table to shorten this list.',
    leaderPartyLabel: 'Leading Party', autoFromVotes: 'auto from votes',
    mandatorySelect: 'must select (no votes typed)',
    marginPreview: 'Margin preview:', reviewSubmit: 'Review & Submit',
    confirmRound: 'Confirm — Round', correctionLabel: '(correction)', statusOnly: '(status only)',
    margin: 'Margin', backLabel: 'Back', savingLabel: 'Saving…',
    viewerOnlyMsg: "You're signed in as a viewer. Data entry is only available to Field-Entry and Admin roles.",
    selectConstituencyPrompt: 'Select a constituency to see its round-wise leader table and totals chart.',
    noRoundDataYet: 'no round data entered yet.',
    roundWiseLeaderTitle: 'Round-wise Leader', partyTotalsAllRounds: 'Party Totals (all rounds)',
    grandTotal: 'Grand Total', leader: 'Leader',
    noAccess: 'You do not have data-entry access', selectConstituencyErr: 'Select a constituency',
    enterRoundErr: 'Enter the round number', enterVotesErr: 'Enter votes OR select the leading party',
    saveFailed: 'Failed to save round', estimatedNote: '* estimated (backfilled round)'
  },
  ta: {
    live: 'நேரலை', declared: 'அறிவிக்கப்பட்டது', counting: 'எண்ணிக்கை', waitlist: 'காத்திருப்பு',
    of: '/', constituencies: 'தொகுதிகள்', search: 'தொகுதியைத் தேடுங்கள்…',
    allianceView: 'கூட்டணி பார்வை', partyView: 'கட்சி பார்வை',
    liveResults: 'நேரலை முடிவுகள்', dataEntry: 'தரவு பதிவு', summary: 'சுருக்கம்', updateLog: 'பதிவேடு', upload: 'பதிவேற்றம்',
    login: 'உள்நுழைய', logout: 'வெளியேறு', email: 'மின்னஞ்சல்', password: 'கடவுச்சொல்',
    round: 'சுற்று', total: 'மொத்தம்', statusUpdate: 'நிலை புதுப்பிப்பு', voteCountUpdate: 'வாக்கு எண்ணிக்கை',
    thisRoundOnly: 'இந்த சுற்று மட்டும்', totalSoFar: 'இதுவரை மொத்தம்', submit: 'சமர்ப்பி', undo: 'செயல்தவிர்',
    settings: 'தேர்தல் அமைப்பு', general: 'பொது (234)', byElection: 'இடைத்தேர்தல் (தொகுதி தேர்வு)',

    voteUpdateTitle: 'வாக்கு புதுப்பிப்பு', constituencyLabel: 'தொகுதி',
    roundNumberLabel: 'சுற்று எண்', suggested: 'பரிந்துரை', statusLabel: 'நிலை',
    roundWarning: 'இது சுற்று எண் போல் தெரியவில்லை. சுற்றுகள் பொதுவாக 1–40; வாக்கு எண்ணிக்கை கீழே உள்ள பெட்டிகளில் இடவும்.',
    roundCorrectionWarning: 'ஏற்கனவே உள்ளது — சேமிக்கும்போது திருத்தப்படும்.',
    enteredRoundsLabel: 'உள்ளிடப்பட்ட சுற்றுகள் — திருத்த தட்டவும்',
    entryTypeLabel: 'உள்ளீட்டு வகை (அனைத்து பெட்டிகளுக்கும் பொருந்தும்)',
    voteCountLabel: 'வாக்கு எண்ணிக்கை', optionalIfExists: '(விருப்பமானது — இருந்தால் மட்டும்)',
    candidatesMissingWarning: 'இந்த தொகுதிக்கு வேட்பாளர்கள் இன்னும் பதிவு செய்யப்படவில்லை — அனைத்து கட்சிகளும் காட்டப்படுகின்றன. பட்டியலை குறைக்க வேட்பாளர் அட்டவணையில் சேர்க்கவும்.',
    leaderPartyLabel: 'முன்னிலை கட்சி', autoFromVotes: 'வாக்குகளிலிருந்து தானாக',
    mandatorySelect: 'கட்டாயம் தேர்வு செய்க (வாக்குகள் இல்லை)',
    marginPreview: 'வித்தியாச முன்னோட்டம்:', reviewSubmit: 'சரிபார்த்து சமர்ப்பி',
    confirmRound: 'உறுதிப்படுத்து — சுற்று', correctionLabel: '(திருத்தம்)', statusOnly: '(நிலை மட்டும்)',
    margin: 'வித்தியாசம்', backLabel: 'திரும்பு', savingLabel: 'சேமிக்கிறது…',
    viewerOnlyMsg: 'நீங்கள் பார்வையாளராக உள்நுழைந்துள்ளீர்கள். தரவு பதிவு புலம் வாகன பதிவாளர் / நிர்வாகிகளுக்கு மட்டுமே.',
    selectConstituencyPrompt: 'சுற்று வாரியான முன்னிலை அட்டவணையையும் விளக்கப்படத்தையும் காண ஒரு தொகுதியைத் தேர்ந்தெடுக்கவும்.',
    noRoundDataYet: 'இதுவரை சுற்று தரவு பதிவு செய்யப்படவில்லை.',
    roundWiseLeaderTitle: 'சுற்று வாரியான முன்னிலை', partyTotalsAllRounds: 'கட்சி வாரியான மொத்த வாக்கு (அனைத்து சுற்றுகள்)',
    grandTotal: 'மொத்தம்', leader: 'முன்னிலை',
    noAccess: 'உங்களுக்கு தரவு பதிவு அனுமதி இல்லை', selectConstituencyErr: 'ஒரு தொகுதியைத் தேர்ந்தெடுக்கவும்',
    enterRoundErr: 'சுற்று எண்ணை உள்ளிடவும்', enterVotesErr: 'வாக்குகளை உள்ளிடவும் அல்லது முன்னிலை கட்சியைத் தேர்ந்தெடுக்கவும்',
    saveFailed: 'சுற்றைச் சேமிக்க முடியவில்லை', estimatedNote: '* மதிப்பிடப்பட்டது (பின்னர் நிரப்பப்பட்ட சுற்று)'
  }
};
