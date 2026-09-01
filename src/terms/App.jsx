import React from 'react';
import { FileText, ArrowLeft, ShieldCheck } from 'lucide-react';

export default function TermsApp() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--loyalty-bg, #FAF4EB)', color: '#1E293B', fontFamily: 'Outfit, sans-serif', padding: '30px 16px 60px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', background: '#FFFFFF', borderRadius: '24px', padding: '32px 24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #F1F5F9', paddingBottom: '16px' }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#16255C', textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem' }}>
            <ArrowLeft size={16} />
            <span>Back to Baia Café</span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
            <ShieldCheck size={16} color="#15803D" />
            <span>Terms of Service</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1E4AFF', textTransform: 'uppercase', letterSpacing: '1px' }}>
            User Agreement
          </span>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#16255C', fontSize: '1.8rem', fontWeight: 800, margin: '6px 0 10px' }}>
            Terms of Service
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.88rem', margin: 0 }}>
            Effective Date: September 1, 2026 • Last Updated: September 1, 2026
          </p>
        </div>

        {/* Content Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontSize: '0.92rem', lineHeight: '1.7', color: '#334155' }}>
          
          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing our website (<strong>https://www.baia.cafe</strong>) and participating in the <strong>Baia Café Shore Club Loyalty Program</strong>, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, please do not use the loyalty card application.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              2. Shore Club Loyalty Program Rules
            </h2>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Earning Stamps:</strong> Customers receive 1 digital stamp per qualifying specialty handcrafted beverage purchased at Baia Café by scanning the official daily pickup standee QR code.</li>
              <li><strong>Daily Claim Limit:</strong> A maximum of 1 stamp may be earned per registered account per calendar day in Asia/Manila timezone.</li>
              <li><strong>Physical Presence Verification:</strong> To prevent fraud, stamp claiming requires temporary geolocation validation confirming physical presence at our counter (within 75 meters of the café).</li>
              <li><strong>Reward Redemption:</strong> Every 10 collected stamps earns 1 complimentary specialty coffee. Rewards must be redeemed in-person at our counter by showing the active reward status to our barista staff. Rewards cannot be exchanged for cash.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              3. User Accounts &amp; Security
            </h2>
            <p>
              You are responsible for maintaining the confidentiality of your authentication credentials. Any fraudulent behavior, including spoofing geolocation or attempting to manipulate cryptographic verification tokens, may result in immediate suspension or termination of your loyalty card.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              4. Changes &amp; Termination
            </h2>
            <p>
              Baia Café reserves the right to modify, suspend, or terminate the loyalty program or rewards structure with reasonable notice to customers.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              5. Governing Law &amp; Contact
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines. For inquiries, contact us at:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.88rem', color: '#475569' }}>
              <div><strong>Baia Café</strong></div>
              <div>Masbate, Philippines</div>
              <div><strong>Email:</strong> <a href="mailto:quibotmark@gmail.com" style={{ color: '#1E4AFF', fontWeight: 600 }}>quibotmark@gmail.com</a></div>
            </div>
          </section>

        </div>

        {/* Footer info */}
        <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px solid #F1F5F9', textAlign: 'center', fontSize: '0.78rem', color: '#94A3B8' }}>
          &copy; {new Date().getFullYear()} Baia Café. All rights reserved. • Masbate, Philippines
        </div>

      </div>
    </div>
  );
}
