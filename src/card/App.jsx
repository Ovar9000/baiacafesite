import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '../lib/supabaseClient';
import { calculateLoyaltyStatus, formatManilaDateTime } from '../lib/loyaltyHelpers';
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
  History, 
  ShieldCheck,
  AlertTriangle,
  Flame,
  AlertCircle,
  Loader2
} from 'lucide-react';
import '../styles/loyalty.css';

export default function CardApp() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stamps, setStamps] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [showRedeemConfirm, setShowRedeemConfirm] = useState(false);
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

  const handleExecuteRedeem = async () => {
    if (!session?.access_token) return;
    try {
      setRedeemLoading(true);
      setErrorMsg('');

      if (user?.id === 'baia-demo-user-001') {
        const currentRedemptions = JSON.parse(localStorage.getItem('baia_demo_redemptions') || '[]');
        const nextMilestone = currentRedemptions.length + 1;
        const rewardType = (nextMilestone % 2 !== 0) ? 'coffee' : 'totebag';
        const newRedemption = {
          id: Math.floor(1000 + Math.random() * 9000),
          reward_type: rewardType,
          milestone_number: nextMilestone,
          redeemed_at: new Date().toISOString()
        };
        currentRedemptions.unshift(newRedemption);
        localStorage.setItem('baia_demo_redemptions', JSON.stringify(currentRedemptions));

        setShowRedeemConfirm(false);
        setActiveRedemption({
          redemptionId: newRedemption.id,
          rewardType: newRedemption.reward_type,
          milestoneNumber: newRedemption.milestone_number,
          redeemedAt: newRedemption.redeemed_at,
          rewardTitle: rewardType === 'coffee' ? 'Free Specialty Coffee' : 'Free Baia Tote Bag'
        });
        loadLoyaltyData();
        return;
      }

      const response = await fetch('/api/redeem-reward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to redeem reward.');
      }

      setShowRedeemConfirm(false);
      setActiveRedemption({
        redemptionId: data.redemptionId,
        rewardType: data.rewardType,
        milestoneNumber: data.milestoneNumber,
        redeemedAt: data.redeemedAt,
        rewardTitle: data.rewardTitle
      });

      // Refresh loyalty records
      loadLoyaltyData();
    } catch (err) {
      setErrorMsg(err.message || 'Error processing redemption.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleInAppScan = async (scannedToken) => {
    try {
      setScannerErrorMsg('');
      setScannerStatusMsg('Verifying QR token...');

      if (user?.id === 'baia-demo-user-001') {
        setTimeout(() => {
          const demoStamps = JSON.parse(localStorage.getItem('baia_demo_stamps') || '[]');
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
            <LogOut size={16} />
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Active Reward Available Banner */}
            {loyaltyStatus.availableReward && (
              <div className="reward-banner">
                <div className="reward-banner-badge">
                  <Gift size={22} />
                </div>
                <div className="reward-banner-content">
                  <h4>
                    {loyaltyStatus.availableReward === 'coffee' 
                      ? 'Free Handcrafted Coffee Ready!' 
                      : 'Free Baia Tote Bag Ready!'}
                  </h4>
                  <p>Present to your barista at the counter to redeem.</p>
                </div>
                <button 
                  className="btn-redeem-trigger"
                  onClick={() => setShowRedeemConfirm(true)}
                >
                  <Sparkles size={18} />
                  <span>Redeem at Register →</span>
                </button>
              </div>
            )}

            {/* 1. Digital Loyalty Card */}
            <div className="digital-card">
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
                  <Flame size={14} />
                  <span>Cycle {loyaltyStatus.milestoneNumber + 1}</span>
                </div>
              </div>

              {/* 10-Stamp Visual Grid */}
              <div className="stamp-grid-container">
                <div className="stamp-grid-title">
                  <span>Current Stamp Cycle</span>
                  <span>{loyaltyStatus.currentCycleProgress} / 10 Stamps</span>
                </div>

                <div className="stamp-grid-slots">
                  {Array.from({ length: 10 }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const isFilled = slotNum <= loyaltyStatus.currentCycleProgress;
                    const isRewardSlot = slotNum === 10;
                    return (
                      <div 
                        key={idx} 
                        className={`stamp-slot ${isFilled ? 'filled' : 'empty'} ${isRewardSlot ? 'milestone-target' : ''}`}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px', color: 'rgba(255, 255, 255, 0.85)' }}>
                  <span>Next Reward: <strong>{loyaltyStatus.upcomingMilestoneType === 'coffee' ? 'Free Coffee ☕' : 'Free Tote Bag 🛍️'}</strong></span>
                  <span style={{ color: '#FFE699', fontWeight: 700 }}>{loyaltyStatus.stampsUntilNextMilestone} drinks left</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      background: 'linear-gradient(90deg, #FB923C, #F5A623)', 
                      width: `${(loyaltyStatus.currentCycleProgress / 10) * 100}%`,
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

            {/* 2. In-App Camera Scan Trigger */}
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
                borderRadius: '16px',
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

            {/* 3. Compact Reward Guide & Activity History */}
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.78rem', color: '#64748B' }}>
              <p style={{ marginBottom: '4px' }}>
                ✨ <strong>10 Stamps</strong> = Free Coffee &bull; <strong>20 Stamps</strong> = Free Tote Bag
              </p>
              <p style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                1 stamp per qualifying drink &bull; Max 1 stamp per day
              </p>
            </div>

            {stamps.length > 0 && (
              <div className="loyalty-section-card" style={{ padding: '14px 16px' }}>
                <div className="section-card-title" style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                  <History size={16} color="#1E4AFF" />
                  <span>Recent Stamp Activity ({stamps.length})</span>
                </div>

                <div className="stamp-history-list">
                  {stamps.slice(0, 5).map((stamp, idx) => (
                    <div key={stamp.id || idx} className="stamp-history-item">
                      <div className="history-item-left">
                        <div className="history-icon-circle">
                          <Coffee size={14} />
                        </div>
                        <div>
                          <div className="history-item-title">
                            {stamp.staff_note || 'Qualifying Beverage Stamp'}
                          </div>
                          <div className="history-item-date">
                            {formatManilaDateTime(stamp.awarded_at)}
                          </div>
                        </div>
                      </div>
                      <span className="history-item-badge">+1 Stamp</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Footer Info */}
            <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '0.75rem', color: '#94A3B8' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={14} />
                <span>Geofenced & verified at Baia Café, Masbate</span>
              </div>
            </div>

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

      {/* Redemption Confirmation Warning Modal */}
      {showRedeemConfirm && (
        <div className="redeem-modal-overlay">
          <div className="redeem-modal-card">
            <div className="modal-warning-icon">
              <AlertTriangle size={28} />
            </div>

            <h3>Are you in front of the barista?</h3>
            <p>
              Once confirmed, a <strong>2-minute animated timer</strong> will begin. The barista must witness and tap the active screen to serve your reward.
            </p>

            <div className="modal-warning-box">
              ⚠️ Do not activate until you are ordering at the counter!
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={handleExecuteRedeem}
                disabled={redeemLoading}
                style={{
                  background: '#16255C',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '13px',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer'
                }}
              >
                {redeemLoading ? 'Starting Timer...' : 'Confirm & Redeem Now →'}
              </button>

              <button 
                onClick={() => setShowRedeemConfirm(false)}
                disabled={redeemLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '6px'
                }}
              >
                Cancel / Not at Counter Yet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2-Minute Animated Redemption Screen */}
      {activeRedemption && (
        <RedemptionCountdown 
          redemptionData={activeRedemption}
          user={user}
          onClose={() => setActiveRedemption(null)}
        />
      )}
    </div>
  );
}
