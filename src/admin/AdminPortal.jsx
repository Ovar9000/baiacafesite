import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  Users, 
  Activity, 
  Lock, 
  AlertCircle
} from 'lucide-react';
import DailyStandeeView from './DailyStandeeView.jsx';
import RewardsRosterView from './RewardsRosterView.jsx';
import CustomerActivityView from './CustomerActivityView.jsx';
import '../styles/loyalty.css';

function getTabFromPath() {
  if (typeof window === 'undefined') return 'qr';
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/activity')) return 'activity';
  if (path.includes('/rewards')) return 'rewards';
  return 'qr';
}

export default function AdminPortal({ initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || getTabFromPath());
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Cached state across all three tabs
  const [tokenData, setTokenData] = useState(null);
  const [loadingToken, setLoadingToken] = useState(false);

  const [rewardsMembers, setRewardsMembers] = useState([]);
  const [rewardsSummary, setRewardsSummary] = useState({ totalMembers: 0, readyCount: 0, nearingCount: 0 });
  const [loadingRewards, setLoadingRewards] = useState(false);

  const [activityData, setActivityData] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Sync browser back/forward history
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check saved session password on mount
  useEffect(() => {
    const savedPass = sessionStorage.getItem('baia_admin_pass');
    if (savedPass) {
      setPassword(savedPass);
      validateSavedPass(savedPass);
    }
  }, []);

  const validateSavedPass = async (pass) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      // Test credentials against token endpoint
      const res = await fetch('/api/admin-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      const data = await res.json();
      if (!res.ok) {
        sessionStorage.removeItem('baia_admin_pass');
        setIsAuthenticated(false);
        setAuthError(data.error || 'Session expired. Please log in again.');
        return;
      }
      setTokenData(data);
      setIsAuthenticated(true);
    } catch (err) {
      setIsAuthenticated(false);
      setAuthError('Connection error validating admin session.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;

    try {
      setAuthLoading(true);
      setAuthError('');

      const res = await fetch('/api/admin-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials.');
      }

      setTokenData(data);
      setIsAuthenticated(true);
      sessionStorage.setItem('baia_admin_pass', password);
    } catch (err) {
      setAuthError(err.message || 'Authentication failed.');
      setIsAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLock = () => {
    sessionStorage.removeItem('baia_admin_pass');
    setIsAuthenticated(false);
    setPassword('');
    setTokenData(null);
    setRewardsMembers([]);
    setActivityData(null);
  };

  const switchTab = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    const targetUrl = tab === 'activity' ? '/admin/activity/' : tab === 'rewards' ? '/admin/rewards/' : '/admin/';
    window.history.pushState(null, '', targetUrl);
  };

  const fetchDailyToken = async (pass) => {
    try {
      setLoadingToken(true);
      const res = await fetch('/api/admin-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass || password })
      });
      const data = await res.json();
      if (res.ok) {
        setTokenData(data);
      }
    } catch (err) {
      console.error('Error fetching token:', err);
    } finally {
      setLoadingToken(false);
    }
  };

  const fetchRewards = async (pass) => {
    try {
      setLoadingRewards(true);
      const res = await fetch('/api/admin-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass || password })
      });
      const data = await res.json();
      if (res.ok) {
        setRewardsMembers(data.members || []);
        setRewardsSummary(data.summary || { totalMembers: 0, readyCount: 0, nearingCount: 0 });
      }
    } catch (err) {
      console.error('Error fetching rewards:', err);
    } finally {
      setLoadingRewards(false);
    }
  };

  const fetchActivity = async (pass) => {
    try {
      setLoadingActivity(true);
      const res = await fetch('/api/admin-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass || password })
      });
      const data = await res.json();
      if (res.ok) {
        setActivityData(data);
      }
    } catch (err) {
      console.error('Error fetching activity:', err);
    } finally {
      setLoadingActivity(false);
    }
  };

  return (
    <div 
      className="loyalty-app-wrapper" 
      style={{ 
        maxWidth: '860px', 
        margin: '0 auto', 
        minHeight: '100vh', 
        background: '#F8FAFC'
      }}
    >
      {/* Top Header */}
      <header className="loyalty-header no-print" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        flexWrap: 'wrap', 
        gap: '12px',
        padding: '16px 20px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0'
      }}>
        <a href="/" className="loyalty-logo-lockup">
          <img src="/images/Logo.webp" alt="BAIA Cafe Logo" className="loyalty-logo-img" />
          <div>
            <div className="loyalty-logo-title">BAIA CAFÉ</div>
            <div className="loyalty-logo-sub">
              {activeTab === 'qr' ? 'BARISTA & ADMIN PORTAL' : activeTab === 'rewards' ? 'BARISTA INSIGHTS & REWARDS' : 'CUSTOMER ACTIVITY DASHBOARD'}
            </div>
          </div>
        </a>

        {/* Top Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          {/* Tab 1: Daily Standee QR */}
          <button
            type="button"
            onClick={() => switchTab('qr')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: activeTab === 'qr' ? 700 : 600,
              color: activeTab === 'qr' ? '#FFFFFF' : '#64748B',
              background: activeTab === 'qr' ? '#16255C' : '#F1F5F9',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <QrCode size={14} />
            <span>Daily Standee QR</span>
          </button>

          {/* Tab 2: Rewards Roster */}
          <button
            type="button"
            onClick={() => switchTab('rewards')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: activeTab === 'rewards' ? 700 : 600,
              color: activeTab === 'rewards' ? '#FFFFFF' : '#64748B',
              background: activeTab === 'rewards' ? '#16255C' : '#F1F5F9',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <Users size={14} />
            <span>Rewards Roster</span>
          </button>

          {/* Tab 3: Customer Activity */}
          <button
            type="button"
            onClick={() => switchTab('activity')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: activeTab === 'activity' ? 700 : 600,
              color: activeTab === 'activity' ? '#FFFFFF' : '#64748B',
              background: activeTab === 'activity' ? '#16255C' : '#F1F5F9',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <Activity size={14} />
            <span>Customer Activity</span>
          </button>

          {isAuthenticated && (
            <button 
              onClick={handleLock}
              style={{
                background: '#F1F5F9',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              Lock
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '24px 20px', flex: 1 }}>
        {!isAuthenticated ? (
          <div className="auth-card" style={{ maxWidth: '400px', margin: '40px auto 0 auto', background: '#FFFFFF', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <div className="auth-header-icon" style={{ background: '#FEF3C7', color: '#D97706', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <Lock size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', marginBottom: '8px', color: '#0F172A' }}>Admin Portal Access</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', textAlign: 'center', marginBottom: '24px' }}>
              Enter the store admin password to access the standee QR code, customer rewards, and activity insights.
            </p>

            {authError && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="submit"
                disabled={authLoading}
                style={{
                  background: '#16255C',
                  color: '#FFFFFF',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer'
                }}
              >
                {authLoading ? 'Authenticating...' : 'Unlock Portal'}
              </button>
            </form>
          </div>
        ) : (
          <div key={activeTab} className="admin-tab-pane">
            {activeTab === 'qr' && (
              <DailyStandeeView 
                password={password}
                tokenData={tokenData}
                setTokenData={setTokenData}
                loadingToken={loadingToken}
                fetchDailyToken={fetchDailyToken}
              />
            )}

            {activeTab === 'rewards' && (
              <RewardsRosterView 
                password={password}
                members={rewardsMembers}
                setMembers={setRewardsMembers}
                summary={rewardsSummary}
                setSummary={setRewardsSummary}
                loading={loadingRewards}
                setLoading={setLoadingRewards}
                fetchInsights={fetchRewards}
              />
            )}

            {activeTab === 'activity' && (
              <CustomerActivityView 
                password={password}
                data={activityData}
                setData={setActivityData}
                loading={loadingActivity}
                setLoading={setLoadingActivity}
                fetchActivity={fetchActivity}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
