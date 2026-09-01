import React from 'react';
import { ShieldCheck, Mail, ArrowLeft, Coffee, Lock, CheckCircle2 } from 'lucide-react';

export default function PrivacyPolicyApp() {
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
            <span>Verified Policy</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Legal &amp; Transparency
          </span>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#16255C', fontSize: '1.8rem', fontWeight: 800, margin: '6px 0 10px' }}>
            Privacy Policy
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.88rem', margin: 0 }}>
            Effective Date: September 1, 2026 • Last Updated: September 1, 2026
          </p>
        </div>

        {/* Content Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontSize: '0.92rem', lineHeight: '1.7', color: '#334155' }}>
          
          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              1. Overview &amp; Who We Are
            </h2>
            <p>
              Welcome to <strong>Baia Café</strong> (“we,” “us,” or “our”), accessible at <strong>https://www.baia.cafe</strong>. We operate an oceanfront specialty café in Masbate, Philippines, offering artisan coffee, shoreline floating cottage experiences, and our digital customer loyalty rewards program (the “Shore Club”).
            </p>
            <p>
              This Privacy Policy explains in clear, transparent detail how we collect, use, store, and protect your information when you use our website and digital loyalty card application.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              2. Information We Collect
            </h2>
            <p>
              We believe in minimal, purposeful data collection. We only collect the specific data necessary to deliver your digital stamp card and reward milestones:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                <strong>Account &amp; Profile Information:</strong> When you sign in using <strong>Google Sign-In</strong> or your email address, we receive your basic profile info including your <em>name, email address, and profile picture avatar</em>. We use this exclusively to authenticate you and display your loyalty progress.
              </li>
              <li>
                <strong>Location Data (GPS Geofencing):</strong> When you scan the daily QR standee at our drink pickup counter to claim a stamp, your browser asks for temporary GPS permission. We evaluate whether your coordinates are within <strong>75 meters of Baia Café</strong> to prevent fraudulent remote claims. We <strong>do not</strong> track your location in the background, and your raw GPS coordinates are not stored after verification.
              </li>
              <li>
                <strong>Loyalty Transaction Records:</strong> We record the timestamp of stamps awarded and milestone rewards redeemed (e.g. Free Specialty Coffee).
              </li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              3. How We Use Your Information
            </h2>
            <p>We process your information strictly for the following purposes:</p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>To maintain and calculate your 10-stamp digital loyalty card progression.</li>
              <li>To notify you and our baristas when you are eligible for complimentary beverage rewards.</li>
              <li>To verify physical presence at our counter when claiming daily stamps.</li>
              <li>To prevent unauthorized, automated, or fraudulent redemptions.</li>
            </ul>
            <p style={{ marginTop: '8px', fontWeight: 600, color: '#16255C' }}>
              We will never sell, rent, or monetize your personal data to third parties or advertisers.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              4. Third-Party Infrastructure &amp; Security
            </h2>
            <p>We use industry-standard enterprise cloud infrastructure to secure your data:</p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Google Identity Services:</strong> Provides secure, passwordless authentication via OAuth 2.0.</li>
              <li><strong>Supabase Inc.:</strong> Encrypted PostgreSQL database and authentication backend secured with strict Row-Level Security (RLS) policies.</li>
              <li><strong>Vercel Inc.:</strong> High-performance serverless hosting with end-to-end SSL/TLS encryption.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              5. Your Rights &amp; Data Deletion
            </h2>
            <p>
              You have full ownership of your data. You may at any time:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>View your full stamp history on your digital loyalty card.</li>
              <li>Sign out and revoke OAuth access through your Google Account permissions.</li>
              <li>Request the permanent deletion of your account, email, and stamp history.</li>
            </ul>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '14px 16px', marginTop: '12px' }}>
              <strong style={{ color: '#16255C' }}>How to Request Data Deletion:</strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
                To permanently delete your loyalty account, email us at <a href="mailto:quibotmark@gmail.com" style={{ color: '#1E4AFF', fontWeight: 600 }}>quibotmark@gmail.com</a> with the subject line <em>"Data Deletion Request"</em>. All associated database records will be erased within 48 business hours.
              </p>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: '1.15rem', color: '#16255C', fontWeight: 700, marginBottom: '8px' }}>
              6. Contact Us
            </h2>
            <p>
              If you have any questions or concerns regarding our privacy practices, please contact our team:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.88rem', color: '#475569' }}>
              <div><strong>Entity:</strong> Baia Café</div>
              <div><strong>Location:</strong> Masbate, Philippines</div>
              <div><strong>Primary Contact Email:</strong> <a href="mailto:quibotmark@gmail.com" style={{ color: '#1E4AFF', fontWeight: 600 }}>quibotmark@gmail.com</a></div>
              <div><strong>Official Website:</strong> <a href="https://www.baia.cafe" target="_blank" rel="noreferrer" style={{ color: '#1E4AFF', fontWeight: 600 }}>https://www.baia.cafe</a></div>
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
