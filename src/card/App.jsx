import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '../lib/supabaseClient';
import { calculateLoyaltyStatus, formatManilaDateTime } from '../lib/loyaltyHelpers';
import AuthModal from '../components/AuthModal';
import QrScanner from '../components/QrScanner';
import RedemptionCountdown from '../components/RedemptionCountdown';
import { 
  Coffee, 
  Gift, 
  Award, 
  Sparkles, 
  LogOut, 
  ChevronRight, 
  QrCode, 
  ShieldCheck, 
  Trophy, 
  X, 
  Calendar,
  Wifi,
  Copy,
  Check
} from 'lucide-react';
import '../styles/loyalty.css';

export default function CardApp() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stamps, setStamps] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  
  // Reward redemption state
  const [activeRedemption, setActiveRedemption] = useState(null);
  const [redeeming, setRedeeming] = useState(false);
  const [showRedeemConfirm, setShowRedeemConfirm] = useState(false);

  // In-app QR Scanner state
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scannerStatusMsg, setScannerStatusMsg] = useState('');
  const [scannerErrorMsg, setScannerErrorMsg] = useState('');
  const isClaimingRef = useRef(false);

  // Stamp Card Collection Showcase Archive Modal
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  // Active Wi-Fi Voucher state
  const [todayVoucher, setTodayVoucher] = useState(null);
  const [copiedVoucher, setCopiedVoucher] = useState(false);

  // Fetch Supabase session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch user stamps & redemptions from Supabase
  const loadLoyaltyData = useCallback(async () => {
    if (!user) return;
    try {
      setErrorMsg('');

      // Fetch real stamps
      const { data: stampsData, error: sErr } = await supabase
        .from('stamps')
        .select('*')
        .eq('user_id', user.id)
        .order('awarded_at', { ascending: false });

      if (sErr) throw sErr;
      setStamps(stampsData || []);

      // Fetch real redemptions
      const { data: redemptionsData, error: rErr } = await supabase
        .from('redemptions')
        .select('*')
        .eq('user_id', user.id)
        .order('redeemed_at', { ascending: false });

      if (rErr) throw rErr;
      setRedemptions(redemptionsData || []);

      // Fetch today's active Wi-Fi voucher
      try {
        const todayManila = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());

        const startOfDay = new Date(`${todayManila}T00:00:00+08:00`).toISOString();
        const endOfDay = new Date(`${todayManila}T23:59:59.999+08:00`).toISOString();

        const { data: voucherRows } = await supabase
          .from('wifi_vouchers')
          .select('code, duration_hours, device_limit, claimed_at')
          .eq('claimed_by', user.id)
          .gte('claimed_at', startOfDay)
          .lte('claimed_at', endOfDay)
          .order('claimed_at', { ascending: false })
          .limit(1);

        if (voucherRows && voucherRows.length > 0) {
          setTodayVoucher(voucherRows[0]);
        } else {
          const cached = sessionStorage.getItem('baia_today_wifi_voucher');
          if (cached) {
            try { setTodayVoucher(JSON.parse(cached)); } catch (e) {}
          } else {
            setTodayVoucher(null);
          }
        }
      } catch (vErr) {
        const cached = sessionStorage.getItem('baia_today_wifi_voucher');
        if (cached) {
          try { setTodayVoucher(JSON.parse(cached)); } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Error loading loyalty data:', err);
      setErrorMsg('Could not refresh card stamps.');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadLoyaltyData();
    }
  }, [user, loadLoyaltyData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStamps([]);
    setRedemptions([]);
    setTodayVoucher(null);
    sessionStorage.removeItem('baia_today_wifi_voucher');
  };

  const handleRedeemReward = async () => {
    if (redeeming) return;
    if (!session?.access_token) {
      setErrorMsg('Please sign in to redeem your reward.');
      return;
    }
    try {
      setRedeeming(true);
      setErrorMsg('');
      const res = await fetch('/api/redeem-reward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to redeem reward.');
      }
      setShowRedeemConfirm(false);
      setActiveRedemption(data);
      await loadLoyaltyData();
    } catch (err) {
      console.error('Redeem error:', err);
      setErrorMsg(err.message || 'Error processing reward redemption.');
    } finally {
      setRedeeming(false);
    }
  };

  const handleInAppScan = async (scannedToken) => {
    if (isClaimingRef.current) return;
    isClaimingRef.current = true;

    // Immediately close camera modal smoothly
    setShowScannerModal(false);
    setScannerErrorMsg('');
    setScannerStatusMsg('');
    setToastMsg('Verifying QR code & adding your stamp...');

    try {
      if (!session?.access_token) {
        setErrorMsg('Please sign in to collect your stamp.');
        setToastMsg('');
        isClaimingRef.current = false;
        return;
      }

      const res = await fetch('/api/claim-stamp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          token: scannedToken
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to claim stamp.');
        setToastMsg('');
        isClaimingRef.current = false;
        return;
      }

      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.5 }
        });
      } catch (e) {}

      setToastMsg(data.message || 'Stamp successfully added to your card.');
      if (data.wifiVoucher) {
        setTodayVoucher(data.wifiVoucher);
        try {
          sessionStorage.setItem('baia_today_wifi_voucher', JSON.stringify(data.wifiVoucher));
        } catch (e) {}
      }
      await loadLoyaltyData();

      setTimeout(() => {
        setToastMsg('');
        isClaimingRef.current = false;
      }, 3500);
    } catch (err) {
      setErrorMsg(err.message || 'Error processing scan.');
      setToastMsg('');
      isClaimingRef.current = false;
    }
  };

  const loyaltyStatus = calculateLoyaltyStatus(stamps, redemptions);

  // A card is in completed 10/10 state ONLY when totalStamps is a multiple of 10 (>0) AND there is an unredeemed reward
  const isCompletedCard = loyaltyStatus.totalStamps > 0 && (loyaltyStatus.totalStamps % 10 === 0) && loyaltyStatus.hasPendingReward;

  // Active cycle progress: 10 if completed, else totalStamps % 10 (e.g. 1 to 9, or 0)
  const displayProgress = isCompletedCard ? 10 : (loyaltyStatus.totalStamps % 10);

  // Active cycle number
  const activeCycleNumber = isCompletedCard
    ? Math.floor(loyaltyStatus.totalStamps / 10)
    : Math.floor(loyaltyStatus.totalStamps / 10) + 1;

  // Group historical stamps into completed cycle cards
  const numCompletedCycles = Math.floor(stamps.length / 10);
  const sortedAscStamps = [...stamps].sort((a, b) => new Date(a.awarded_at) - new Date(b.awarded_at));

  const completedCycleCards = [];
  for (let c = 1; c <= numCompletedCycles; c++) {
    const cycle10Stamps = sortedAscStamps.slice((c - 1) * 10, c * 10);
    const finishDate = cycle10Stamps[9]?.awarded_at;

    completedCycleCards.push({
      cycleNumber: c,
      finishDate: finishDate ? formatManilaDateTime(finishDate) : 'Completed',
      rewardTitle: 'Free Specialty Coffee',
      stamps: cycle10Stamps
    });
  }

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
                Order any qualifying specialty handcrafted beverage at Baia Café, scan the standee QR code at pickup, and unlock a complimentary artisan coffee every 10 stamps!
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Live Scan Floating Toast / Status */}
            {toastMsg && (
              <div style={{
                background: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                color: '#15803D',
                borderRadius: '16px',
                padding: '14px 18px',
                fontSize: '0.88rem',
                fontWeight: 700,
                textAlign: 'center',
                boxShadow: '0 4px 14px rgba(21, 128, 61, 0.12)',
                animation: 'pulse-glow 2s infinite'
              }}>
                {toastMsg}
              </div>
            )}

            {/* Error Message Alert */}
            {errorMsg && (
              <div style={{
                background: '#FEF2F2',
                border: '1.5px solid #FCA5A5',
                color: '#B91C1C',
                borderRadius: '16px',
                padding: '14px 18px',
                fontSize: '0.88rem',
                fontWeight: 600,
                textAlign: 'center',
                boxShadow: '0 4px 14px rgba(185, 28, 28, 0.08)'
              }}>
                {errorMsg}
              </div>
            )}
            
            {/* 1. Milestone Reward Unlocked Info Tile */}
            {loyaltyStatus.hasPendingReward && (
              <div style={{
                background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                border: '2px solid #F59E0B',
                borderRadius: '20px',
                padding: '18px 20px',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                animation: 'pulse-glow 2.5s infinite'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
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
                      Milestone Reward Ready
                    </div>
                    <h4 style={{ fontSize: '1.02rem', color: '#78350F', fontWeight: 800, margin: '0 0 3px', lineHeight: '1.2' }}>
                      Free Specialty Coffee Unlocked
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: '#92400E', margin: 0, lineHeight: '1.4' }}>
                      Ready to order? Activate your reward at the counter with your barista to redeem.
                    </p>
                  </div>
                </div>

                {!showRedeemConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowRedeemConfirm(true)}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '12px 18px',
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(180, 83, 9, 0.25)'
                    }}
                  >
                    <Sparkles size={16} />
                    <span>Redeem Free Coffee with Barista →</span>
                  </button>
                ) : (
                  <div style={{
                    background: '#FFFFFF',
                    border: '1.5px solid #F59E0B',
                    borderRadius: '14px',
                    padding: '14px',
                    textAlign: 'center'
                  }}>
                    <p style={{ fontSize: '0.82rem', color: '#78350F', fontWeight: 600, margin: '0 0 10px' }}>
                      Are you currently at the BAIA drink counter placing your order?
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setShowRedeemConfirm(false)}
                        disabled={redeeming}
                        style={{
                          flex: 1,
                          background: '#F1F5F9',
                          color: '#475569',
                          border: 'none',
                          padding: '10px',
                          borderRadius: '10px',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRedeemReward}
                        disabled={redeeming}
                        style={{
                          flex: 1.5,
                          background: '#16255C',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '10px',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        {redeeming ? 'Redeeming...' : 'Yes, Activate Now →'}
                      </button>
                    </div>
                  </div>
                )}
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
                
                {/* Interactive Cycle Badge (Clean minimal typography, taps to reveal completed stamp cards) */}
                <button
                  type="button"
                  onClick={() => setShowArchiveModal(true)}
                  className="card-tier-badge"
                  style={{
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.18)',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                    color: '#FFE699',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '5px 14px',
                    borderRadius: '9999px',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    letterSpacing: '0.3px'
                  }}
                  title="View Completed Card Collection"
                >
                  <span>Cycle {activeCycleNumber}</span>
                </button>
              </div>

              {/* 10-Stamp Visual Grid */}
              <div className="stamp-grid-container">
                <div className="stamp-grid-title">
                  <span>{isCompletedCard ? '10/10 Stamps Completed' : 'Current Stamp Cycle'}</span>
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
                      ? <strong style={{ color: '#FFE699' }}>Reward Ready at Counter</strong>
                      : <>Next Reward: <strong>Free Specialty Coffee</strong></>}
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
            </div>

            {/* Active Beach Wi-Fi Voucher Tile (View again anytime today) */}
            {todayVoucher ? (
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid #BFDBFE',
                borderRadius: '20px',
                padding: '16px 18px',
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Wifi size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Active Today
                      </div>
                      <h4 style={{ fontSize: '0.96rem', color: 'var(--loyalty-navy)', fontWeight: 700, margin: 0 }}>
                        Beach Wi-Fi Voucher
                      </h4>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    color: '#16A34A',
                    background: '#DCFCE7',
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    fontWeight: 700
                  }}>
                    Unlocked
                  </span>
                </div>

                <div style={{
                  background: '#F8FAFC',
                  border: '1px dashed #93C5FD',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 700, letterSpacing: '0.5px' }}>HOTSPOT CODE</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1E3A8A', letterSpacing: '2.5px', fontFamily: 'monospace' }}>
                      {todayVoucher.code}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(todayVoucher.code);
                        setCopiedVoucher(true);
                        setTimeout(() => setCopiedVoucher(false), 2200);
                      }
                    }}
                    style={{
                      background: copiedVoucher ? '#16A34A' : 'var(--loyalty-navy)',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {copiedVoucher ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedVoucher ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <p style={{ fontSize: '0.76rem', color: '#64748B', margin: 0, lineHeight: '1.4' }}>
                  Valid for up to <strong>2 devices</strong> (phone + laptop) • 1 hour duration. Connect to <em>"BAIA Cafe Free Wi-Fi"</em> and enter this code.
                </p>
              </div>
            ) : null}

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

            {/* 4. Featured Specialty Coffee Spotlight */}
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
                  Handcrafted with premium artisan beans on the Masbate shoreline. Every specialty handcrafted beverage earns 1 stamp.
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

          </div>
        )}
      </main>

      {/* Stamp Card Collection Showcase Archive Modal */}
      {showArchiveModal && (
        <div className="archive-modal-overlay">
          <div className="archive-modal-card">
            <div className="archive-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', background: '#FEF3C7', color: '#D97706', borderRadius: '12px' }}>
                  <Trophy size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--loyalty-navy)', fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif' }}>
                    Shore Club Collection
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
                    Your completed coffee journeys with BAIA
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="archive-modal-body">
              {/* Summary Ribbon */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-around',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--loyalty-navy)', fontFamily: 'Space Grotesk, sans-serif' }}>
                    Cycle {activeCycleNumber}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Active Journey</div>
                </div>
                <div style={{ width: '1px', background: '#E2E8F0' }} />
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {numCompletedCycles}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Completed Cards</div>
                </div>
              </div>

              {/* Completed Cards List */}
              {completedCycleCards.length > 0 ? (
                completedCycleCards.map((card) => (
                  <div key={card.cycleNumber} className="archive-item-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Award size={16} color="#F5A623" />
                        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFE699', letterSpacing: '0.5px' }}>
                          CYCLE #{card.cycleNumber} COMPLETED
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.75)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        <span>{card.finishDate}</span>
                      </span>
                    </div>

                    {/* Mini 10 Golden Cups Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px', marginBottom: '12px' }}>
                      {Array.from({ length: 10 }).map((_, idx) => (
                        <div
                          key={idx}
                          style={{
                            aspectRatio: 1,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #F5A623 0%, #D97706 100%)',
                            color: '#FFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #FFE699'
                          }}
                        >
                          <Coffee size={9} />
                        </div>
                      ))}
                    </div>

                    {/* Reward Badge */}
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.18)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                        Reward Unlocked:
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFE699' }}>
                        {card.rewardTitle}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 16px', background: '#FFFFFF', borderRadius: '18px', border: '1px dashed #CBD5E1' }}>
                  <Coffee size={32} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
                  <h4 style={{ color: 'var(--loyalty-navy)', fontSize: '0.95rem', marginBottom: '4px' }}>
                    First Card In Progress
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', maxWidth: '260px', margin: '0 auto' }}>
                    Collect 10 stamps on your active card to add your first completed card to this showcase archive.
                  </p>
                </div>
              )}

              {/* Current Active Cycle Preview */}
              <div className="archive-item-card current">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#CBD5E1' }}>
                    CURRENT CYCLE #{activeCycleNumber}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#FB923C', fontWeight: 700 }}>
                    {isCompletedCard ? '10/10 Ready to Redeem' : `${displayProgress}/10 Stamps`}
                  </span>
                </div>
                <div style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#FB923C', width: `${(displayProgress / 10) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Live Animated Barista Redemption Countdown */}
      {activeRedemption && (
        <RedemptionCountdown
          redemptionData={activeRedemption}
          user={user}
          onClose={() => {
            setActiveRedemption(null);
            loadLoyaltyData();
          }}
        />
      )}
    </div>
  );
}
