import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '../lib/supabaseClient';
import { calculateLoyaltyStatus } from '../lib/loyaltyHelpers';
import AuthModal from '../components/AuthModal';
import RedemptionCountdown from '../components/RedemptionCountdown';
import QrScanner from '../components/QrScanner';
import { 
  Coffee, 
  Gift, 
  ShoppingBag, 
  Award, 
  CheckCircle2, 
  Sparkles, 
  LogOut, 
  ChevronRight, 
  QrCode, 
  ShieldCheck,
  Flame,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import '../styles/loyalty.css';

export default function CardApp() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stamps, setStamps] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [activeRedemption, setActiveRedemption] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  // In-app QR Scanner state
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scannerStatusMsg, setScannerStatusMsg] = useState('');
  const [scannerErrorMsg, setScannerErrorMsg] = useState('');

  // Fetch session on load
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

  // Fetch stamps & redemptions
  const loadLoyaltyData = useCallback(async () => {
    if (!user) return;
    try {
      setErrorMsg('');

      if (user.id === 'baia-demo-user-001') {
        const demoStamps = JSON.parse(localStorage.getItem('baia_demo_stamps') || '[]');
        const demoRedemptions = JSON.parse(localStorage.getItem('baia_demo_redemptions') || '[]');
        setStamps(demoStamps);
        setRedemptions(demoRedemptions);
        return;
      }

      // Fetch stamps
      const { data: stampsData, error: sErr } = await supabase
        .from('stamps')
        .select('*')
        .eq('user_id', user.id)
        .order('awarded_at', { ascending: false });

      if (sErr) throw sErr;
      setStamps(stampsData || []);

      // Fetch redemptions
      const { data: redemptionsData, error: rErr } = await supabase
        .from('redemptions')
        .select('*')
        .eq('user_id', user.id)
        .order('redeemed_at', { ascending: false });

      if (rErr) throw rErr;
      setRedemptions(redemptionsData || []);
    } catch (err) {
      console.error('Error fetching loyalty data:', err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadLoyaltyData();
    }
  }, [user, loadLoyaltyData]);

  const handleSignOut = async () => {
    localStorage.removeItem('baia_demo_session');
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStamps([]);
    setRedemptions([]);
  };

  const handleInAppScan = async (scannedToken) => {
    try {
      setScannerErrorMsg('');
      setScannerStatusMsg('Verifying QR token...');

      if (user?.id === 'baia-demo-user-001') {
        const demoStamps = JSON.parse(localStorage.getItem('baia_demo_stamps') || '[]');
        const todayStr = new Date().toDateString();
        const alreadyClaimedToday = demoStamps.some(
          (s) => new Date(s.awarded_at).toDateString() === todayStr
        );

        if (alreadyClaimedToday) {
          setScannerErrorMsg('You have already collected your coffee stamp for today! (1 stamp per day limit).');
          return;
        }

        setTimeout(() => {
          const newStamp = {
            id: Date.now(),
            user_id: 'baia-demo-user-001',
            awarded_at: new Date().toISOString(),
            distance_meters: 14,
            staff_note: 'In-App Live Scan'
          };
          demoStamps.unshift(newStamp);
          localStorage.setItem('baia_demo_stamps', JSON.stringify(demoStamps));

          try {
            confetti({
              particleCount: 100,
              spread: 80,
              origin: { y: 0.5 }
            });
          } catch (e) {}

          setScannerStatusMsg('🎉 Stamp successfully recorded!');
          setTimeout(() => {
            setShowScannerModal(false);
            setScannerStatusMsg('');
            loadLoyaltyData();
          }, 1200);
        }, 500);
        return;
      }

      if (!navigator.geolocation) {
        setScannerErrorMsg('Geolocation is not supported on this device.');
        return;
      }

      setScannerStatusMsg('Checking GPS location at Baia Café...');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const res = await fetch('/api/claim-stamp', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              token: scannedToken,
              lat: latitude,
              lng: longitude,
              accuracy: accuracy || 0
            })
          });

          const data = await res.json();
          if (!res.ok) {
            setScannerErrorMsg(data.error || 'Failed to claim stamp.');
            return;
          }

          try {
            confetti({
              particleCount: 100,
              spread: 80,
              origin: { y: 0.5 }
            });
          } catch (e) {}

          setScannerStatusMsg('🎉 Stamp successfully recorded!');
          setTimeout(() => {
            setShowScannerModal(false);
            setScannerStatusMsg('');
            loadLoyaltyData();
          }, 1200);
        },
        (geoErr) => {
          setScannerErrorMsg('GPS location required. Please allow location permissions.');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (err) {
      setScannerErrorMsg(err.message || 'Error processing scan.');
    }
  };

  const loyaltyStatus = calculateLoyaltyStatus(stamps, redemptions);

  // If user completed a cycle and has an unredeemed reward, show off the 10/10 filled gold card
  const isCompletedCard = loyaltyStatus.hasPendingReward;
  const displayProgress = isCompletedCard ? 10 : loyaltyStatus.currentCycleProgress;

  if (loading) {
    return (
      <div className="loyalty-app-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner-border" />
          <p style={{ color: 'var(--loyalty-text-muted)', marginTop: '16px', fontSize: '0.9rem' }}>
            Loading your Shore Club card...
          </p>
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
            <div className="loyalty-logo-sub">SHORE CLUB LOYALTY</div>
          </div>
        </a>

        {user && (
          <button onClick={handleSignOut} className="btn-loyalty-signout" title="Sign Out">
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="loyalty-content">
        {!user ? (
          <div>
            <AuthModal onSuccess={(s) => {
              setSession(s);
              setUser(s.user);
            }} />

            <div className="loyalty-section-card" style={{ marginTop: '20px', textAlign: 'center' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#FAF4EB',
                color: '#FB923C',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px'
              }}>
                <Gift size={24} />
              </div>
              <h4 style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--loyalty-navy)', marginBottom: '6px' }}>
                Collect Stamps. Sip Free Coffee.
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--loyalty-text-muted)', lineHeight: '1.5' }}>
                Order any qualifying specialty drink at Baia Café, scan the standee QR code at pickup, and unlock free artisan coffee every 10 stamps and custom tote bags every 20 stamps!
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* 1. Celebratory Milestone Reward Unlocked Info Tile */}
            {loyaltyStatus.hasPendingReward && (
              <div style={{
                background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                border: '2px solid #F59E0B',
                borderRadius: '20px',
                padding: '18px 20px',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                animation: 'pulse-glow 2.5s infinite'
              }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)'
                }}>
                  <Gift size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>
                    ★ Milestone Reward Ready
                  </div>
                  <h4 style={{ fontSize: '1.02rem', color: '#78350F', fontWeight: 800, margin: '0 0 3px', lineHeight: '1.2' }}>
                    {loyaltyStatus.nextRewardType === 'coffee' ? 'Free Specialty Coffee Unlocked! ☕' : 'Free BAIA Shoreline Tote Bag! 🛍️'}
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: '#92400E', margin: 0, lineHeight: '1.4' }}>
                    Show this completed digital card to your barista at the counter to claim your reward!
                  </p>
                </div>
              </div>
            )}

            {/* 2. Signature BAIA Ocean Blue Digital Card */}
            <div className={`digital-card ${isCompletedCard ? 'completed-cycle' : ''}`}>
              <div className="card-top-row">
                <div>
                  <div className="card-holder-name">
                    {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Shore Member'}
                  </div>
                  <div className="card-member-since">
                    {user.email}
                  </div>
                </div>
                <div className="card-tier-badge">
                  <Flame size={13} />
                  <span>Cycle {loyaltyStatus.milestoneNumber + 1}</span>
                </div>
              </div>

              {/* 10-Stamp Visual Grid */}
              <div className="stamp-grid-container">
                <div className="stamp-grid-title">
                  <span>{isCompletedCard ? '🎉 10/10 STAMPS COMPLETED!' : 'Current Stamp Cycle'}</span>
                  <span>{displayProgress} / 10 Stamps</span>
                </div>

                <div className="stamp-grid-slots">
                  {Array.from({ length: 10 }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const isFilled = slotNum <= displayProgress;
                    const isRewardSlot = slotNum === 10;
                    return (
                      <div 
                        key={idx} 
                        className={`stamp-slot ${isFilled ? (isCompletedCard ? 'filled full-gold' : 'filled') : 'empty'} ${isRewardSlot ? 'milestone-target' : ''}`}
                        title={isFilled ? `Stamp #${slotNum} earned` : `Stamp #${slotNum}`}
                      >
                        {isFilled ? (
                          <Coffee />
                        ) : isRewardSlot ? (
                          <Award size={18} style={{ color: '#F5A623' }} />
                        ) : (
                          <span>{slotNum}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress to Next Reward */}
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px', color: 'rgba(255, 255, 255, 0.9)' }}>
                  <span>
                    {isCompletedCard 
                      ? <strong style={{ color: '#FFE699' }}>Reward Ready at Counter!</strong>
                      : <>Next Reward: <strong>{loyaltyStatus.upcomingMilestoneType === 'coffee' ? 'Free Coffee ☕' : 'Free Tote Bag 🛍️'}</strong></>}
                  </span>
                  <span style={{ color: '#FFE699', fontWeight: 700 }}>
                    {isCompletedCard ? 'Completed' : `${loyaltyStatus.stampsUntilNextMilestone} drinks left`}
                  </span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      background: isCompletedCard ? 'linear-gradient(90deg, #F5A623, #FCD34D)' : 'linear-gradient(90deg, #FB923C, #F5A623)', 
                      width: isCompletedCard ? '100%' : `${(loyaltyStatus.currentCycleProgress / 10) * 100}%`,
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
              </div>

              <div className="card-stats-bottom" style={{ marginTop: '12px', paddingTop: '10px' }}>
                <span className="stat-lifetime-label">Lifetime Stamps:</span>
                <span className="stat-lifetime-value">{loyaltyStatus.totalStamps} ☕</span>
              </div>
            </div>

            {/* 3. In-App Camera Scan Trigger */}
            <button 
              type="button"
              onClick={() => {
                setScannerErrorMsg('');
                setScannerStatusMsg('');
                setShowScannerModal(true);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
                border: '1.5px solid #E2E8F0',
                padding: '14px 18px',
                borderRadius: '18px',
                color: 'var(--loyalty-navy)',
                boxShadow: 'var(--loyalty-shadow)',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '10px', background: '#EFF6FF', color: '#1E4AFF', borderRadius: '12px' }}>
                  <QrCode size={22} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>At the Drink Pickup Bar?</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Tap to scan daily counter standee</div>
                </div>
              </div>
              <ChevronRight size={18} color="#94A3B8" />
            </button>

            {/* 4. Featured Specialty Coffee Spotlight (Replaces Cluttered History List) */}
            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: 'var(--loyalty-shadow)'
            }}>
              <div style={{ position: 'relative', height: '140px', overflow: 'hidden' }}>
                <img 
                  src="/images/classiccafe.webp" 
                  alt="Featured BAIA Specialty Coffee" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: 'rgba(22, 37, 92, 0.85)',
                  backdropFilter: 'blur(6px)',
                  color: '#FFE699',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Sparkles size={12} />
                  <span>What's Brewing</span>
                </div>
              </div>

              <div style={{ padding: '16px' }}>
                <h4 style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--loyalty-navy)', fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
                  Signature Spanish Latte & Sea Salt Cold Brew
                </h4>
                <p style={{ fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4', marginBottom: '12px' }}>
                  Handcrafted with premium artisan beans on the Masbate shoreline. Every specialty handcrafted beverage earns 1 stamp!
                </p>
                <a 
                  href="/menu/"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#1E4AFF',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  <span>Explore Full Drink Menu</span>
                  <ChevronRight size={14} />
                </a>
              </div>
            </div>

            {/* 5. Bottom Footer Info */}
            <div style={{ textAlign: 'center', padding: '6px 0', fontSize: '0.75rem', color: '#94A3B8' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={14} />
                <span>Geofenced & verified at Baia Café, Masbate</span>
              </div>
            </div>

            {/* Dev Testing Simulation Controls */}
            {user?.id === 'baia-demo-user-001' && (
              <div style={{
                background: '#FEF3C7',
                border: '1px dashed #F59E0B',
                borderRadius: '16px',
                padding: '14px',
                textAlign: 'center',
                marginTop: '6px'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400E', marginBottom: '8px' }}>
                  🛠️ Dev Testing Simulation Controls
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const current = JSON.parse(localStorage.getItem('baia_demo_stamps') || '[]');
                      current.unshift({
                        id: Date.now(),
                        user_id: 'baia-demo-user-001',
                        awarded_at: new Date(Date.now() - (current.length + 1) * 86400000).toISOString(),
                        staff_note: `Drink #${current.length + 1}`
                      });
                      localStorage.setItem('baia_demo_stamps', JSON.stringify(current));
                      loadLoyaltyData();
                    }}
                    style={{
                      background: '#92400E',
                      color: '#FFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    +1 Stamp (Past Day)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const fake10 = Array.from({ length: 10 }).map((_, i) => ({
                        id: Date.now() + i,
                        user_id: 'baia-demo-user-001',
                        awarded_at: new Date(Date.now() - (10 - i) * 86400000).toISOString(),
                        staff_note: `Specialty Coffee #${i + 1}`
                      }));
                      localStorage.setItem('baia_demo_stamps', JSON.stringify(fake10));
                      loadLoyaltyData();
                    }}
                    style={{
                      background: '#D97706',
                      color: '#FFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Fill 10 Stamps (Free Coffee)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const fake20 = Array.from({ length: 20 }).map((_, i) => ({
                        id: Date.now() + i,
                        user_id: 'baia-demo-user-001',
                        awarded_at: new Date(Date.now() - (20 - i) * 86400000).toISOString(),
                        staff_note: `Specialty Drink #${i + 1}`
                      }));
                      localStorage.setItem('baia_demo_stamps', JSON.stringify(fake20));
                      loadLoyaltyData();
                    }}
                    style={{
                      background: '#B45309',
                      color: '#FFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Fill 20 Stamps (Free Tote)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Simulate Barista redeeming and starting next cycle
                      const currentRedemptions = JSON.parse(localStorage.getItem('baia_demo_redemptions') || '[]');
                      currentRedemptions.push({
                        id: Date.now(),
                        user_id: 'baia-demo-user-001',
                        redeemed_at: new Date().toISOString()
                      });
                      localStorage.setItem('baia_demo_redemptions', JSON.stringify(currentRedemptions));
                      loadLoyaltyData();
                    }}
                    style={{
                      background: '#16255C',
                      color: '#FFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Simulate Barista Redeem
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('baia_demo_stamps');
                      localStorage.removeItem('baia_demo_redemptions');
                      loadLoyaltyData();
                    }}
                    style={{
                      background: '#F1F5F9',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Reset Card
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* Live In-App Camera QR Scanner Modal */}
      {showScannerModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{ width: '100%', maxWidth: '380px' }}>
            <QrScanner
              onScan={handleInAppScan}
              onClose={() => setShowScannerModal(false)}
            />

            {scannerStatusMsg && (
              <div style={{
                marginTop: '12px',
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#15803D',
                borderRadius: '12px',
                padding: '10px',
                fontSize: '0.85rem',
                textAlign: 'center',
                fontWeight: 600
              }}>
                {scannerStatusMsg}
              </div>
            )}

            {scannerErrorMsg && (
              <div style={{
                marginTop: '12px',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                borderRadius: '12px',
                padding: '10px',
                fontSize: '0.85rem',
                textAlign: 'center'
              }}>
                {scannerErrorMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
