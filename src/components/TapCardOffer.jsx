import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Nfc, Coffee, SmartphoneNfc, CloudCheck, Check, X, Loader2, ChevronRight } from 'lucide-react';

// Mini illustration of the physical card; shows the last 4 digits once linked
function CardArt({ last4, tilt = -6, size = 128 }) {
  return (
    <div className="tapcard-art" style={{ width: size, transform: `rotate(${tilt}deg)` }} aria-hidden="true">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <img src="/images/Logo.webp" alt="" style={{ width: size * 0.2, height: size * 0.2, borderRadius: '6px' }} />
        <Nfc size={size * 0.16} color="#FFE699" />
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: size * 0.1, letterSpacing: '1.5px', color: '#FFE699' }}>
        {last4 ? `•••• ${last4}` : 'BAIA TAP'}
      </div>
    </div>
  );
}

export default function TapCardOffer({ activeCard, pendingRequest, submitting, error, onRequest, onOpen }) {
  const [open, setOpen] = useState(false);

  const request = async () => {
    if (await onRequest()) setOpen(false);
  };

  if (activeCard) {
    return (
      <div className="tapcard-section tapcard-section--dark">
        <CardArt last4={activeCard.card_uid.slice(-4)} />
        <div style={{ minWidth: 0 }}>
          <span className="tapcard-chip" style={{ background: '#16A34A', color: '#FFFFFF' }}><Check size={12} /> Linked</span>
          <h3 className="tapcard-title" style={{ color: '#FFFFFF' }}>Just tap at the counter</h3>
          <p className="tapcard-line" style={{ color: 'rgba(255,255,255,0.7)' }}>Your stamp lands here, no phone needed.</p>
        </div>
      </div>
    );
  }

  if (pendingRequest) {
    return (
      <div className="tapcard-section tapcard-section--waiting">
        <CardArt />
        <div style={{ minWidth: 0 }}>
          <span className="tapcard-chip" style={{ background: '#FB923C', color: '#FFFFFF' }}>Ready for pickup</span>
          <h3 className="tapcard-title">Your card is waiting!</h3>
          <p className="tapcard-line">Pay ₱120 at the counter and sip a free Classic Coffee ☕</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tapcard-section">
        <CardArt />
        <div style={{ minWidth: 0 }}>
          <h3 className="tapcard-title">Skip the phone. Just tap.</h3>
          <p className="tapcard-line">₱120 · free Classic Coffee included</p>
          <button type="button" className="tapcard-cta" onClick={() => { onOpen?.(); setOpen(true); }}>
            <span>Get my card</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Portaled: the card page animates its main column, which would trap position: fixed */}
      {open && createPortal(
        <div className="tapcard-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !submitting) setOpen(false); }}>
          <div className="tapcard-modal" role="dialog" aria-modal="true" aria-label="Get the BAIA Tap Card">
            <button type="button" className="tapcard-close" onClick={() => setOpen(false)} aria-label="Close" disabled={submitting}>
              <X size={18} />
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 18px' }}>
              <CardArt size={170} tilt={-8} />
            </div>

            <h3 className="tapcard-title" style={{ textAlign: 'center', fontSize: '1.35rem' }}>Your BAIA Tap Card</h3>

            <ul className="tapcard-perks">
              <li><Coffee size={18} /> Free Classic Coffee with it</li>
              <li><SmartphoneNfc size={18} /> Tap to stamp, phone stays put</li>
              <li><CloudCheck size={18} /> Stamps saved to your account</li>
            </ul>

            {error && <p className="tapcard-error">{error}</p>}

            <button type="button" className="tapcard-cta tapcard-cta--wide" onClick={request} disabled={submitting}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <span>Reserve my card · ₱120</span>}
            </button>
            <p className="tapcard-line" style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.78rem' }}>
              Pay when you pick it up.
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
