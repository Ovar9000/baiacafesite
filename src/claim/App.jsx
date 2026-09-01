import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import confetti from 'canvas-confetti';
import { 
  CheckCircle2, 
  AlertCircle, 
  MapPin, 
  Coffee, 
  Sparkles, 
  Loader2, 
  ArrowRight, 
  RefreshCw,
  Gift,
  QrCode,
  Camera,
  KeyRound
} from 'lucide-react';
import AuthModal from '../components/AuthModal';
import '../styles/loyalty.css';

export default function ClaimApp() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claimStatus, setClaimStatus] = useState('idle'); // 'idle' | 'locating' | 'claiming' | 'success' | 'error'
  const [statusMessage, setStatusMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState(null);
  const [claimResult, setClaimResult] = useState(null);
  const [qrToken, setQrToken] = useState('');
  const [manualInputToken, setManualInputToken] = useState('');

  // Extract token from URL or sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('t') || params.get('token');

    if (urlToken) {
      setQrToken(urlToken);
      sessionStorage.setItem('baia_pending_stamp_token', urlToken);
    } else {
      const savedToken = sessionStorage.getItem('baia_pending_stamp_token');
      if (savedToken) {
        setQrToken(savedToken);
      }
    }
  }, []);

  // Check auth session
  useEffect(() => {
    const savedDemo = localStorage.getItem('baia_demo_session');
    if (savedDemo) {
      try {
        const parsed = JSON.parse(savedDemo);
        setSession(parsed);
        setUser(parsed.user);
        setLoading(false);
      } catch (e) {}
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!localStorage.getItem('baia_demo_session')) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!localStorage.getItem('baia_demo_session')) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Main Claim function
  const executeClaim = useCallback(async (tokenToUse, currentSession) => {
    if (!tokenToUse) {
      setClaimStatus('error');
      setStatusMessage('No QR token provided. Please scan today’s QR standee at the pickup bar.');
      return;
    }

    if (!currentSession?.access_token) {
      setClaimStatus('error');
      setStatusMessage('Please sign in to collect your drink stamp.');
      return;
    }

    setClaimStatus('locating');
    setStatusMessage('Checking GPS location at Baia Café...');
    setErrorDetails(null);

    // Handle Demo Account local testing
    if (currentSession?.user?.id === 'baia-demo-user-001') {
      setTimeout(() => {
        const demoStamps = JSON.parse(localStorage.getItem('baia_demo_stamps') || '[]');
        const newStamp = {
          id: Date.now(),
          user_id: 'baia-demo-user-001',
          awarded_at: new Date().toISOString(),
          distance_meters: 12,
          staff_note: 'Demo QR Scan'
        };
        demoStamps.unshift(newStamp);
        localStorage.setItem('baia_demo_stamps', JSON.stringify(demoStamps));
        sessionStorage.removeItem('baia_pending_stamp_token');

        const total = demoStamps.length;
        const unlockedNow = (total % 10 === 0);
        setClaimResult({
          success: true,
          totalStamps: total,
          rewardUnlockedNow: unlockedNow
        });
        setClaimStatus('success');
        setStatusMessage(`Stamp #${total} recorded! Enjoy your beverage.`);

        try {
          confetti({
            particleCount: 100,
            spread: 80,
            origin: { y: 0.5 }
          });
        } catch (e) {}
      }, 1000);
      return;
    }

    if (!navigator.geolocation) {
      setClaimStatus('error');
      setStatusMessage('Geolocation is not supported by your browser. Please use Chrome, Safari, or your phone’s camera browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setClaimStatus('claiming');
        setStatusMessage('Verifying drink stamp with Baia server...');

        try {
          const res = await fetch('/api/claim-stamp', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({
              token: tokenToUse,
              lat: latitude,
              lng: longitude,
              accuracy: accuracy || 0
            })
          });

          const data = await res.json();

          if (!res.ok) {
            setClaimStatus('error');
            setStatusMessage(data.error || 'Failed to claim stamp.');
            setErrorDetails(data);
            return;
          }

          // Clear stored token
          sessionStorage.removeItem('baia_pending_stamp_token');

          setClaimResult(data);
          setClaimStatus('success');
          setStatusMessage(data.message || 'Stamp successfully added to your digital card!');

          // Fire celebratory confetti
          try {
            confetti({
              particleCount: 100,
              spread: 80,
              origin: { y: 0.5 }
            });
          } catch (e) {}

        } catch (err) {
          setClaimStatus('error');
          setStatusMessage(err.message || 'Network error occurred while claiming stamp.');
        }
      },
      (geoErr) => {
        console.error('Geolocation error:', geoErr);
        setClaimStatus('error');
        if (geoErr.code === 1) {
          setStatusMessage('Location permission was denied. Please allow GPS location in your phone browser settings to verify you are at Baia Café.');
        } else if (geoErr.code === 2) {
          setStatusMessage('Location unavailable. Please make sure your phone GPS is turned on.');
        } else if (geoErr.code === 3) {
          setStatusMessage('Location request timed out. Please try again.');
        } else {
          setStatusMessage('Could not determine your GPS location. Please try again.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  }, []);

  // Auto-trigger claim once authenticated and token is present
  useEffect(() => {
    if (!loading && user && qrToken && claimStatus === 'idle') {
      executeClaim(qrToken, session);
    }
  }, [loading, user, qrToken, claimStatus, session, executeClaim]);

  const handleManualClaimSubmit = (e) => {
    e.preventDefault();
    if (!manualInputToken.trim()) return;
    setQrToken(manualInputToken.trim());
    sessionStorage.setItem('baia_pending_stamp_token', manualInputToken.trim());
    executeClaim(manualInputToken.trim(), session);
  };

  if (loading) {
    return (
      <div className="loyalty-app-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Loader2 className="animate-spin" size={36} color="#1E4AFF" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--loyalty-text-muted)', fontSize: '0.9rem' }}>Loading claim verification...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="loyalty-app-wrapper">
      {/* Header */}
      <header className="loyalty-header">
        <a href="/" className="loyalty-logo-lockup">
          <img src="/images/Logo.webp" alt="BAIA Cafe Logo" className="loyalty-logo-img" />
          <div>
            <div className="loyalty-logo-title">BAIA CAFÉ</div>
            <div className="loyalty-logo-sub">DRINK STAMP CLAIM</div>
          </div>
        </a>
      </header>

      <main className="loyalty-content" style={{ justifyContent: 'center' }}>
        {!user ? (
          <div>
            <AuthModal 
              title="Claim Your Daily Coffee Stamp"
              subtitle="Sign in to record your stamp and earn free drinks & merchandise."
              onSuccess={(s) => {
                setSession(s);
                setUser(s.user);
                const token = qrToken || sessionStorage.getItem('baia_pending_stamp_token');
                if (token) {
                  executeClaim(token, s);
                }
              }}
            />
          </div>
        ) : (
          <div className="loyalty-section-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
            {/* Status: Idle without Token */}
            {claimStatus === 'idle' && !qrToken && (
              <div>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#EFF6FF',
                  color: '#1E4AFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '18px'
                }}>
                  <Camera size={32} />
                </div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--loyalty-navy)', marginBottom: '8px' }}>
                  Scan Daily Standee QR
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--loyalty-text-muted)', maxWidth: '320px', margin: '0 auto 20px', lineHeight: '1.4' }}>
                  Please open your <strong>Phone Camera</strong> app and scan the physical acrylic QR standee when the barista hands you your drink.
                </p>

                <div style={{ background: '#FAF4EB', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0', textAlign: 'left', marginBottom: '20px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--loyalty-navy)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <KeyRound size={16} color="#FB923C" />
                    <span>Dev & Testing Token Entry</span>
                  </div>
                  <form onSubmit={handleManualClaimSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Paste daily QR token here"
                      className="input-email"
                      value={manualInputToken}
                      onChange={(e) => setManualInputToken(e.target.value)}
                      style={{ fontSize: '0.82rem' }}
                    />
                    <button type="submit" className="btn-submit-otp" style={{ padding: '10px' }}>
                      Verify & Claim Stamp →
                    </button>
                  </form>
                </div>

                <a
                  href="/card/"
                  style={{
                    background: '#F1F5F9',
                    color: '#475569',
                    textDecoration: 'none',
                    padding: '12px 20px',
                    borderRadius: '9999px',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    display: 'inline-block'
                  }}
                >
                  Return to Digital Card
                </a>
              </div>
            )}

            {/* Status: Locating / Claiming */}
            {(claimStatus === 'locating' || claimStatus === 'claiming') && (
              <div>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#EFF6FF',
                  color: '#1E4AFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '18px'
                }}>
                  <Loader2 className="animate-spin" size={32} />
                </div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--loyalty-navy)', marginBottom: '8px' }}>
                  {claimStatus === 'locating' ? 'Verifying Physical Location' : 'Claiming Drink Stamp'}
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--loyalty-text-muted)', maxWidth: '300px', margin: '0 auto' }}>
                  {statusMessage}
                </p>
              </div>
            )}

            {/* Status: Success */}
            {claimStatus === 'success' && (
              <div>
                <div style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  background: '#DCFCE7',
                  color: '#16A34A',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  boxShadow: '0 8px 20px rgba(22, 163, 74, 0.2)'
                }}>
                  <CheckCircle2 size={42} />
                </div>

                <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--loyalty-navy)', fontSize: '1.45rem', marginBottom: '8px' }}>
                  Stamp Collected! ☕
                </h2>

                <p style={{ fontSize: '0.92rem', color: '#475569', marginBottom: '20px', lineHeight: '1.4' }}>
                  {statusMessage}
                </p>

                {claimResult?.rewardUnlockedNow && (
                  <div style={{
                    background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                    border: '2px solid #FCD34D',
                    borderRadius: '16px',
                    padding: '16px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left'
                  }}>
                    <div style={{ padding: '10px', background: '#F59E0B', color: '#FFF', borderRadius: '12px' }}>
                      <Gift size={24} />
                    </div>
                    <div>
                      <h4 style={{ color: '#78350F', fontSize: '0.95rem' }}>Milestone Reward Unlocked!</h4>
                      <p style={{ color: '#92400E', fontSize: '0.8rem' }}>
                        You now have a reward ready to redeem at the counter!
                      </p>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <a
                    href="/card/"
                    style={{
                      background: 'var(--loyalty-navy)',
                      color: '#FFFFFF',
                      textDecoration: 'none',
                      padding: '14px',
                      borderRadius: '9999px',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>View Digital Loyalty Card</span>
                    <ArrowRight size={18} />
                  </a>

                  <a
                    href="/"
                    style={{
                      background: '#F1F5F9',
                      color: '#475569',
                      textDecoration: 'none',
                      padding: '12px',
                      borderRadius: '9999px',
                      fontWeight: 600,
                      fontSize: '0.88rem'
                    }}
                  >
                    Back to Baia Café Home
                  </a>
                </div>
              </div>
            )}

            {/* Status: Error */}
            {claimStatus === 'error' && (
              <div>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <AlertCircle size={36} />
                </div>

                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#B91C1C', fontSize: '1.25rem', marginBottom: '8px' }}>
                  Could Not Award Stamp
                </h3>

                <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '24px', lineHeight: '1.5' }}>
                  {statusMessage}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    onClick={() => executeClaim(qrToken, session)}
                    style={{
                      background: 'var(--loyalty-navy)',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '9999px',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <RefreshCw size={16} />
                    <span>Try Location Check Again</span>
                  </button>

                  <a
                    href="/card/"
                    style={{
                      background: '#F1F5F9',
                      color: '#475569',
                      textDecoration: 'none',
                      padding: '12px',
                      borderRadius: '9999px',
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      display: 'inline-block'
                    }}
                  >
                    Go to Digital Card
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
