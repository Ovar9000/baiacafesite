import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calculateLoyaltyStatus, formatManilaDateTime } from '../lib/loyaltyHelpers';
import AuthModal from '../components/AuthModal';
import RedemptionCountdown from '../components/RedemptionCountdown';
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
  Flame
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

  if (loading) {
    return (
      <div className="loyalty-app-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <img src="/images/Logo.webp" alt="Baia Cafe" style={{ width: '60px', height: '60px', borderRadius: '50%', marginBottom: '16px' }} />
          <p style={{ color: 'var(--loyalty-text-muted)', fontSize: '0.9rem' }}>Loading your Baia Loyalty Card...</p>
        </div>
      </div>
    );
  }

  const loyaltyStatus = calculateLoyaltyStatus(stamps.length, redemptions.length);

  return (
    <div className="loyalty-app-wrapper">
      {/* Top Header */}
      <header className="loyalty-header">
        <a href="/" className="loyalty-logo-lockup" title="Return to BAIA Cafe home">
          <img src="/images/Logo.webp" alt="BAIA Cafe Logo" className="loyalty-logo-img" />
          <div>
            <div className="loyalty-logo-title">BAIA CAFÉ</div>
            <div className="loyalty-logo-sub">SHORE CLUB LOYALTY</div>
          </div>
        </a>

        {user && (
          <button 
            onClick={handleSignOut} 
            style={{
              background: '#F1F5F9',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Sign Out"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        )}
      </header>

      {/* Main Loyalty Content */}
      <main className="loyalty-content">
        {!user ? (
          <div style={{ marginTop: '10px' }}>
            <AuthModal 
              onSuccess={(s) => {
                setSession(s);
                setUser(s.user);
              }}
            />

            <div className="loyalty-section-card" style={{ marginTop: '20px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', padding: '12px', background: '#FFFBEB', color: '#D97706', borderRadius: '50%', marginBottom: '10px' }}>
                <Gift size={24} />
              </div>
              <h4 style={{ color: 'var(--loyalty-navy)', marginBottom: '6px', fontFamily: 'Space Grotesk, sans-serif' }}>
                Collect Stamps. Sip Free Coffee.
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--loyalty-text-muted)', lineHeight: '1.4' }}>
                Order any qualifying specialty drink at Baia Café, scan the standee QR code at pickup, and unlock free artisan coffee every 10 stamps and custom tote bags every 20 stamps!
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Error banner if any */}
            {errorMsg && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                padding: '12px 14px',
                borderRadius: '12px',
                fontSize: '0.85rem'
              }}>
                {errorMsg}
              </div>
            )}

            {/* Active / Pending Reward Banner */}
            {loyaltyStatus.hasPendingReward && (
              <div className="reward-banner-card">
                <div className="reward-banner-header">
                  <div className="reward-icon-box">
                    {loyaltyStatus.nextRewardType === 'coffee' ? <Coffee size={24} /> : <ShoppingBag size={24} />}
                  </div>
                  <div className="reward-banner-texts">
                    <h4>{loyaltyStatus.nextRewardTitle} Ready!</h4>
                    <p>
                      {loyaltyStatus.pendingRewardsCount > 1 
                        ? `You have ${loyaltyStatus.pendingRewardsCount} rewards waiting to be redeemed.` 
                        : 'Milestone reward unlocked and ready to claim.'}
                    </p>
                  </div>
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

            {/* 2. Scan QR Quick Action */}
            <a 
              href="/claim" 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
                border: '1.5px solid #E2E8F0',
                padding: '14px 18px',
                borderRadius: '16px',
                textDecoration: 'none',
                color: 'var(--loyalty-navy)',
                boxShadow: 'var(--loyalty-shadow)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '10px', background: '#EFF6FF', color: '#1E4AFF', borderRadius: '12px' }}>
                  <QrCode size={22} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>At the Drink Pickup Bar?</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Scan daily standee to collect today’s stamp</div>
                </div>
              </div>
              <ChevronRight size={18} color="#94A3B8" />
            </a>

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {stamps.slice(0, 3).map((stamp) => (
                    <div 
                      key={stamp.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        borderBottom: '1px solid #F1F5F9',
                        fontSize: '0.78rem'
                      }}
                    >
                      <span style={{ color: '#334155' }}>+1 Drink Stamp</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{formatManilaDateTime(stamp.awarded_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Confirmation Modal Before Launching 2-Min Countdown */}
      {showRedeemConfirm && (
        <div className="countdown-overlay">
          <div className="countdown-modal" style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: '14px', background: '#FEF3C7', color: '#D97706', borderRadius: '50%', marginBottom: '14px' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#16255C', fontSize: '1.25rem', marginBottom: '8px' }}>
              Redeem at Register?
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.4', marginBottom: '20px' }}>
              Please only tap <strong>Confirm & Redeem</strong> when you are standing in front of the cashier or barista. 
              This will start a <strong>2-minute visual countdown badge</strong> to present on your screen.
            </p>

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
