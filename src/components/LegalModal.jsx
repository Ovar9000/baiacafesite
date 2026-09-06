import React, { useEffect } from 'react';
import { X, ShieldCheck, FileText, ExternalLink } from 'lucide-react';

export default function LegalModal({ type, onClose }) {
  useEffect(() => {
    if (!type) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [type, onClose]);

  if (!type) return null;

  const isTerms = type === 'terms';

  return (
    <div 
      className="legal-modal-overlay" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'legalFadeIn 0.2s ease-out forwards'
      }}
    >
      <div 
        className="legal-modal-card" 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: 'min(85vh, calc(100dvh - 32px))',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -12px rgba(15, 23, 42, 0.35)',
          border: '1.5px solid rgba(22, 37, 92, 0.08)',
          overflow: 'hidden',
          animation: 'legalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #F1F5F9',
          background: '#FAF4EB'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isTerms ? (
              <FileText size={20} color="#1E4AFF" />
            ) : (
              <ShieldCheck size={20} color="#15803D" />
            )}
            <div>
              <h3 
                id="legal-modal-title"
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: '#16255C',
                  margin: 0,
                  lineHeight: 1.2
                }}
              >
                {isTerms ? 'Terms of Service' : 'Privacy Policy'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>
                BAIA Shore Club • Masbate, Philippines
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a
              href={isTerms ? '/terms/' : '/privacy/'}
              target="_blank"
              rel="noreferrer"
              title="Open in new window"
              style={{
                color: '#64748B',
                padding: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '8px',
                textDecoration: 'none'
              }}
            >
              <ExternalLink size={16} />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close legal modal"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#16255C',
                fontWeight: 800,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div style={{
          padding: '22px 20px',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          fontSize: '0.86rem',
          lineHeight: '1.65',
          color: '#334155',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {isTerms ? (
            <>
              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>1. Acceptance of Terms</h4>
                <p style={{ margin: 0, textAlign: 'left' }}>
                  By accessing <strong>https://www.baia.cafe</strong> and participating in the <strong>BAIA Shore Club Loyalty Program</strong>, you agree to these Terms. If you do not agree, you may freely browse the site without creating an account.
                </p>
              </section>

              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>2. Shore Club Loyalty Rules</h4>
                <ul style={{ margin: '0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                  <li><strong>Earning Stamps:</strong> Receive 1 digital stamp per qualifying handcrafted beverage purchased at BAIA Café by scanning the official daily standee QR code.</li>
                  <li><strong>Daily Limit:</strong> Maximum of 1 stamp per account per calendar day (Asia/Manila timezone).</li>
                  <li><strong>Physical Standee QR:</strong> Stamp claims require scanning the physical daily counter standee at BAIA Café. Codes rotate daily at midnight.</li>
                  <li><strong>Beach Wi-Fi Voucher:</strong> Each daily stamp scan dispenses a 1-hour access voucher for the <em>"BAIA Free Wifi"</em> hotspot, valid for up to 2 devices.</li>
                  <li><strong>Reward Redemption:</strong> Every 10 stamps earns 1 complimentary specialty coffee. Rewards must be redeemed in-person with our counter barista.</li>
                </ul>
              </section>

              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>3. User Security &amp; Fair Play</h4>
                <p style={{ margin: 0, textAlign: 'left' }}>
                  You are responsible for your account credentials. Tampering, attempting to forge QR tokens, or automating claims will result in immediate disqualification and account closure.
                </p>
              </section>

              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>4. Governing Law &amp; Contact</h4>
                <p style={{ margin: 0, textAlign: 'left' }}>
                  These terms are governed by the laws of the Republic of the Philippines. For inquiries, email us at <a href="mailto:quibotmark@gmail.com" style={{ color: '#1E4AFF', fontWeight: 600 }}>quibotmark@gmail.com</a>.
                </p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>1. Information We Collect</h4>
                <ul style={{ margin: '0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                  <li><strong>Profile Info:</strong> Name, email address, and avatar provided via Google Sign-In or email OTP to identify your loyalty card.</li>
                  <li><strong>Zero Location / GPS Tracking:</strong> We do not track or store your device GPS location. In-store visits are verified purely by scanning the counter QR code.</li>
                  <li><strong>Wi-Fi Vouchers:</strong> We record dispensed 1-hour access codes for the <em>"BAIA Free Wifi"</em> hotspot.</li>
                  <li><strong>Stamp History:</strong> Timestamps of stamps awarded and free coffee rewards redeemed.</li>
                </ul>
              </section>

              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>2. How We Use Data</h4>
                <p style={{ margin: 0, textAlign: 'left' }}>
                  Your information is solely used to maintain your 10-stamp loyalty card, issue Wi-Fi passes, and notify baristas when you are eligible for rewards. We never sell, rent, or share personal data with third-party advertisers.
                </p>
              </section>

              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>3. Secure Infrastructure</h4>
                <p style={{ margin: 0, textAlign: 'left' }}>
                  We utilize enterprise cloud security including Google Identity Services (OAuth 2.0), Supabase (Row-Level Security PostgreSQL), and Vercel serverless hosting with end-to-end SSL encryption.
                </p>
              </section>

              <section>
                <h4 style={{ color: '#16255C', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 6px', textAlign: 'left' }}>4. Data Deletion Rights</h4>
                <p style={{ margin: 0, textAlign: 'left' }}>
                  You have full ownership of your data. You can delete your account anytime in the app or by emailing <a href="mailto:quibotmark@gmail.com" style={{ color: '#1E4AFF', fontWeight: 600 }}>quibotmark@gmail.com</a>.
                </p>
              </section>
            </>
          )}
        </div>

        {/* Footer with action button */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #F1F5F9',
          background: '#F8FAFC',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#16255C',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '9999px',
              padding: '9px 22px',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(22, 37, 92, 0.2)'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
