import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { CreditCard, Check, Clock, Gift, Wifi, X, Loader2, AlertCircle } from 'lucide-react';

const RESULT_TIMEOUT_MS = 45_000;
const ORDERS_REFRESH_MS = 30_000;

// Short beep so the barista hears the tap landed without looking (no setup needed)
function beep(kind) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = beep.ctx || (beep.ctx = new AudioCtx());
    if (ctx.state === 'suspended') ctx.resume();
    const notes = kind === 'ok' ? [880, 1320] : [440, 330];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    // Audio is a nicety; never block a tap on it
  }
}

function firstName(profile) {
  const name = profile?.display_name || profile?.email?.split('@')[0] || 'Member';
  return name.split(' ')[0];
}

export default function CardTapPanel({ password, adminSession }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState([]);
  const [giveTo, setGiveTo] = useState(null);
  const [giveState, setGiveState] = useState({ status: 'waiting', message: '' });
  const [typing, setTyping] = useState(false);
  const [typedUid, setTypedUid] = useState('');

  const bufferRef = useRef('');
  const lastKeyRef = useRef(0);
  const busyRef = useRef(false);
  const onScanRef = useRef(() => {});

  const post = useCallback(async (endpoint, payload = {}) => {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminSession ? { 'X-Admin-Session': adminSession } : {})
      },
      body: JSON.stringify({ ...(adminSession ? { adminSession } : { password }), ...payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }, [password, adminSession]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await post('admin-card-requests');
      setOrders(data.pending || []);
    } catch (err) {
      console.warn('Could not load card orders:', err.message);
    }
  }, [post]);

  useEffect(() => {
    loadOrders();
    const id = setInterval(loadOrders, ORDERS_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadOrders]);

  // Fall back to the ready screen so the next customer never sees the last one's result
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setResult(null), RESULT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [result]);

  const tapCard = useCallback(async (uid) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const data = await post('admin-card-tap', { cardUid: uid });
      setResult(data);
      if (data.status === 'awarded') {
        beep('ok');
        if (data.rewardUnlockedNow) confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } });
      } else {
        beep('warn');
      }
    } catch (err) {
      beep('warn');
      setResult({ status: 'error', message: err.message });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [post]);

  const linkCard = useCallback(async (order, uid) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setGiveTo(order);
    setGiveState({ status: 'linking', message: '' });
    try {
      await post('admin-fulfill-card', { requestId: order.id, cardUid: uid });
      beep('ok');
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.4 } });
      setGiveState({ status: 'done', message: '' });
      setResult(null);
      loadOrders();
      setTimeout(() => setGiveTo(null), 2200);
    } catch (err) {
      beep('warn');
      setGiveState({ status: 'waiting', message: err.message });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [post, loadOrders]);

  // While handing over a new card, a scan links it; otherwise a scan is a stamp tap
  onScanRef.current = (uid) => {
    if (giveTo && giveState.status === 'waiting') linkCard(giveTo, uid);
    else if (!giveTo) tapCard(uid);
  };

  const openGive = (order) => {
    setGiveTo(order);
    setGiveState({ status: 'waiting', message: '' });
  };

  // The counter reader types the card UID as 10 decimal digits (e.g. 0333718276)
  // in a fast burst, then hits Enter
  useEffect(() => {
    const handleKeyDown = (e) => {
      // A focused field receives the reader's keystrokes itself and submits its own
      // form on Enter. Buffering here too would miss the first digit (no burst yet)
      // and re-submit a truncated UID, dropping the leading 0.
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        bufferRef.current = '';
        return;
      }

      const now = Date.now();
      const elapsed = now - lastKeyRef.current;
      lastKeyRef.current = now;
      if (elapsed > 120 && e.key !== 'Enter') bufferRef.current = '';

      if (e.key === 'Enter') {
        const uid = bufferRef.current.trim();
        bufferRef.current = '';
        if (uid.length >= 4 && uid.length <= 32) {
          e.preventDefault();
          onScanRef.current(uid);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const submitTyped = (e) => {
    e.preventDefault();
    const uid = typedUid.trim();
    if (!uid) return;
    setTypedUid('');
    setTyping(false);
    onScanRef.current(uid);
  };

  const typedForm = (
    <form onSubmit={submitTyped} style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'center' }}>
      <input
        autoFocus
        inputMode="numeric"
        value={typedUid}
        onChange={(e) => setTypedUid(e.target.value)}
        placeholder="0333718276"
        aria-label="Card number"
        style={{ width: '160px', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '1px' }}
      />
      <button type="submit" style={pillButton('#131314', '#FFFFFF')}>Go</button>
    </form>
  );

  return (
    <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', boxSizing: 'border-box' }}>
      <section className="loyalty-section-card" style={{ padding: '22px 20px', textAlign: 'center', ...resultTint(result) }}>
        {busy && !giveTo ? (
          <div style={{ padding: '18px 0', color: '#64748B', fontWeight: 700 }}>
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : !result ? (
          <ReadyState typing={typing} setTyping={setTyping} typedForm={typedForm} />
        ) : (
          <TapResult result={result} orders={orders} onGive={(order) => linkCard(order, result.cardUid)} onDone={() => setResult(null)} />
        )}
      </section>

      {orders.length > 0 && (
        <section className="loyalty-section-card" style={{ padding: '16px 18px' }}>
          <div className="section-card-title" style={{ marginBottom: '10px', fontSize: '0.95rem' }}>
            <Clock size={18} color="#FB923C" />
            <span>Card orders waiting ({orders.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {orders.map((order) => (
              <div key={order.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', background: '#FAF4EB', borderRadius: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: '#131314', fontSize: '0.92rem' }}>{order.profiles?.display_name || 'Member'}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.profiles?.email}</div>
                </div>
                <button type="button" onClick={() => openGive(order)} style={pillButton('#131314', '#FFFFFF')}>
                  <CreditCard size={15} />
                  <span>Give card</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {giveTo && (
        <GiveCardOverlay
          order={giveTo}
          state={giveState}
          onCancel={() => { if (giveState.status !== 'linking') setGiveTo(null); }}
          onTyped={(uid) => linkCard(giveTo, uid)}
        />
      )}
    </div>
  );
}

function ReadyState({ typing, setTyping, typedForm }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <div className="tap-ready-icon">
        <CreditCard size={30} />
      </div>
      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.25rem', margin: '14px 0 4px', color: '#131314' }}>
        Ready for a card tap
      </h3>
      <p style={{ margin: 0, color: '#64748B', fontSize: '0.88rem' }}>
        Tap the customer’s card on the reader.
      </p>
      {typing ? typedForm : (
        <button type="button" onClick={() => setTyping(true)} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#64748B', fontSize: '0.78rem', textDecoration: 'underline', cursor: 'pointer' }}>
          Reader not working? Type the card number
        </button>
      )}
    </div>
  );
}

function TapResult({ result, orders, onGive, onDone }) {
  const { status } = result;
  const name = result.user?.display_name || 'Member';

  if (status === 'error') {
    return (
      <div>
        <AlertCircle size={34} color="#B91C1C" />
        <h3 style={headline}>That didn’t work</h3>
        <p style={subline}>{result.message}</p>
        <button type="button" onClick={onDone} style={{ ...pillButton('#131314', '#FFFFFF'), marginTop: '14px' }}>OK</button>
      </div>
    );
  }

  if (status === 'unlinked_card') {
    return (
      <div>
        <div style={chip('#475569', '#E2E8F0')}>New card</div>
        <h3 style={headline}>This card isn’t linked yet</h3>
        {orders.length > 0 ? (
          <>
            <p style={subline}>Who is it for?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
              {orders.map((order) => (
                <button key={order.id} type="button" onClick={() => onGive(order)} style={pillButton('#131314', '#FFFFFF')}>
                  Give to {order.profiles?.display_name || 'Member'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p style={subline}>No card orders waiting. The customer orders one on their loyalty page first.</p>
        )}
        <button type="button" onClick={onDone} style={{ ...linkButton, marginTop: '14px' }}>Dismiss</button>
      </div>
    );
  }

  const awarded = status === 'awarded';
  const total = result.totalStamps || 0;
  const cycle = result.cycleProgress || 0;
  const filled = cycle === 0 && total > 0 && result.pendingRewards > 0 ? 10 : cycle;

  return (
    <div>
      <div style={awarded ? chip('#FFFFFF', '#16A34A') : chip('#92400E', '#FEF3C7')}>
        {awarded ? <><Check size={13} /> Stamp added</> : 'Already stamped today'}
      </div>
      <h3 style={{ ...headline, fontSize: '1.7rem' }}>{name}</h3>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', margin: '14px 0 6px', flexWrap: 'wrap' }} aria-label={`${filled} of 10 stamps`}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{
            width: '24px', height: '24px', borderRadius: '50%',
            background: i < filled ? '#FB923C' : '#FFFFFF',
            border: i < filled ? '2px solid #EA580C' : '2px dashed #CBD5E1',
            boxSizing: 'border-box'
          }} />
        ))}
      </div>
      <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 700 }}>{filled} / 10 stamps</div>

      {result.pendingRewards > 0 && (
        <div style={{ margin: '14px auto 0', maxWidth: '380px', background: '#FFF7ED', border: '1.5px solid #FB923C', color: '#9A3412', borderRadius: '14px', padding: '10px 14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Gift size={18} />
          <span>Free Classic Coffee ready!</span>
        </div>
      )}

      {result.wifiVoucher && (
        <div style={{ margin: '14px auto 0', maxWidth: '380px', background: '#131314', color: '#FFFFFF', borderRadius: '14px', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1' }}>
            <Wifi size={16} /> Wi-Fi code
          </span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '2px', fontVariantNumeric: 'tabular-nums' }}>
            {result.wifiVoucher.code}
          </span>
        </div>
      )}

      <button type="button" onClick={onDone} style={{ ...pillButton('#131314', '#FFFFFF'), marginTop: '16px' }}>Done</button>
    </div>
  );
}

function GiveCardOverlay({ order, state, onCancel, onTyped }) {
  const [typed, setTyped] = useState('');
  const name = firstName(order.profiles);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Give card to ${name}`} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000 }}>
      <div style={{ background: '#FFFFFF', borderRadius: '24px', padding: '26px 22px', width: '100%', maxWidth: '400px', textAlign: 'center', position: 'relative', boxSizing: 'border-box' }}>
        {state.status !== 'linking' && state.status !== 'done' && (
          <button type="button" onClick={onCancel} aria-label="Cancel" style={{ position: 'absolute', top: '14px', right: '14px', background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        )}

        {state.status === 'done' ? (
          <>
            <div className="tap-ready-icon" style={{ background: '#16A34A', color: '#FFFFFF' }}><Check size={30} /></div>
            <h3 style={headline}>Card linked to {name}!</h3>
            <p style={subline}>Hand it over with their free Classic Coffee.</p>
          </>
        ) : (
          <>
            <div className="tap-ready-icon">
              {state.status === 'linking' ? <Loader2 className="animate-spin" size={30} /> : <CreditCard size={30} />}
            </div>
            <h3 style={headline}>Tap {name}’s new card</h3>
            <p style={subline}>Put a fresh card on the reader.</p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
              <span style={chip('#131314', '#FAF4EB')}>Collect ₱120</span>
              <span style={chip('#131314', '#FAF4EB')}>☕ Free Classic Coffee</span>
            </div>

            {state.message && (
              <p style={{ marginTop: '14px', color: '#B91C1C', fontSize: '0.84rem', fontWeight: 700 }}>{state.message}</p>
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); if (typed.trim()) onTyped(typed.trim()); setTyped(''); }}
              style={{ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'center' }}
            >
              <input
                inputMode="numeric"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="or type card number"
                aria-label="Card number"
                style={{ width: '170px', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontSize: '0.85rem' }}
              />
              <button type="submit" style={pillButton('#F1F5F9', '#131314')}>Link</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function resultTint(result) {
  if (!result) return {};
  if (result.status === 'awarded') return { background: '#F0FDF4', borderColor: '#86EFAC' };
  if (result.status === 'already_stamped') return { background: '#FFFBEB', borderColor: '#FCD34D' };
  if (result.status === 'error') return { background: '#FEF2F2', borderColor: '#FCA5A5' };
  return {};
}

const headline = { fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.3rem', margin: '10px 0 4px', color: '#131314' };
const subline = { margin: 0, color: '#64748B', fontSize: '0.88rem' };
const linkButton = { background: 'none', border: 'none', color: '#64748B', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer' };

function chip(color, background) {
  return { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '9999px', fontSize: '0.74rem', fontWeight: 800, color, background };
}

function pillButton(background, color) {
  return { background, color, border: 'none', padding: '9px 16px', borderRadius: '9999px', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' };
}
