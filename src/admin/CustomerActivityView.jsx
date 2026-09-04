import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Users, 
  QrCode, 
  Award, 
  TrendingUp, 
  Clock, 
  Gift, 
  RotateCw, 
  Search, 
  UserCheck,
  Loader2
} from 'lucide-react';

export default function CustomerActivityView({ password, data, setData, loading, setLoading, fetchActivity }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState('all'); // 'all' | 'stamp' | 'signup' | 'redemption'

  useEffect(() => {
    if (password && !data && !loading) {
      fetchActivity(password);
    }
  }, [password, data, loading]);

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Recently';
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'Just now';

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const traffic = data?.traffic || {
    totalVisits: 0,
    todayVisits: 0,
    weekVisits: 0,
    monthVisits: 0,
    peakHourWindow: '12:00 PM – 1:00 PM',
    peakHourCount: 0,
    rushWindows: {
      morning: { label: 'Morning Brew (6 AM – 11 AM)', count: 0 },
      lunch: { label: 'Lunch & Grill (11 AM – 3 PM)', count: 0 },
      sunset: { label: 'Sunset Chill (3 PM – 7 PM)', count: 0 },
      night: { label: 'Night Waves (7 PM – 11 PM)', count: 0 }
    }
  };

  const retention = data?.retention || {
    totalMembers: 0,
    newMembersThisWeek: 0,
    returningMembers: 0,
    retentionRate: 0,
    nearingRewardCount: 0,
    tiers: { firstTimer: 0, occasional: 0, regular: 0, ambassador: 0 }
  };

  const rewards = data?.rewards || {
    totalRedemptions: 0,
    pendingRedemptions: 0,
    totalMilestonesEarned: 0
  };

  const filteredActivities = (data?.activities || []).filter((act) => {
    if (activityFilter !== 'all' && act.type !== activityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (act.customerName || '').toLowerCase().includes(q);
      const matchEmail = (act.customerEmail || '').toLowerCase().includes(q);
      const matchNote = (act.staffNote || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchNote) return false;
    }
    return true;
  });

  const totalRushCount = Math.max(1, 
    traffic.rushWindows.morning.count + 
    traffic.rushWindows.lunch.count + 
    traffic.rushWindows.sunset.count + 
    traffic.rushWindows.night.count
  );

  const totalTiersCount = Math.max(1,
    retention.tiers.firstTimer +
    retention.tiers.occasional +
    retention.tiers.regular +
    retention.tiers.ambassador
  );

  return (
    <div className="admin-tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Overview Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Customer Activity &amp; Foot-Traffic</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0 0' }}>
            Real-time in-store customer behavior, scan peak hours, and retention depth on Laurente shore.
          </p>
        </div>
        <button
          onClick={() => fetchActivity(password)}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '9999px',
            background: '#FFFFFF',
            border: '1.5px solid #CBD5E1',
            color: '#1E293B',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Data</span>
        </button>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0' }}>
          <Loader2 className="animate-spin" size={32} color="#16255C" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', color: '#64748B' }}>Loading customer activity metrics...</p>
        </div>
      ) : (
        <>
          {/* Key Metric KPI Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
            {/* Card 1: Today Visits */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Today Visits</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#1E4AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <QrCode size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0F172A' }}>{traffic.todayVisits}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                {traffic.weekVisits} visits this week ({traffic.totalVisits} all-time)
              </div>
            </div>

            {/* Card 2: Registered Members */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Shore Club Members</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FDF4FF', color: '#A855F7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0F172A' }}>{retention.totalMembers}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                +{retention.newMembersThisWeek} new signups this week
              </div>
            </div>

            {/* Card 3: Retention Rate */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Retention Rate</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0F172A' }}>{retention.retentionRate}%</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                {retention.returningMembers} repeat visitors with 2+ visits
              </div>
            </div>

            {/* Card 4: Rewards & Milestones */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em' }}>Rewards Earned</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FFFBEB', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Gift size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0F172A' }}>
                {rewards.totalMilestonesEarned}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                {rewards.totalRedemptions > 0 || rewards.pendingRedemptions > 0 
                  ? `${rewards.totalRedemptions} redeemed • ${rewards.pendingRedemptions} ready to claim`
                  : `${retention.nearingRewardCount} customers near reward milestone`}
              </div>
            </div>
          </div>

          {/* Middle Section: Peak Rush Windows & Loyalty Depth */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
            {/* Box 1: Store Rush Windows */}
            <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} style={{ color: '#1E4AFF' }} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Peak Store Rush Windows</h3>
                </div>
                <span style={{ fontSize: '0.75rem', background: '#EFF6FF', color: '#1E4AFF', padding: '4px 10px', borderRadius: '9999px', fontWeight: 700 }}>
                  Peak: {traffic.peakHourWindow}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {Object.entries(traffic.rushWindows).map(([key, item]) => {
                  const pct = Math.round((item.count / totalRushCount) * 100);
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        <span>{item.label}</span>
                        <span>{item.count} scans ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${pct}%`, 
                            height: '100%', 
                            background: key === 'morning' ? '#F5A623' : key === 'lunch' ? '#EF4444' : key === 'sunset' ? '#8B5CF6' : '#1E4AFF',
                            borderRadius: '9999px',
                            transition: 'width 0.4s ease'
                          }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Box 2: Loyalty Retention Funnel */}
            <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} style={{ color: '#D97706' }} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Customer Loyalty Depth</h3>
                </div>
                {retention.nearingRewardCount > 0 && (
                  <span style={{ fontSize: '0.75rem', background: '#FEF3C7', color: '#B45309', padding: '4px 10px', borderRadius: '9999px', fontWeight: 700 }}>
                    {retention.nearingRewardCount} Nearing Reward
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { label: 'First-Time Walk-ins (1 Stamp)', count: retention.tiers.firstTimer, color: '#94A3B8' },
                  { label: 'Occasional Guests (2–4 Stamps)', count: retention.tiers.occasional, color: '#38BDF8' },
                  { label: 'Loyal Regulars (5–9 Stamps)', count: retention.tiers.regular, color: '#F5A623' },
                  { label: 'VIP Ambassadors (10+ Stamps)', count: retention.tiers.ambassador, color: '#10B981' }
                ].map((tier, idx) => {
                  const pct = Math.round((tier.count / totalTiersCount) * 100);
                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        <span>{tier.label}</span>
                        <span>{tier.count} guests ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${pct}%`, 
                            height: '100%', 
                            background: tier.color,
                            borderRadius: '9999px',
                            transition: 'width 0.4s ease'
                          }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Section: Real-time Customer Activity Stream */}
          <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} style={{ color: '#16255C' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Recent Customer Activity Stream</h3>
              </div>

              {/* Filters and Search */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '3px', borderRadius: '9999px' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'stamp', label: 'Scans' },
                    { id: 'signup', label: 'Signups' },
                    { id: 'redemption', label: 'Rewards' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setActivityFilter(f.id)}
                      style={{
                        background: activityFilter === f.id ? '#16255C' : 'transparent',
                        color: activityFilter === f.id ? '#FFFFFF' : '#64748B',
                        border: 'none',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder="Search customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      padding: '6px 12px 6px 30px',
                      borderRadius: '9999px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.78rem',
                      outline: 'none',
                      width: '150px'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Activities List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredActivities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94A3B8', fontSize: '0.85rem' }}>
                  No customer activity matching this filter.
                </div>
              ) : (
                filteredActivities.map((act) => {
                  const isStamp = act.type === 'stamp';
                  const isSignup = act.type === 'signup';
                  const isRedemption = act.type === 'redemption';

                  return (
                    <div
                      key={act.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: '#F8FAFC',
                        border: '1px solid #F1F5F9',
                        gap: '12px',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          background: isStamp ? '#EFF6FF' : isSignup ? '#FDF4FF' : '#ECFDF5',
                          color: isStamp ? '#1E4AFF' : isSignup ? '#A855F7' : '#10B981'
                        }}>
                          {isStamp ? <QrCode size={18} /> : isSignup ? <UserCheck size={18} /> : <Award size={18} />}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>
                              {act.customerName}
                            </span>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              textTransform: 'uppercase',
                              background: isStamp ? '#DBEAFE' : isSignup ? '#F3E8FF' : '#D1FAE5',
                              color: isStamp ? '#1E40AF' : isSignup ? '#6B21A8' : '#065F46'
                            }}>
                              {isStamp ? 'QR Stamp Scan' : isSignup ? 'New Registration' : 'Reward Redemption'}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                            {isStamp && (
                              <span>{act.staffNote ? act.staffNote : 'In-store stamp collected at beach counter'}</span>
                            )}
                            {isSignup && 'Registered new digital loyalty account'}
                            {isRedemption && `Claimed milestone ${act.milestone} reward: ${act.rewardType || 'free handcrafted coffee'}`}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatRelativeTime(act.timestamp)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
