import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom';
import { supabase, IS_AUTH_CALLBACK } from '../lib/supabaseClient';
import { calculateLoyaltyStatus, formatManilaDateTime, isBonusStamp, sortStampsAsc } from '../lib/loyaltyHelpers';
import AuthModal from '../components/AuthModal';
import LegalModal from '../components/LegalModal';
import { 
  Coffee, 
  Gift,  
  LogOut, 
  ChevronRight, 
  QrCode, 
  ShieldCheck, 
  Trophy, 
  X, 
  Calendar,
  Wifi,
  Copy,
  Check,
  HelpCircle,
  Trash2,
  Sparkles
} from 'lucide-react';
import '../styles/loyalty.css';
import '../styles/card.css';

// Loaded only when needed, so opening the card stays light: the camera
// scanner (the QR library is most of the page's weight) and the redemption
// screen. The scanner is fetched in the background once the card is up.
const loadQrScanner = () => import('../components/QrScanner');
const QrScanner = lazy(loadQrScanner);
const RedemptionCountdown = lazy(() => import('../components/RedemptionCountdown'));

// The last stamps this device saw, shown instantly while fresh ones load.
// Display only: every stamp and reward is checked again by the server.
const CARD_CACHE_KEY = 'baia_card_cache_v1';
const WIFI_CACHE_KEY = 'baia_today_wifi_voucher';
const MANILA_DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function readStoredSession() {
  try {
    const raw = localStorage.getItem(supabase.auth.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id && parsed?.access_token ? parsed : null;
  } catch {
    return null;
  }
}

function readTodayVoucherCache() {
  try {
    const raw = sessionStorage.getItem(WIFI_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached && cached.date === MANILA_DAY_FMT.format(new Date())) return cached;
    sessionStorage.removeItem(WIFI_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
  return null;
}

function readCardCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(CARD_CACHE_KEY) || 'null');
    return cached && cached.userId === userId ? cached : null;
  } catch {
    return null;
  }
}

function writeCardCache(userId, stamps, redemptions) {
  try {
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify({ userId, stamps, redemptions }));
  } catch {
    // storage full or blocked: the card still works, just without the head start
  }
}

function clearCardCache() {
  try {
    localStorage.removeItem(CARD_CACHE_KEY);
  } catch {
    // nothing to clear
  }
}

export default function CardApp() {
  const [initialBoot] = useState(() => {
    const authCallback = IS_AUTH_CALLBACK;
    const storedSession = readStoredSession();
    const storedUser = storedSession?.user ?? null;
    const cachedCard = storedUser ? readCardCache(storedUser.id) : null;
    return {
      authCallback,
      session: storedSession,
      user: storedUser,
      stamps: cachedCard?.stamps || [],
      redemptions: cachedCard?.redemptions || [],
      dataReady: Boolean(cachedCard),
      todayVoucher: storedUser ? readTodayVoucherCache() : null
    };
  });

  const [user, setUser] = useState(initialBoot.user);
  const [session, setSession] = useState(initialBoot.session);
  // Only wait on auth while an OAuth / magic-link callback is exchanging its token
  const [loading, setLoading] = useState(initialBoot.authCallback && !initialBoot.user);
  const [stamps, setStamps] = useState(initialBoot.stamps);
  const [redemptions, setRedemptions] = useState(initialBoot.redemptions);
  // True once this user's stamps are known (from the cache or the server)
  const [dataReady, setDataReady] = useState(initialBoot.dataReady);
  const bootedCacheUserRef = useRef(initialBoot.dataReady ? initialBoot.user?.id : null);
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
  const [todayVoucher, setTodayVoucher] = useState(initialBoot.todayVoucher);
  const [copiedVoucher, setCopiedVoucher] = useState(false);

  // Tutorial & Account Deletion Modals
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [cardLegalType, setCardLegalType] = useState(null);

  // Sync Supabase session (handles PKCE callback exchange, refreshes, and sign-outs)
  useEffect(() => {
    let active = true;
    const applySession = (nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      if (!nextSession) {
        setStamps([]);
        setRedemptions([]);
        setTodayVoucher(null);
        setDataReady(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => applySession(s));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch the user's stamps, redemptions and today's Wi-Fi code, all at once
  const userId = user?.id;
  const loadLoyaltyData = useCallback(async () => {
    if (!userId) return;
    try {
      setErrorMsg('');

      const todayManila = MANILA_DAY_FMT.format(new Date());
      const startOfDay = new Date(`${todayManila}T00:00:00+08:00`).toISOString();
      const endOfDay = new Date(`${todayManila}T23:59:59.999+08:00`).toISOString();

      // One round trip instead of three: the queries don't depend on each other
      const [stampsRes, redemptionsRes, voucherRes] = await Promise.all([
        supabase
          .from('stamps')
          .select('id, awarded_at, kind')
          .eq('user_id', userId)
          .order('awarded_at', { ascending: false }),
        supabase
          .from('redemptions')
          .select('id, redeemed_at')
          .eq('user_id', userId)
          .order('redeemed_at', { ascending: false }),
        supabase
          .from('wifi_vouchers')
          .select('code, duration_hours, device_limit, claimed_at')
          .eq('claimed_by', userId)
          .gte('claimed_at', startOfDay)
          .lte('claimed_at', endOfDay)
          .order('claimed_at', { ascending: false })
          .limit(1)
          .then((res) => res, () => ({ data: null }))
      ]);

      if (stampsRes.error) throw stampsRes.error;
      if (redemptionsRes.error) throw redemptionsRes.error;
      const stampsData = stampsRes.data || [];
      const redemptionsData = redemptionsRes.data || [];
      setStamps(stampsData);
      setRedemptions(redemptionsData);
      writeCardCache(userId, stampsData, redemptionsData);

      // Today's Wi-Fi code
      const voucherRows = voucherRes.data;
      if (voucherRows && voucherRows.length > 0) {
        const voucherWithDate = { ...voucherRows[0], date: todayManila };
        setTodayVoucher(voucherWithDate);
        try {
          sessionStorage.setItem(WIFI_CACHE_KEY, JSON.stringify(voucherWithDate));
        } catch {
          // ignore storage errors
        }
      } else {
        setTodayVoucher(readTodayVoucherCache());
      }
    } catch (err) {
      console.error('Error loading loyalty data:', err);
      setErrorMsg('Could not refresh card stamps.');
    } finally {
      setDataReady(true);
    }
  }, [userId]);

  // Show the last-known card at once, then refresh it from the server
  useEffect(() => {
    if (!userId) {
      setDataReady(false);
      return;
    }
    if (bootedCacheUserRef.current === userId) {
      bootedCacheUserRef.current = null;
    } else {
      const cached = readCardCache(userId);
      if (cached) {
        setStamps(cached.stamps || []);
        setRedemptions(cached.redemptions || []);
        setDataReady(true);
      } else {
        setDataReady(false);
      }
    }
    loadLoyaltyData();
  }, [userId, loadLoyaltyData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStamps([]);
    setRedemptions([]);
    setTodayVoucher(null);
    sessionStorage.removeItem('baia_today_wifi_voucher');
    clearCardCache();
  };

  const handleDeleteAccount = async () => {
    if (deletingAccount || !session?.access_token) return;
    try {
      setDeletingAccount(true);
      setErrorMsg('');
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ confirm: 'DELETE' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete account.');
      }
      setShowDeleteModal(false);
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setStamps([]);
      setRedemptions([]);
      setTodayVoucher(null);
      sessionStorage.removeItem('baia_today_wifi_voucher');
      clearCardCache();
      setToastMsg('Your account and stamp data have been permanently deleted.');
      setTimeout(() => setToastMsg(''), 4000);
    } catch (err) {
      console.error('Delete account error:', err);
      setErrorMsg(err.message || 'Error deleting account.');
    } finally {
      setDeletingAccount(false);
    }
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

      import('canvas-confetti')
        .then(({ default: confetti }) => confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.5 }
        }))
        .catch(() => {});

      setToastMsg(data.message || 'Stamp successfully added to your card.');
      if (data.wifiVoucher) {
        const todayManila = MANILA_DAY_FMT.format(new Date());

        const voucherWithDate = { ...data.wifiVoucher, date: todayManila };
        setTodayVoucher(voucherWithDate);
        try {
          sessionStorage.setItem(WIFI_CACHE_KEY, JSON.stringify(voucherWithDate));
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

  // Check if today's stamp or Wi-Fi voucher has already been claimed for current Manila date
  const todayManila = MANILA_DAY_FMT.format(new Date());

  const hasScannedToday = Boolean(todayVoucher) || stamps.some(s => {
    try {
      const stampDate = MANILA_DAY_FMT.format(new Date(s.awarded_at));
      return stampDate === todayManila;
    } catch (e) {
      return false;
    }
  });

  const sortedAscStamps = sortStampsAsc(stamps);

  // Stamps on the card being filled now (the first-card bonus sits in slot 1 of card 2)
  const currentCycleStamps = sortedAscStamps.slice(Math.floor(loyaltyStatus.totalStamps / 10) * 10);
  const onlyBonusOnNextCard = currentCycleStamps.length > 0 && currentCycleStamps.every(isBonusStamp);

  // A card shows the completed 10/10 state while its reward is unredeemed and nothing
  // has been earned on the next card yet (the free bonus stamp doesn't count as starting it)
  const isCompletedCard = loyaltyStatus.totalStamps > 0
    && loyaltyStatus.hasPendingReward
    && (loyaltyStatus.totalStamps % 10 === 0 || onlyBonusOnNextCard);
  const bonusWaitingOnNextCard = isCompletedCard && onlyBonusOnNextCard;
  const currentCardHasBonus = !isCompletedCard && currentCycleStamps.some(isBonusStamp);
  // Before the first card is done, tell people what finishing it gets them
  const showFirstCardBonusTeaser = !isCompletedCard && loyaltyStatus.milestoneNumber === 0 && !loyaltyStatus.hasFirstCardBonus;

  // Active cycle progress: 10 if completed, else totalStamps % 10 (e.g. 1 to 9, or 0)
  const displayProgress = isCompletedCard ? 10 : (loyaltyStatus.totalStamps % 10);

  // Active cycle number
  const activeCycleNumber = isCompletedCard
    ? Math.floor(loyaltyStatus.totalStamps / 10)
    : Math.floor(loyaltyStatus.totalStamps / 10) + 1;

  // Group historical stamps into completed cycle cards
  const numCompletedCycles = Math.floor(stamps.length / 10);

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

  const headerActionsEl = typeof document !== 'undefined' ? document.getElementById('loyalty-header-actions') : null;

  // Each stamp lands at its own slight angle, like a rubber stamp pressed by hand
  const STAMP_TILTS = [-8, 5, -3, 9, -6, 4, -10, 7, -2, -5];

  // Fetch the scanner in the background once the card is up, so tapping
  // Scan at the counter opens the camera without waiting on the network
  useEffect(() => {
    if (!dataReady || hasScannedToday) return undefined;
    const whenIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const id = whenIdle(() => { loadQrScanner().catch(() => {}); });
    return () => cancelIdle(id);
  }, [dataReady, hasScannedToday]);
  const stampsLeft = loyaltyStatus.stampsUntilNextMilestone;

  return (
    <>
      {/* Header actions, rendered into the static header shell */}
      {headerActionsEl && ReactDOM.createPortal(
        <>
          <button
            type="button"
            onClick={() => setShowTutorialModal(true)}
            className="btn-loyalty-signout"
            title="How your card works"
          >
            <HelpCircle size={14} />
            <span>How it works</span>
          </button>
          {user && (
            <button onClick={handleSignOut} className="btn-loyalty-signout" title="Sign out">
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          )}
        </>,
        headerActionsEl
      )}

      <main className="loyalty-main-content card-main">
        {!user && !loading ? (
          <div>
            <AuthModal onSuccess={(s) => {
              setSession(s);
              setUser(s.user);
            }} />
          </div>
        ) : (
          <div className="card-stack">

            {toastMsg && (
              <div className="card-alert is-ok" role="status">{toastMsg}</div>
            )}

            {errorMsg && (
              <div className="card-alert is-error" role="alert">{errorMsg}</div>
            )}

            {/* A full card: the free coffee, ready to redeem */}
            {dataReady && loyaltyStatus.hasPendingReward && (
              <section className="reward-ready" aria-labelledby="reward-ready-title">
                <div className="reward-ready-head">
                  <span className="reward-ready-icon" aria-hidden="true"><Gift size={22} /></span>
                  <div>
                    <h2 id="reward-ready-title">Your free coffee is ready</h2>
                    <p>Redeem it at the counter when you order, then show this screen to the barista.</p>
                  </div>
                </div>

                {!showRedeemConfirm ? (
                  <button
                    type="button"
                    className="reward-ready-btn"
                    onClick={() => setShowRedeemConfirm(true)}
                  >
                    <Sparkles size={16} aria-hidden="true" />
                    <span>Redeem at the counter</span>
                  </button>
                ) : (
                  <div className="reward-confirm">
                    <p>Are you at the counter ordering now?</p>
                    <div className="reward-confirm-actions">
                      <button
                        type="button"
                        className="btn-card-quiet"
                        onClick={() => setShowRedeemConfirm(false)}
                        disabled={redeeming}
                      >
                        Not yet
                      </button>
                      <button
                        type="button"
                        className="btn-card-solid"
                        onClick={handleRedeemReward}
                        disabled={redeeming}
                      >
                        {redeeming ? 'Redeeming…' : 'Yes, redeem now'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* The stamp card: printed on sand paper, stamped in BAIA blue ink */}
            <section
              className={`paper-card ${!dataReady ? 'is-loading' : isCompletedCard ? 'is-full' : ''}`}
              aria-busy={!dataReady || undefined}
              aria-label={dataReady
                ? `Loyalty card ${activeCycleNumber}: ${displayProgress} of 10 stamps`
                : 'Loading your loyalty card'}
            >
              <div className="paper-head">
                <div className="paper-brand">
                  <span className="paper-brand-name">BAIA</span>
                  <span className="paper-brand-line">Coffee by the Bay</span>
                </div>
                <button
                  type="button"
                  className="paper-cycle-btn"
                  onClick={() => setShowArchiveModal(true)}
                  disabled={!dataReady}
                  title="See your finished cards"
                >
                  <span>Card {dataReady ? activeCycleNumber : 1}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="paper-holder">
                <span className="paper-holder-name">
                  {user
                    ? (user.user_metadata?.full_name || user.email?.split('@')[0] || 'BAIA guest')
                    : 'Signing you in…'}
                </span>
                <span className="paper-holder-email">{user?.email || '\u00A0'}</span>
              </div>

              <ol className="stamp-row" aria-hidden={!dataReady || undefined}>
                {!dataReady ? (
                  Array.from({ length: 10 }).map((_, idx) => <li key={idx} className="stamp" />)
                ) : (
                  Array.from({ length: 10 }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const isFilled = slotNum <= displayProgress;
                    const isRewardSlot = slotNum === 10;
                    const isBonusSlot = isFilled && !isCompletedCard && isBonusStamp(currentCycleStamps[idx]);
                    const classes = [
                      'stamp',
                      isFilled ? 'is-inked' : '',
                      isBonusSlot ? 'is-bonus' : '',
                      isRewardSlot ? 'is-reward' : ''
                    ].filter(Boolean).join(' ');
                    const label = isBonusSlot
                      ? `Stamp ${slotNum}: bonus stamp, on us`
                      : isFilled
                        ? `Stamp ${slotNum}: stamped`
                        : isRewardSlot ? 'Stamp 10: free coffee' : `Stamp ${slotNum}: not yet`;
                    return (
                      <li
                        key={idx}
                        className={classes}
                        style={{ '--tilt': `${STAMP_TILTS[idx]}deg`, '--i': idx }}
                        aria-label={label}
                        title={label}
                      >
                        {isBonusSlot ? (
                          <>
                            <Gift size={18} aria-hidden="true" />
                            <span className="stamp-tag">+1</span>
                          </>
                        ) : isFilled ? (
                          isRewardSlot
                            ? <><Coffee size={18} aria-hidden="true" /><span className="stamp-tag">Free</span></>
                            : <Coffee size={20} aria-hidden="true" />
                        ) : isRewardSlot ? (
                          <><Coffee size={16} aria-hidden="true" /><span className="stamp-tag">Free</span></>
                        ) : (
                          <span className="stamp-num" aria-hidden="true">{slotNum}</span>
                        )}
                      </li>
                    );
                  })
                )}
              </ol>

              <div className="paper-foot">
                <p className="paper-progress">
                  {!dataReady
                    ? (user ? 'Checking your stamps…' : 'Opening your card…')
                    : isCompletedCard
                      ? 'Card full. Your free coffee is ready.'
                      : `${stampsLeft} more ${stampsLeft === 1 ? 'drink' : 'drinks'} to a free coffee.`}
                </p>
                <span className="paper-count">{dataReady ? `${displayProgress}/10` : '–/10'}</span>
              </div>

              {(!dataReady || bonusWaitingOnNextCard || currentCardHasBonus || showFirstCardBonusTeaser) && (
                <p className="paper-note">
                  <Gift size={14} aria-hidden="true" />
                  <span>
                    {dataReady && bonusWaitingOnNextCard
                      ? <><strong>+1 bonus stamp</strong> for finishing your first card. It's already on your next card.</>
                      : dataReady && currentCardHasBonus
                        ? <><strong>+1 bonus stamp</strong> on us for finishing your first card.</>
                        : <>Finish this card and your next one starts with <strong>1 stamp on us</strong>.</>}
                  </span>
                </p>
              )}
            </section>

            {/* Today's Wi-Fi code (shown again any time today) */}
            {dataReady && todayVoucher ? (
              <section className="wifi-tile" aria-labelledby="wifi-title">
                <div className="wifi-head">
                  <span className="wifi-icon" aria-hidden="true"><Wifi size={18} /></span>
                  <h2 id="wifi-title">Today's Wi-Fi code</h2>
                </div>
                <div className="wifi-code-box">
                  <span className="wifi-code">{todayVoucher.code}</span>
                  <button
                    type="button"
                    className={`wifi-copy ${copiedVoucher ? 'is-copied' : ''}`}
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(todayVoucher.code);
                        setCopiedVoucher(true);
                        setTimeout(() => setCopiedVoucher(false), 2200);
                      }
                    }}
                  >
                    {copiedVoucher ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    <span>{copiedVoucher ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="wifi-help">
                  Connect to <strong>“BAIA Free Wifi”</strong> and enter this code. It works for 1 hour on up to 2 devices.
                </p>
              </section>
            ) : null}

            {/* Scan the counter standee (hidden once today's stamp is in) */}
            {(!dataReady || !hasScannedToday) && (
              <button
                type="button"
                className="scan-btn"
                disabled={!dataReady}
                onClick={() => {
                  setScannerErrorMsg('');
                  setScannerStatusMsg('');
                  setShowScannerModal(true);
                }}
              >
                <span className="scan-btn-icon" aria-hidden="true"><QrCode size={22} /></span>
                <span className="scan-btn-text">
                  <strong>Scan the counter standee</strong>
                  <span>Get today's stamp and Wi-Fi code</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}

            {/* On the menu — always rendered immediately (LCP candidate) */}
            <a className="menu-tile" href="/#menu">
              <img
                src="/images/classiccafe-card.webp"
                alt=""
                width="104"
                height="112"
                fetchPriority="high"
              />
              <span className="menu-tile-text">
                <strong>Spanish latte and sea salt cold brew</strong>
                <span>Made at our bar on Laurente Beach.</span>
                <span className="menu-tile-link">See the menu <ChevronRight size={14} aria-hidden="true" /></span>
              </span>
            </a>

            <footer className="card-legal">
              <p className="card-legal-trust">
                <ShieldCheck size={14} aria-hidden="true" />
                <span>Stamps are checked in store at BAIA, San Pascual, Burias Island.</span>
              </p>
              <p className="card-legal-links">
                <button type="button" onClick={() => setCardLegalType('terms')} className="legal-footer-btn">
                  Terms of Service
                </button>
                <button type="button" onClick={() => setCardLegalType('privacy')} className="legal-footer-btn">
                  Privacy Policy
                </button>
              </p>
              <button
                type="button"
                className="card-delete-link"
                disabled={!user}
                onClick={() => setShowDeleteModal(true)}
              >
                Delete my account and stamps
              </button>
            </footer>

          </div>
        )}
      </main>

      {/* Finished cards */}
      {showArchiveModal && (
        <div className="archive-modal-overlay">
          <div className="archive-modal-card card-sheet" role="dialog" aria-modal="true" aria-labelledby="archive-title">
            <div className="archive-modal-header">
              <div className="card-sheet-head">
                <span className="card-sheet-icon" aria-hidden="true"><Trophy size={20} /></span>
                <div>
                  <h3 id="archive-title">Your cards</h3>
                  <p>Every card you've filled at BAIA</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="btn-archive-close"
                aria-label="Close your cards"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            <div className="archive-modal-body">
              <div className="archive-summary">
                <div>
                  <strong>Card {activeCycleNumber}</strong>
                  <span>Filling now</span>
                </div>
                <div>
                  <strong>{numCompletedCycles}</strong>
                  <span>{numCompletedCycles === 1 ? 'Card finished' : 'Cards finished'}</span>
                </div>
              </div>

              {completedCycleCards.length > 0 ? (
                completedCycleCards.map((card) => (
                  <div key={card.cycleNumber} className="mini-card">
                    <div className="mini-card-head">
                      <strong>Card {card.cycleNumber}</strong>
                      <span><Calendar size={12} aria-hidden="true" /> {card.finishDate}</span>
                    </div>
                    <div className="mini-stamps" aria-hidden="true">
                      {Array.from({ length: 10 }).map((_, idx) => (
                        <span key={idx} className="mini-stamp" style={{ '--tilt': `${STAMP_TILTS[idx]}deg` }}>
                          {isBonusStamp(card.stamps[idx]) ? <Gift size={10} /> : <Coffee size={10} />}
                        </span>
                      ))}
                    </div>
                    <p className="mini-card-reward">Earned: {card.rewardTitle}</p>
                  </div>
                ))
              ) : (
                <div className="archive-empty">
                  <Coffee size={28} aria-hidden="true" />
                  <h4>Your first card is still filling up</h4>
                  <p>Finish 10 stamps and the card will be kept here.</p>
                </div>
              )}

              <div className="mini-card is-current">
                <div className="mini-card-head">
                  <strong>Card {activeCycleNumber}</strong>
                  <span>{isCompletedCard ? 'Full, ready to redeem' : `${displayProgress}/10 stamps`}</span>
                </div>
                <div className="mini-progress" aria-hidden="true">
                  <span style={{ width: `${(displayProgress / 10) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* In-app camera scanner */}
      {showScannerModal && (
        <div className="scanner-overlay">
          <div className="scanner-frame">
            <Suspense fallback={<div className="scanner-loading">Opening the camera…</div>}>
              <QrScanner
                onScan={handleInAppScan}
                onClose={() => setShowScannerModal(false)}
              />
            </Suspense>
            {scannerStatusMsg && (
              <div className="card-alert is-ok" role="status">{scannerStatusMsg}</div>
            )}
            {scannerErrorMsg && (
              <div className="card-alert is-error" role="alert">{scannerErrorMsg}</div>
            )}
          </div>
        </div>
      )}

      {/* Barista redemption countdown */}
      {activeRedemption && (
        <Suspense fallback={null}>
        <RedemptionCountdown
          redemptionData={activeRedemption}
          user={user}
          onClose={() => {
            setActiveRedemption(null);
            loadLoyaltyData();
          }}
        />
        </Suspense>
      )}

      {/* How it works (from the header) */}
      {showTutorialModal && (
        <div className="archive-modal-overlay">
          <div className="archive-modal-card card-sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title" style={{ maxWidth: '440px' }}>
            <div className="archive-modal-header">
              <div className="card-sheet-head">
                <span className="card-sheet-icon" aria-hidden="true"><HelpCircle size={20} /></span>
                <div>
                  <h3 id="guide-title">How your card works</h3>
                  <p>Stamps, Wi-Fi and your free coffee</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTutorialModal(false)}
                className="btn-archive-close"
                aria-label="Close the guide"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            <ol className="guide-steps">
              <li>
                <span className="guide-num" aria-hidden="true">1</span>
                <div>
                  <h4>One drink, one stamp a day</h4>
                  <p>Buy any handcrafted drink, then tap <strong>Scan the counter standee</strong> at the pickup bar.</p>
                </div>
              </li>
              <li>
                <span className="guide-num" aria-hidden="true">2</span>
                <div>
                  <h4>Free Wi-Fi with every scan</h4>
                  <p>Each daily scan gives you a 1-hour code for <strong>“BAIA Free Wifi”</strong>, for up to 2 devices (phone and laptop).</p>
                </div>
              </li>
              <li>
                <span className="guide-num" aria-hidden="true">3</span>
                <div>
                  <h4>A free coffee every 10 stamps</h4>
                  <p>Fill the card to unlock your reward. Redeem it when you order and show your screen to the barista. Finish your first card and we add 1 bonus stamp to your next one.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Delete account and data */}
      {showDeleteModal && (
        <div className="archive-modal-overlay">
          <div className="archive-modal-card card-sheet delete-sheet" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <span className="delete-icon" aria-hidden="true"><Trash2 size={22} /></span>
            <h3 id="delete-title">Delete your account?</h3>
            <p>
              This permanently deletes your account, your stamps, any active Wi-Fi codes and your reward history. It can't be undone.
            </p>
            <div className="delete-actions">
              <button
                type="button"
                className="btn-card-quiet"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingAccount}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-card-danger"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <LegalModal type={cardLegalType} onClose={() => setCardLegalType(null)} />
    </>
  );
}
