import React, { useEffect, useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';

// What a phone shows after tapping a BAIA card (the card's chip opens /card/?u=<UID>)
export default function CardLookup({ uid, signedIn }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/card-lookup?u=${encodeURIComponent(uid)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (!cancelled) setState(ok ? { data } : { error: data.error || 'Could not read this card.' }); })
      .catch(() => { if (!cancelled) setState({ error: 'Could not read this card. Check your connection.' }); });
    return () => { cancelled = true; };
  }, [uid]);

  if (state.loading) {
    return <div className="cardlookup"><Loader2 className="animate-spin" size={26} /></div>;
  }

  if (state.error || state.data.status === 'inactive') {
    return (
      <div className="cardlookup">
        <h3 className="tapcard-title" style={{ color: '#FFFFFF' }}>This card isn’t active yet</h3>
        <p className="tapcard-line" style={{ color: 'rgba(255,255,255,0.8)' }}>{state.error || 'Ask the barista at the counter to start it.'}</p>
      </div>
    );
  }

  const { status, last4, totalStamps, cycleProgress, pendingRewards } = state.data;
  const filled = cycleProgress === 0 && totalStamps > 0 && pendingRewards > 0 ? 10 : cycleProgress;
  const walkIn = status === 'walk_in';

  return (
    <div className="cardlookup">
      <div className="tapcard-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}>
        {walkIn ? 'Walk-in card' : 'Your card'} ···{last4}
      </div>
      <div className="cardlookup-dots" aria-label={`${filled} of 10 stamps`}>
        {Array.from({ length: 10 }, (_, i) => <span key={i} className={`cardlookup-dot${i < filled ? ' is-on' : ''}`} />)}
      </div>
      <h3 className="tapcard-title" style={{ color: '#FFFFFF', margin: '0 0 4px' }}>{filled} / 10 stamps</h3>

      {pendingRewards > 0 && (
        <p className="tapcard-line" style={{ color: '#FFE699', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Gift size={16} /> Free Classic Coffee ready! Tap at the counter.
        </p>
      )}

      {walkIn ? (
        <p className="tapcard-line" style={{ color: 'rgba(255,255,255,0.8)', marginTop: '8px' }}>
          Keep these stamps safe: make a new BAIA account and ask the barista to link this card.
        </p>
      ) : !signedIn && (
        <p className="tapcard-line" style={{ color: 'rgba(255,255,255,0.8)', marginTop: '8px' }}>
          Sign in below to see your full card.
        </p>
      )}
    </div>
  );
}
