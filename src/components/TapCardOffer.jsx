import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Nfc, Coffee, SmartphoneNfc, CloudCheck, Check, X, Loader2, ChevronRight } from 'lucide-react';

const OPTIONS = [
  { withCoffee: true, price: 120, title: 'Card + free coffee', note: 'Any Classic Coffee, on us' },
  { withCoffee: false, price: 50, title: 'Card only', note: 'Just the tap card' }
];

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
  const [withCoffee, setWithCoffee] = useState(true);
  const replacing = Boolean(activeCard);

  const openModal = () => {
    onOpen?.();
    setOpen(true);
  };

  const request = async () => {
    if (await onRequest(withCoffee)) setOpen(false);
  };

  const chosen = OPTIONS.find((o) => o.withCoffee === withCoffee);

  let section;
  if (pendingRequest) {
    const coffee = pendingRequest.includes_free_coffee !== false;
    section = (
      <div className="tapcard-section tapcard-section--waiting">
        <CardArt />
        <div style={{ minWidth: 0 }}>
          <span className="tapcard-chip" style={{ background: '#FB923C', color: '#FFFFFF' }}>Ready for pickup</span>
          <h3 className="tapcard-title">Your card is waiting!</h3>
          <p className="tapcard-line">
            Pay ₱{pendingRequest.price_php || (coffee ? 120 : 50)} at the counter{coffee ? ' and sip a free Classic Coffee ☕' : '.'}
          </p>
        </div>
      </div>
    );
  } else if (activeCard) {
    section = (
      <div className="tapcard-section tapcard-section--dark">
        <CardArt last4={activeCard.card_uid.slice(-4)} />
        <div style={{ minWidth: 0 }}>
          <span className="tapcard-chip" style={{ background: '#16A34A', color: '#FFFFFF' }}><Check size={12} /> Linked</span>
          <h3 className="tapcard-title" style={{ color: '#FFFFFF' }}>Just tap at the counter</h3>
          <p className="tapcard-line" style={{ color: 'rgba(255,255,255,0.7)' }}>Your stamp lands here, no phone needed.</p>
          <button type="button" className="tapcard-link" onClick={openModal}>Lost it? Get a new card</button>
        </div>
      </div>
    );
  } else {
    section = (
      <div className="tapcard-section">
        <CardArt />
        <div style={{ minWidth: 0 }}>
          <h3 className="tapcard-title">Skip the phone. Just tap.</h3>
          <p className="tapcard-line">₱50 · or ₱120 with a free Classic Coffee</p>
          <button type="button" className="tapcard-cta" onClick={openModal}>
            <span>Get my card</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {section}

      {/* Portaled: the card page animates its main column, which would trap position: fixed */}
      {open && createPortal(
        <div className="tapcard-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !submitting) setOpen(false); }}>
          <div className="tapcard-modal" role="dialog" aria-modal="true" aria-label="Get the BAIA Tap Card">
            <button type="button" className="tapcard-close" onClick={() => setOpen(false)} aria-label="Close" disabled={submitting}>
              <X size={18} />
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 16px' }}>
              <CardArt size={160} tilt={-8} />
            </div>

            <h3 className="tapcard-title" style={{ textAlign: 'center', fontSize: '1.35rem' }}>
              {replacing ? 'New BAIA Tap Card' : 'Your BAIA Tap Card'}
            </h3>
            {replacing && (
              <p className="tapcard-line" style={{ textAlign: 'center' }}>Your stamps stay safe. The lost card stops working.</p>
            )}

            <div className="tapcard-options" role="radiogroup" aria-label="Card option">
              {OPTIONS.map((o) => (
                <button
                  key={o.price}
                  type="button"
                  role="radio"
                  aria-checked={withCoffee === o.withCoffee}
                  className={`tapcard-option${withCoffee === o.withCoffee ? ' is-selected' : ''}`}
                  onClick={() => setWithCoffee(o.withCoffee)}
                >
                  <span className="tapcard-option-price">₱{o.price}</span>
                  <span className="tapcard-option-title">{o.withCoffee && <Coffee size={14} />} {o.title}</span>
                  <span className="tapcard-option-note">{o.note}</span>
                </button>
              ))}
            </div>

            <ul className="tapcard-perks">
              <li><SmartphoneNfc size={18} /> Tap to stamp, phone stays put</li>
              <li><CloudCheck size={18} /> Stamps saved to your account</li>
            </ul>

            {error && <p className="tapcard-error">{error}</p>}

            <button type="button" className="tapcard-cta tapcard-cta--wide" onClick={request} disabled={submitting}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <span>Reserve my card · ₱{chosen.price}</span>}
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
