import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

export default function QrScanner({ onScan, onClose }) {
  const [cameraError, setCameraError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef(null);
  const isScannedRef = useRef(false);

  useEffect(() => {
    const scannerId = 'baia-qr-scanner-viewport';
    let html5QrCode = null;

    const startScanner = async () => {
      try {
        setIsStarting(true);
        setCameraError('');
        isScannedRef.current = false;

        html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (isScannedRef.current) return;
            isScannedRef.current = true;

            // Extract token if decoded text is a URL or raw string
            let token = decodedText.trim();
            try {
              if (token.includes('?')) {
                const parsedUrl = new URL(token, window.location.origin);
                const t = parsedUrl.searchParams.get('t') || parsedUrl.searchParams.get('token');
                if (t) token = t;
              }
            } catch (e) {}

            // Stop scanner and call handler
            html5QrCode.stop().then(() => {
              onScan(token);
            }).catch(() => {
              onScan(token);
            });
          },
          (errorMessage) => {
            // Frame parsing errors are normal while scanning
          }
        );

        setIsStarting(false);
      } catch (err) {
        console.error('Error starting camera QR scanner:', err);
        setIsStarting(false);
        if (err?.name === 'NotAllowedError' || err?.toString().includes('Permission denied')) {
          setCameraError('Camera access was denied. Please allow camera permissions in your browser settings to scan.');
        } else if (err?.name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
        } else {
          setCameraError('Could not start camera. Please ensure camera permissions are allowed.');
        }
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch (e) {}
      }
    };
  }, [onScan]);

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '24px',
      padding: '24px 20px',
      textAlign: 'center',
      position: 'relative',
      maxWidth: '380px',
      margin: '0 auto',
      boxShadow: 'var(--loyalty-shadow)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ padding: '8px', background: '#EFF6FF', color: '#1E4AFF', borderRadius: '10px' }}>
            <Camera size={20} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--loyalty-navy)', fontWeight: 700 }}>
              Scan Counter Standee
            </h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
              Point camera at today's QR code
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Viewport Frame */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '280px',
        borderRadius: '16px',
        overflow: 'hidden',
        background: '#0F172A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div id="baia-qr-scanner-viewport" style={{ width: '100%', height: '100%' }} />

        {isStarting && !cameraError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            gap: '10px'
          }}>
            <Loader2 className="animate-spin" size={32} color="#FB923C" />
            <span style={{ fontSize: '0.85rem' }}>Opening camera...</span>
          </div>
        )}

        {cameraError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: '#FEF2F2',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: '#B91C1C',
            gap: '12px'
          }}>
            <AlertCircle size={32} />
            <p style={{ fontSize: '0.82rem', lineHeight: '1.4', margin: 0 }}>
              {cameraError}
            </p>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div style={{ marginTop: '16px', fontSize: '0.78rem', color: '#64748B' }}>
        Hold your phone steady in front of the acrylic standee.
      </div>
    </div>
  );
}
