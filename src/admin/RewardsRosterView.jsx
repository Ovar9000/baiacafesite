import React, { useState, useEffect } from 'react';
import { 
  Gift, 
  Search, 
  Calendar, 
  Users, 
  TrendingUp,
  RotateCw,
  Loader2
} from 'lucide-react';
import { formatManilaDateTime } from '../lib/loyaltyHelpers';

export default function RewardsRosterView({ password, members, setMembers, summary, setSummary, loading, setLoading, fetchInsights }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'ready' | 'nearing' | 'active'

  useEffect(() => {
    if (password && members.length === 0 && !loading) {
      fetchInsights(password);
    }
  }, [password, members.length, loading]);

  const filteredMembers = members.filter((m) => {
    const matchesSearch = 
      m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterCategory === 'ready') return m.hasPendingReward;
    if (filterCategory === 'nearing') return !m.hasPendingReward && m.currentCycleProgress >= 7;
    if (filterCategory === 'active') return !m.hasPendingReward && m.currentCycleProgress < 7;

    return true;
  });

  return (
    <div className="admin-tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Shore Club Rewards Roster</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
            Live customer milestone progression and reward redemption eligibility.
          </p>
        </div>
        <button
          onClick={() => fetchInsights(password)}
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
          <span>Refresh Roster</span>
        </button>
      </div>

      {/* Metric Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px'
      }}>
        {/* Ready for Reward Card */}
        <div style={{
          background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
          border: '1.5px solid #F59E0B',
          borderRadius: '18px',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: '#F59E0B',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Gift size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#78350F', fontFamily: 'Space Grotesk, sans-serif', lineHeight: '1.1' }}>
              {summary.readyCount}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#B45309' }}>
              Reward Ready (10/10)
            </div>
          </div>
        </div>

        {/* Nearing Next Reward Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid #E2E8F0',
          borderRadius: '18px',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: '#EFF6FF',
            color: '#1E4AFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--loyalty-navy)', fontFamily: 'Space Grotesk, sans-serif', lineHeight: '1.1' }}>
              {summary.nearingCount}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>
              Nearing Reward (7-9 Stamps)
            </div>
          </div>
        </div>

        {/* Total Members */}
        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid #E2E8F0',
          borderRadius: '18px',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: '#F1F5F9',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--loyalty-navy)', fontFamily: 'Space Grotesk, sans-serif', lineHeight: '1.1' }}>
              {summary.totalMembers}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>
              Total Active Members
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        background: '#FFFFFF',
        border: '1.5px solid #E2E8F0',
        borderRadius: '20px',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px'
      }}>
        {/* Search Box */}
        <div style={{
          position: 'relative',
          flex: '1 1 240px'
        }}>
          <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search member name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 36px',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Category Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: `All (${members.length})` },
            { key: 'ready', label: `Reward Ready (${summary.readyCount})` },
            { key: 'nearing', label: `Nearing 7-9 (${summary.nearingCount})` },
            { key: 'active', label: 'In Progress (1-6)' }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterCategory(tab.key)}
              style={{
                background: filterCategory === tab.key ? '#16255C' : '#F1F5F9',
                color: filterCategory === tab.key ? '#FFFFFF' : '#475569',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Member Roster Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading && members.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0' }}>
            <Loader2 className="animate-spin" size={28} color="#16255C" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '0.85rem', color: '#64748B' }}>Loading rewards roster...</p>
          </div>
        ) : filteredMembers.length > 0 ? (
          filteredMembers.map((m) => {
            const isReady = m.hasPendingReward;
            const isNearing = !isReady && m.currentCycleProgress >= 7;

            return (
              <div
                key={m.id}
                style={{
                  background: isReady ? '#FFFBEB' : '#FFFFFF',
                  border: isReady ? '1.5px solid #F59E0B' : '1px solid #E2E8F0',
                  borderRadius: '18px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                }}
              >
                {/* Top Row: User Info & Urgency Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--loyalty-navy)', fontWeight: 700 }}>
                        {m.name}
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        ({m.email})
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} />
                      <span>Last visit: {formatManilaDateTime(m.lastActive)}</span>
                    </div>
                  </div>

                  {/* Status Pill */}
                  {isReady ? (
                    <span style={{
                      background: '#FEF3C7',
                      border: '1px solid #F59E0B',
                      color: '#92400E',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}>
                      Reward Ready to Claim
                    </span>
                  ) : isNearing ? (
                    <span style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1E40AF',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap'
                    }}>
                      {m.stampsRemaining} {m.stampsRemaining === 1 ? 'drink' : 'drinks'} away
                    </span>
                  ) : (
                    <span style={{
                      background: '#F1F5F9',
                      color: '#64748B',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap'
                    }}>
                      {m.currentCycleProgress} / 10 Stamps
                    </span>
                  )}
                </div>

                {/* Progress Bar & Milestone Target */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>
                      {isReady 
                        ? `Ready: ${m.nextRewardTitle}` 
                        : `Target: ${m.nextRewardTitle} (${m.stampsRemaining} more to unlock)`}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--loyalty-navy)' }}>
                      {m.currentCycleProgress}/10 Stamps &bull; Lifetime {m.totalStamps}
                    </span>
                  </div>

                  <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${isReady ? 100 : (m.currentCycleProgress / 10) * 100}%`,
                        background: isReady 
                          ? 'linear-gradient(90deg, #F5A623, #FCD34D)' 
                          : isNearing 
                            ? 'linear-gradient(90deg, #1E4AFF, #60A5FA)' 
                            : 'linear-gradient(90deg, #94A3B8, #CBD5E1)',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>

                {/* Barista Tip / Callout */}
                {isReady && (
                  <div style={{ fontSize: '0.75rem', color: '#92400E', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: '8px' }}>
                    Barista Note: Customer is eligible for complimentary reward upon ordering.
                  </div>
                )}
                {isNearing && (
                  <div style={{ fontSize: '0.75rem', color: '#1E40AF', background: '#EFF6FF', padding: '6px 10px', borderRadius: '8px' }}>
                    Engagement Opportunity: Customer is only {m.stampsRemaining} {m.stampsRemaining === 1 ? 'stamp' : 'stamps'} away from their next free reward!
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FFFFFF', borderRadius: '20px', border: '1px dashed #CBD5E1' }}>
            <Users size={36} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ color: 'var(--loyalty-navy)', marginBottom: '4px' }}>No matching loyalty members</h4>
            <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Try adjusting your search query or filter tab.</p>
          </div>
        )}
      </div>
    </div>
  );
}
