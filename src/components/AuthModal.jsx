import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Sparkles, AlertCircle, CheckCircle, ShieldCheck, Loader2 } from 'lucide-react';

export default function AuthModal({ onSuccess, title = "Sign In to Your Loyalty Card", subtitle = "Earn free handcrafted coffee with every order at Baia Café." }) {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState('input-email'); // 'input-email' | 'check-email'
  const [oauthLoading, setOauthLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Handle URL errors on load and sanitize URL to prevent re-render loops
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('error=')) {
      const params = new URLSearchParams(window.location.search);
      const errorDesc = params.get('error_description') || params.get('error');
      if (errorDesc) {
        let msg = decodeURIComponent(errorDesc.replace(/\+/g, ' '));
        if (msg.toLowerCase().includes('state not found') || msg.toLowerCase().includes('bad_oauth_state')) {
          msg = 'Authentication session expired. Please tap "Continue with Google" to complete sign-in.';
        }
        setErrorMsg(msg);
      }
      // Clean query string from browser address bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setOauthLoading(true);
      setErrorMsg('');
      const targetRedirect = window.location.pathname.includes('/claim')
        ? `${window.location.origin}/claim/${window.location.search}`
        : `${window.location.origin}/card/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: targetRedirect,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      if (error) throw error;
    } catch (err) {
      setErrorMsg(err.message || 'Failed to sign in with Google');
      setOauthLoading(false);
    }
  };

  const handleSendEmailLink = async (e) => {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    try {
      setEmailSending(true);
      setErrorMsg('');
      setInfoMsg('');
      const targetRedirect = window.location.pathname.includes('/claim')
        ? `${window.location.origin}/claim/${window.location.search}`
        : `${window.location.origin}/card/`;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: targetRedirect
        }
      });
      if (error) throw error;
      setStep('check-email');
    } catch (err) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setErrorMsg('Email rate limit reached for this hour. Please use Google Sign-In or try again shortly.');
      } else {
        setErrorMsg(err.message || 'Failed to send login email.');
      }
    } finally {
      setEmailSending(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length < 6) {
      setErrorMsg('Please enter the 6-digit code sent to your email.');
      return;
    }
    try {
      setOtpVerifying(true);
      setErrorMsg('');
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'email'
      });
      if (error) throw error;
      if (data?.session) {
        if (onSuccess) onSuccess(data.session);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired code. Please tap the link in your email instead.');
    } finally {
      setOtpVerifying(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header-icon">
        <Sparkles size={28} />
      </div>

      <h3>{title}</h3>
      <p>{subtitle}</p>

      {/* 3-Step Loyalty Perks Tutorial Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        margin: '16px 0 20px',
        textAlign: 'center'
      }}>
        <div style={{ background: '#FAF4EB', padding: '10px 6px', borderRadius: '14px', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#16255C' }}>1 Tap Join</div>
          <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>Instant &amp; free</div>
        </div>
        <div style={{ background: '#EFF6FF', padding: '10px 6px', borderRadius: '14px', border: '1px solid #BFDBFE' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1E4AFF' }}>Free Wi-Fi</div>
          <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>With daily scan</div>
        </div>
        <div style={{ background: '#ECFDF5', padding: '10px 6px', borderRadius: '14px', border: '1px solid #A7F3D0' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#15803D' }}>Free Coffee</div>
          <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>Every 10 stamps</div>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          color: '#B91C1C',
          borderRadius: '12px',
          padding: '10px 14px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          textAlign: 'left'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {infoMsg && (
        <div style={{
          background: '#F0FDF4',
          border: '1px solid #86EFAC',
          color: '#15803D',
          borderRadius: '12px',
          padding: '10px 14px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          textAlign: 'left'
        }}>
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{infoMsg}</span>
        </div>
      )}

      {step === 'input-email' && (
        <>
          {/* Primary 1-Tap Google Sign-In Pill Button */}
          <div style={{ width: '100%', marginBottom: '14px' }}>
            <button 
              type="button" 
              className="btn-oauth google" 
              onClick={handleGoogleSignIn}
              disabled={oauthLoading || emailSending}
            >
              {oauthLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              )}
              <span>{oauthLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>
          </div>

          <div className="auth-divider">or with email</div>

          <form onSubmit={handleSendEmailLink} className="email-otp-form">
            <input
              type="email"
              placeholder="Enter your email address"
              className="input-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={emailSending}
            />
            <button type="submit" className="btn-submit-otp" disabled={emailSending}>
              {emailSending ? 'Sending link...' : 'Send Sign-In Link →'}
            </button>
          </form>

          {/* Explicit Legal Notice During Signup */}
          <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '14px 0 0', textAlign: 'center', lineHeight: '1.4' }}>
            By signing in, you agree to the{' '}
            <a href="/terms/" target="_blank" rel="noreferrer" style={{ color: '#16255C', fontWeight: 600, textDecoration: 'underline' }}>
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy/" target="_blank" rel="noreferrer" style={{ color: '#16255C', fontWeight: 600, textDecoration: 'underline' }}>
              Privacy Policy
            </a>.
          </p>
        </>
      )}

      {step === 'check-email' && (
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <div style={{
            background: '#FAF4EB',
            border: '1.5px dashed #FB923C',
            borderRadius: '16px',
            padding: '18px 14px',
            marginBottom: '18px',
            fontSize: '0.88rem',
            color: '#16255C',
            lineHeight: '1.5'
          }}>
            Open the email from <strong>Supabase / BAIA Café</strong> and tap <strong>"Sign in"</strong> to open your loyalty card automatically.
          </div>

          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '14px' }}>
            Or enter the 6-digit verification code below if provided in your email:
          </div>

          <form onSubmit={handleVerifyOtp} className="email-otp-form">
            <input
              type="text"
              placeholder="Enter 6-digit code"
              className="input-email"
              style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '1.1rem', fontWeight: 'bold' }}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              disabled={otpVerifying}
            />
            <button type="submit" className="btn-submit-otp" disabled={otpVerifying || otpCode.length < 6}>
              {otpVerifying ? 'Verifying...' : 'Verify Code & Sign In →'}
            </button>
          </form>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
            <button 
              type="button" 
              onClick={() => {
                setStep('input-email');
                setErrorMsg('');
              }}
              style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              ← Use different email
            </button>
            <button 
              type="button" 
              onClick={handleSendEmailLink}
              disabled={emailSending}
              style={{ background: 'none', border: 'none', color: '#1E4AFF', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Resend link
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#94A3B8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={14} />
          <span>Official BAIA Shore Club Authentication</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
          <a href="/privacy/" target="_blank" rel="noreferrer" style={{ color: '#64748B', textDecoration: 'underline' }}>Privacy Policy</a>
          <span>•</span>
          <a href="/terms/" target="_blank" rel="noreferrer" style={{ color: '#64748B', textDecoration: 'underline' }}>Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
