import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Coffee, ShoppingBag, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import { formatManilaDateTime } from '../lib/loyaltyHelpers';

export default function RedemptionCountdown({ redemptionData, user, onClose }) {
  const TOTAL_SECONDS = 120;
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);

  useEffect(() => {
    // Trigger celebratory confetti on redemption unlock
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {}

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const progressPercent = (secondsLeft / TOTAL_SECONDS) * 100;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const minutes = Math.floor(secondsLeft / 60);
  const remainingSeconds = secondsLeft % 60;
  const formattedTimer = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  const isCoffee = redemptionData?.rewardType === 'coffee';

  return (
    <div className="countdown-overlay">
      <div className="countdown-modal">
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
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
          aria-label="Close redemption screen"
        >
          <X size={18} />
        </button>

        {/* Security Seal */}
        <div className="countdown-security-seal">
          <ShieldCheck size={16} />
          <span>OFFICIAL BAIA BARISTA VERIFICATION</span>
        </div>

        {/* Circular Countdown Progress */}
        <div className="timer-circle-box">
          <svg className="timer-circle-svg" viewBox="0 0 120 120">
            <circle
              className="timer-circle-bg"
              cx="60"
              cy="60"
              r={radius}
            />
            <circle
              className="timer-circle-progress"
              cx="60"
              cy="60"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
                stroke: secondsLeft > 30 ? '#FB923C' : '#EF4444'
              }}
            />
          </svg>

          <div className="timer-text-inner">
            <span className="timer-seconds">{formattedTimer}</span>
            <span className="timer-sublabel">REMAINING</span>
          </div>
        </div>

        {/* Reward Card Details */}
        <div style={{
          background: '#FAF4EB',
          borderRadius: '16px',
          padding: '16px',
          border: '2px dashed #16255C',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'inline-flex', padding: '10px', background: '#16255C', color: '#FFF', borderRadius: '12px', marginBottom: '8px' }}>
            <Coffee size={28} />
          </div>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#16255C', fontSize: '1.25rem', fontWeight: 800, textTransform: 'uppercase' }}>
            FREE SPECIALTY COFFEE
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#475569', marginTop: '4px' }}>
            Milestone #{redemptionData?.milestoneNumber} Reward
          </p>
        </div>

        <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '18px', textAlign: 'left', background: '#F8FAFC', padding: '12px', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#64748B' }}>Customer:</span>
            <strong style={{ color: '#0F172A' }}>{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Member'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#64748B' }}>Time:</span>
            <span>{formatManilaDateTime(redemptionData?.redeemedAt || new Date().toISOString())}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748B' }}>Ref ID:</span>
            <code style={{ background: '#E2E8F0', padding: '1px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>
              BAIA-{redemptionData?.redemptionId || Math.floor(1000 + Math.random() * 9000)}
            </code>
          </div>
        </div>

        <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '16px' }}>
          👉 Please show this active animated screen to the cashier or barista when picking up your beverage.
        </p>

        <button 
          onClick={onClose}
          style={{
            width: '100%',
            background: '#16255C',
            color: '#FFFFFF',
            border: 'none',
            padding: '12px',
            borderRadius: '9999px',
            fontWeight: 700,
            fontSize: '0.92rem',
            cursor: 'pointer'
          }}
        >
          Done / Return to Card
        </button>
      </div>
    </div>
  );
}
