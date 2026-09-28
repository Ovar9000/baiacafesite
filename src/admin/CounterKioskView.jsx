import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Coffee, 
  Clock, 
  Search, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  ArrowRight, 
  Check, 
  UserCheck, 
  Radio, 
  Loader2,
  Gift,
  HelpCircle,
  X
} from 'lucide-react';

// Web Audio API Synthesizer (Zero-latency, zero-dependency, works offline)
function createAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  return AudioCtx ? new AudioCtx() : null;
}

export default function CounterKioskView({ password, adminSession }) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [loadingTap, setLoadingTap] = useState(false);
  const [lastTapResult, setLastTapResult] = useState(null);
  const [tapHistory, setTapHistory] = useState([]);

  // Card Requests state
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [fulfillUidInput, setFulfillUidInput] = useState('');
  const [fulfilling, setFulfilling] = useState(false);
  const [fulfillMessage, setFulfillMessage] = useState('');
  const [fulfillError, setFulfillError] = useState('');

  // Scanner keystroke burst buffer
  const scanBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const audioCtxRef = useRef(null);

  // Initialize Web Audio
  useEffect(() => {
    audioCtxRef.current = createAudioContext();
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const playChime = useCallback((type = 'success') => {
    if (!soundEnabled) return;
    try {
      const ctx = audioCtxRef.current || createAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      if (type === 'success') {
        // High-pitched pleasant dual-tone chime (E5 -> B5)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now); // E5
        osc2.frequency.setValueAtTime(987.77, now + 0.08); // B5

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.12);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.45);
      } else if (type === 'milestone') {
        // Celebratory 3-chord fanfare (C5 -> E5 -> G5 -> C6)
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.09);
          gain.gain.setValueAtTime(0.2, now + i * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.09);
          osc.stop(now + i * 0.09 + 0.45);
        });
      } else if (type === 'duplicate') {
        // Soft double-boop warning
        [440, 392].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.12);
          gain.gain.setValueAtTime(0.12, now + i * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.12);
          osc.stop(now + i * 0.12 + 0.22);
        });
      }
    } catch (e) {
      console.warn('Audio feedback error:', e);
    }
  }, [soundEnabled]);

  // Fetch pending card requests
  const fetchCardRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const isSession = adminSession && (!password || password === adminSession);
      const res = await fetch('/api/admin-card-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isSession ? { 'X-Admin-Session': adminSession } : {})
        },
        body: JSON.stringify({
          ...(isSession ? { adminSession } : { password })
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRequests(data.pending || []);
      }
    } catch (err) {
      console.warn('Failed to load card requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, [password, adminSession]);

  useEffect(() => {
    fetchCardRequests();
  }, [fetchCardRequests]);

  // Execute NFC Card Tap
  const executeCardTap = useCallback(async (rawUid) => {
    if (!rawUid || loadingTap) return;
    const cleanUid = rawUid.replace(/[:\s-]/g, '').trim().toUpperCase();
    if (cleanUid.length < 4) return;

    try {
      setLoadingTap(true);
      const isSession = adminSession && (!password || password === adminSession);
      const res = await fetch('/api/admin-card-tap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isSession ? { 'X-Admin-Session': adminSession } : {})
        },
        body: JSON.stringify({
          ...(isSession ? { adminSession } : { password }),
          cardUid: cleanUid
        })
      });

      const data = await res.json();
      setLastTapResult(data);

      if (data.status === 'awarded') {
        if (data.rewardUnlockedNow) {
          playChime('milestone');
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        } else {
          playChime('success');
        }
        setTapHistory((prev) => [
          {
            id: Date.now(),
            time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            name: data.user?.display_name || 'Member',
            cardUid: cleanUid,
            totalStamps: data.totalStamps,
            rewardUnlocked: data.rewardUnlockedNow
          },
          ...prev.slice(0, 9)
        ]);
      } else if (data.status === 'already_stamped') {
        playChime('duplicate');
      } else if (data.status === 'unlinked_card') {
        // If unlinked, pre-fill fulfill input if modal is open
        setFulfillUidInput(cleanUid);
      }
    } catch (err) {
      console.error('Error executing card tap:', err);
    } finally {
      setLoadingTap(false);
    }
  }, [password, adminSession, loadingTap, playChime]);

  // Global USB HID Scanner Keystroke Listener
  // Hardware scanners type the card UID in <50ms per key and hit Enter
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is actively typing in a standard input or textarea
      const target = e.target;
      const isTypingField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Scanners send keystrokes in bursts under 60ms
      if (elapsed > 120 && scanBufferRef.current.length > 0 && e.key !== 'Enter') {
        scanBufferRef.current = '';
      }

      if (e.key === 'Enter') {
        const scannedString = scanBufferRef.current.trim();
        scanBufferRef.current = '';

        if (scannedString.length >= 4 && scannedString.length <= 32) {
          e.preventDefault();
          executeCardTap(scannedString);
        }
        return;
      }

      // Collect single printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!isTypingField || elapsed < 50) {
          scanBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeCardTap]);

  // Handle manual submit from input box
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    executeCardTap(manualInput.trim());
    setManualInput('');
  };

  // Fulfill request and link card
  const handleFulfillCard = async (e) => {
    e.preventDefault();
    if (!selectedRequest || !fulfillUidInput.trim()) return;

    try {
      setFulfilling(true);
      setFulfillError('');
      setFulfillMessage('');

      const isSession = adminSession && (!password || password === adminSession);
      const res = await fetch('/api/admin-fulfill-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isSession ? { 'X-Admin-Session': adminSession } : {})
        },
        body: JSON.stringify({
          ...(isSession ? { adminSession } : { password }),
          requestId: selectedRequest.id,
          cardUid: fulfillUidInput.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to link card.');
      }

      playChime('milestone');
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.6 } });
      setFulfillMessage(data.message);

      setTimeout(() => {
        setSelectedRequest(null);
        setFulfillUidInput('');
        setFulfillMessage('');
        fetchCardRequests();
      }, 2500);

    } catch (err) {
      setFulfillError(err.message || 'Error linking card.');
    } finally {
      setFulfilling(false);
    }
  };

  return (
    <div className="admin-tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '840px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      
      {/* 1. Kiosk Top Action Bar */}
      <div style={{
        background: '#FFFFFF',
        border: '1.5px solid var(--loyalty-border)',
        borderRadius: '20px',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            color: '#FFE699',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
          }}>
            <CreditCard size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--loyalty-navy)', margin: 0 }}>
              Barista Cashier Counter Tap
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
              USB NFC Reader Active • Tap card to award daily stamp (1/day)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: soundEnabled ? '#F0FDF4' : '#F8FAFC',
              border: `1.5px solid ${soundEnabled ? '#86EFAC' : '#CBD5E1'}`,
              color: soundEnabled ? '#15803D' : '#64748B',
              padding: '8px 12px',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
            title={soundEnabled ? 'Mute Audio Chime' : 'Enable Audio Chime'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span>{soundEnabled ? 'Chime ON' : 'Muted'}</span>
          </button>

          <button
            type="button"
            onClick={fetchCardRequests}
            disabled={loadingRequests}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #CBD5E1',
              color: '#334155',
              padding: '8px 14px',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <RotateCw size={14} className={loadingRequests ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Hero Cashier Scanner Terminal Card */}
      <div style={{
        background: lastTapResult?.status === 'awarded'
          ? 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)'
          : lastTapResult?.status === 'already_stamped'
          ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)'
          : lastTapResult?.status === 'unlinked_card'
          ? 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)'
          : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        border: `2px solid ${
          lastTapResult?.status === 'awarded'
            ? '#22C55E'
            : lastTapResult?.status === 'already_stamped'
            ? '#F59E0B'
            : lastTapResult?.status === 'unlinked_card'
            ? '#3B82F6'
            : 'rgba(255, 255, 255, 0.12)'
        }`,
        borderRadius: '24px',
        padding: 'clamp(24px, 4vw, 36px) clamp(20px, 4vw, 32px)',
        color: lastTapResult ? '#0F172A' : '#FFFFFF',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.15)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s ease'
      }}>
        {/* Pulsing indicator icon */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: lastTapResult?.status === 'awarded'
            ? '#22C55E'
            : lastTapResult?.status === 'already_stamped'
            ? '#F59E0B'
            : lastTapResult?.status === 'unlinked_card'
            ? '#3B82F6'
            : 'rgba(255, 255, 255, 0.15)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
          animation: lastTapResult ? 'none' : 'pulse 2s infinite'
        }}>
          {lastTapResult?.status === 'awarded' ? (
            <CheckCircle2 size={38} />
          ) : lastTapResult?.status === 'already_stamped' ? (
            <AlertCircle size={38} />
          ) : lastTapResult?.status === 'unlinked_card' ? (
            <Radio size={38} />
          ) : (
            <Radio size={38} />
          )}
        </div>

        {/* Dynamic Scan Result State */}
        {lastTapResult ? (
          <div>
            <div style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '10px',
              background: lastTapResult.status === 'awarded'
                ? '#15803D'
                : lastTapResult.status === 'already_stamped'
                ? '#B45309'
                : '#1D4ED8',
              color: '#FFFFFF'
            }}>
              {lastTapResult.status === 'awarded'
                ? 'Stamp Recorded'
                : lastTapResult.status === 'already_stamped'
                ? 'Daily Limit Reached'
                : 'Unassigned Blank Card'}
            </div>

            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 'clamp(1.4rem, 4vw, 1.8rem)',
              fontWeight: 800,
              margin: '0 0 8px',
              color: '#0F172A'
            }}>
              {lastTapResult.user?.display_name || 'Member'}
            </h2>

            <p style={{
              fontSize: '0.92rem',
              fontWeight: 600,
              color: '#475569',
              margin: '0 0 16px',
              maxWidth: '480px',
              marginInline: 'auto'
            }}>
              {lastTapResult.message}
            </p>

            {/* Cycle Stamp Progress Bar if member found */}
            {lastTapResult.totalStamps !== undefined && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(8px)',
                borderRadius: '16px',
                padding: '14px 18px',
                maxWidth: '420px',
                margin: '0 auto 16px',
                border: '1px solid rgba(0, 0, 0, 0.08)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
                  <span>Cycle Progress</span>
                  <span style={{ color: 'var(--loyalty-navy)' }}>
                    {lastTapResult.cycleProgress} / 10 Stamps
                  </span>
                </div>
                <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, (lastTapResult.cycleProgress || 0) * 10)}%`,
                    height: '100%',
                    background: lastTapResult.cycleProgress === 10 ? '#22C55E' : 'linear-gradient(90deg, #F59E0B, #10B981)',
                    borderRadius: '9999px',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>
            )}

            {/* If unlinked, quick-assign button */}
            {lastTapResult.status === 'unlinked_card' && (
              <button
                type="button"
                onClick={() => {
                  setFulfillUidInput(lastTapResult.cardUid);
                  if (requests.length > 0) {
                    setSelectedRequest(requests[0]);
                  }
                }}
                style={{
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                }}
              >
                <Sparkles size={16} />
                <span>Assign Card {lastTapResult.cardUid} to Member →</span>
              </button>
            )}
          </div>
        ) : (
          <div>
            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 'clamp(1.4rem, 4vw, 1.8rem)',
              fontWeight: 800,
              margin: '0 0 8px',
              color: '#FFFFFF'
            }}>
              Ready for Customer Tap
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.8)', margin: '0 auto 16px', maxWidth: '460px' }}>
              Customer taps their physical card onto the USB scanner. Stamp is recorded automatically.
            </p>
          </div>
        )}

        {/* Manual Test / Fallback Barcode / NFC Input */}
        <form onSubmit={handleManualSubmit} style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '8px', maxWidth: '400px', marginInline: 'auto' }}>
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Type/Scan Card UID (e.g. 047BA23F)"
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1.5px solid #CBD5E1',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: '#FFFFFF',
              color: '#1E293B',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={loadingTap || !manualInput.trim()}
            style={{
              background: 'var(--loyalty-gold, #F59E0B)',
              color: '#0F172A',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {loadingTap ? <Loader2 size={16} className="animate-spin" /> : <span>Tap</span>}
          </button>
        </form>
      </div>

      {/* 3. Pending Card Requests Queue */}
      <div style={{
        background: '#FFFFFF',
        border: '1.5px solid var(--loyalty-border)',
        borderRadius: '20px',
        padding: '22px 24px',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Pending Card Requests
              </h3>
              <span style={{
                background: '#FEF3C7',
                color: '#B45309',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 800
              }}>
                {requests.length} Waiting
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0 0' }}>
              Members who requested a physical card on <strong>baia.cafe/card</strong>. Collect ₱120 &amp; dispense free Classic Coffee.
            </p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94A3B8' }}>
            <CheckCircle2 size={36} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: '0.88rem', margin: 0 }}>All card requests fulfilled! No members currently waiting.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {requests.map((req) => (
              <div
                key={req.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '12px 18px',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A' }}>
                    {req.profiles?.display_name || 'Member'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                    {req.profiles?.email} • Requested {new Date(req.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#15803D', fontWeight: 700, marginTop: '4px' }}>
                    <Coffee size={13} />
                    <span>₱120 Due • 1 Free Classic Coffee Included</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRequest(req);
                    setFulfillUidInput('');
                    setFulfillError('');
                    setFulfillMessage('');
                  }}
                  style={{
                    background: 'var(--loyalty-navy, #0F172A)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <CreditCard size={15} />
                  <span>Fulfill &amp; Tap Card →</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Recent Daily Taps Feed */}
      {tapHistory.length > 0 && (
        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid var(--loyalty-border)',
          borderRadius: '20px',
          padding: '20px 24px',
          boxSizing: 'border-box'
        }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', margin: '0 0 12px' }}>
            Recent Taps Today
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tapHistory.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.84rem',
                  padding: '8px 12px',
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #F1F5F9'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#22C55E', fontWeight: 700 }}>+1</span>
                  <span style={{ fontWeight: 700, color: '#1E293B' }}>{item.name}</span>
                  <span style={{ color: '#94A3B8', fontSize: '0.76rem' }}>({item.cardUid})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#64748B', fontSize: '0.78rem' }}>{item.time}</span>
                  <span style={{ fontWeight: 700, color: 'var(--loyalty-navy)' }}>
                    {item.totalStamps} stamps
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Fulfill Card Request */}
      {selectedRequest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            maxWidth: '500px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            position: 'relative'
          }}>
            <button
              type="button"
              onClick={() => setSelectedRequest(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748B'
              }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
              Assign Physical Card
            </h3>
            <p style={{ fontSize: '0.84rem', color: '#64748B', margin: '0 0 18px', lineHeight: 1.5 }}>
              Fulfilling card request for <strong>{selectedRequest.profiles?.display_name}</strong> ({selectedRequest.profiles?.email}).
            </p>

            {/* Checklist */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.82rem',
              color: '#334155'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={16} color="#15803D" />
                <span>Collect <strong>₱120 cash/e-wallet</strong> from customer</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={16} color="#15803D" />
                <span>Dispense 1 complimentary <strong>Classic Coffee</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={16} color="#15803D" />
                <span>Take a fresh vinyl card and tap onto the USB reader below</span>
              </div>
            </div>

            {fulfillError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '10px 14px', borderRadius: '12px', fontSize: '0.82rem', marginBottom: '14px' }}>
                {fulfillError}
              </div>
            )}

            {fulfillMessage && (
              <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', color: '#15803D', padding: '10px 14px', borderRadius: '12px', fontSize: '0.84rem', fontWeight: 700, marginBottom: '14px' }}>
                {fulfillMessage}
              </div>
            )}

            <form onSubmit={handleFulfillCard} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Card UID (Tap card onto reader or type):
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={fulfillUidInput}
                  onChange={(e) => setFulfillUidInput(e.target.value)}
                  placeholder="e.g. 047BA23F8A1C80"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1.5px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={fulfilling || !fulfillUidInput.trim()}
                  style={{
                    flex: 1.5,
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#0F172A',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {fulfilling ? <Loader2 size={16} className="animate-spin" /> : <span>Confirm &amp; Link Card →</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
