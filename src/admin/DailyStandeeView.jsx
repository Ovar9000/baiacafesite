import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Printer, 
  Award, 
  CheckCircle2, 
  AlertCircle, 
  Send,
  Loader2
} from 'lucide-react';

export default function DailyStandeeView({ password, tokenData, setTokenData, loadingToken, fetchDailyToken }) {
  // Manual stamp grant state
  const [manualEmail, setManualEmail] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [manualError, setManualError] = useState('');

  useEffect(() => {
    if (password && !tokenData && !loadingToken) {
      fetchDailyToken(password);
    }
  }, [password, tokenData, loadingToken]);

  const handlePrint = () => {
    window.print();
  };

  const handleManualGrant = async (e) => {
    e.preventDefault();
    if (!manualEmail || !manualEmail.includes('@')) {
      setManualError('Please enter a valid customer email.');
      return;
    }

    try {
      setManualLoading(true);
      setManualError('');
      setManualResult(null);

      const res = await fetch('/api/admin-manual-stamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          email: manualEmail.trim(),
          staffNote: manualNote.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to award manual stamp.');
      }

      setManualResult(data);
      setManualEmail('');
      setManualNote('');
    } catch (err) {
      setManualError(err.message || 'Error executing manual stamp.');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div className="admin-tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
      {/* Action Bar (No Print) */}
      <div className="admin-controls-card no-print" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: '#FFFFFF',
        padding: '16px 20px',
        borderRadius: '16px',
        border: '1px solid var(--loyalty-border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1rem', color: 'var(--loyalty-navy)', fontWeight: 700 }}>
              Daily Standee QR Code
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
              {tokenData?.formattedDate || 'Today’s QR Token Active'}
            </p>
          </div>

          <button
            onClick={handlePrint}
            style={{
              background: 'var(--loyalty-navy)',
              color: '#FFFFFF',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Printer size={16} />
            <span>Print Standee</span>
          </button>
        </div>

        {tokenData?.claimUrl && (
          <div style={{ background: '#FAF4EB', padding: '10px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <code style={{ fontSize: '0.75rem', color: '#16255C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tokenData.claimUrl}
            </code>
            <a
              href={tokenData.claimUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#16255C',
                color: '#FFF',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                whiteSpace: 'nowrap'
              }}
            >
              Test Claim Link &rarr;
            </a>
          </div>
        )}
      </div>

      {/* Printable Acrylic Standee Card */}
      <div className="standee-print-card">
        <img src="/images/Logo.webp" alt="BAIA Cafe Logo" className="standee-header-logo" />
        <h1 className="standee-title">BAIA CAFÉ</h1>
        <div className="standee-subtitle">SHORE LOYALTY CARD</div>

        <div className="standee-qr-frame">
          {tokenData?.claimUrl ? (
            <QRCodeSVG 
              value={tokenData.claimUrl}
              size={220}
              level="H"
              includeMargin={false}
              imageSettings={{
                src: "/images/Logo.webp",
                x: undefined,
                y: undefined,
                height: 44,
                width: 44,
                excavate: true,
              }}
            />
          ) : (
            <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 className="animate-spin" size={32} />
            </div>
          )}
        </div>

        <div>
          <div className="standee-date-pill">
            {tokenData?.formattedDate || 'Daily Barista QR'}
          </div>
        </div>

        <p className="standee-instructions">
          <strong>Drink Pickup Bar Only</strong><br />
          Scan with your phone camera when picking up your handcrafted beverage to collect today’s loyalty stamp. Max 1 stamp per day.
        </p>
      </div>

      {/* Manual Stamp Grant Section (No Print) */}
      <div className="loyalty-section-card no-print">
        <div className="section-card-title">
          <Award size={20} color="#FB923C" />
          <span>Emergency Manual Stamp Override</span>
        </div>
        <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '16px', lineHeight: '1.4' }}>
          Use this tool when a customer has a GPS hardware glitch or phone issue at pickup to manually award 1 stamp.
        </p>

        {manualError && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#B91C1C',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <AlertCircle size={16} />
            <span>{manualError}</span>
          </div>
        )}

        {manualResult && (
          <div style={{
            background: '#F0FDF4',
            border: '1px solid #86EFAC',
            color: '#15803D',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <CheckCircle2 size={16} />
            <span>{manualResult.message} (Total: {manualResult.totalStamps} stamps)</span>
          </div>
        )}

        <form onSubmit={handleManualGrant} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="email"
            placeholder="Customer Email Address"
            className="input-email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            required
            disabled={manualLoading}
          />
          <input
            type="text"
            placeholder="Staff Note (e.g. GPS hardware failure on iPhone)"
            className="input-email"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            disabled={manualLoading}
          />
          <button
            type="submit"
            className="btn-submit-otp"
            disabled={manualLoading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Send size={16} />
            <span>{manualLoading ? 'Awarding Stamp...' : 'Award 1 Manual Stamp'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
