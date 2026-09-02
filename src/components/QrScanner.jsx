import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle, RefreshCw, Loader2, ImagePlus, Zap } from 'lucide-react';

export default function QrScanner({ onScan, onClose }) {
  const [cameraError, setCameraError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [isScanningFile, setIsScanningFile] = useState(false);
  const scannerRef = useRef(null);
  const isScannedRef = useRef(false);
  const fileInputRef = useRef(null);

  const processDecodedText = (decodedText) => {
    if (isScannedRef.current) return;
    isScannedRef.current = true;

    let token = decodedText.trim();
    try {
      if (token.includes('?')) {
        const parsedUrl = new URL(token, window.location.origin);
        const t = parsedUrl.searchParams.get('t') || parsedUrl.searchParams.get('token');
        if (t) token = t;
      }
    } catch (e) {}

    onScan(token);
  };

  useEffect(() => {
    const scannerId = 'baia-qr-scanner-viewport';
    let html5QrCode = null;

    const startScanner = async () => {
      try {
        setIsStarting(true);
        setCameraError('');
        isScannedRef.current = false;

        // Check if browser is in a Secure Context (HTTPS or localhost)
        const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        if (!isSecure && !navigator.mediaDevices?.getUserMedia) {
          setCameraError('Live video stream requires HTTPS on mobile. Use the button below to snap a photo with your phone camera!');
          setIsStarting(false);
          return;
        }

        const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(180, Math.floor(minEdge * 0.72));
          return { width: size, height: size };
        };

        const config = {
          fps: 15,
          qrbox: qrboxFunction,
          aspectRatio: 1.0,
          disableFlip: false
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (scannerRef.current?.isScanning) {
              scannerRef.current.stop().then(() => {
                processDecodedText(decodedText);
              }).catch(() => {
                processDecodedText(decodedText);
              });
            } else {
              processDecodedText(decodedText);
            }
          },
          (errorMessage) => {
            // Frame parsing error - normal while scanning
          }
        );

        setIsStarting(false);
      } catch (err) {
        console.error('Error starting live camera QR scanner:', err);
        setIsStarting(false);
        setCameraError('Live camera not available over HTTP. Tap "Snap Photo with Camera" below to scan instantly!');
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

  const handleFileCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsScanningFile(true);
      setCameraError('');

      let html5QrCode = scannerRef.current;
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('baia-qr-scanner-viewport');
        scannerRef.current = html5QrCode;
      }

      const decodedText = await html5QrCode.scanFile(file, true);
      setIsScanningFile(false);
      processDecodedText(decodedText);
    } catch (err) {
      setIsScanningFile(false);
      setCameraError('Could not find a QR code in the photo. Please snap a closer, well-lit photo of the standee.');
    }
  };

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
        aspectRatio: '1 / 1',
        maxHeight: '300px',
        borderRadius: '16px',
        overflow: 'hidden',
        background: '#0F172A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto'
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

        {isScanningFile && (
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
            <span style={{ fontSize: '0.85rem' }}>Decoding QR Code...</span>
          </div>
        )}

        {cameraError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: '#FAF4EB',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: '#16255C',
            gap: '8px'
          }}>
            <Camera size={32} color="#FB923C" />
            <p style={{ fontSize: '0.82rem', lineHeight: '1.4', margin: 0, color: '#475569' }}>
              {cameraError}
            </p>
          </div>
        )}
      </div>

      {/* Direct Shutter Camera Button (Works on all mobile browsers & HTTP/HTTPS) */}
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileCapture}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanningFile}
          style={{
            background: '#16255C',
            color: '#FFFFFF',
            border: 'none',
            padding: '12px 16px',
            borderRadius: '9999px',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(22, 37, 92, 0.2)'
          }}
        >
          <Camera size={18} />
          <span>Snap Photo with Camera</span>
        </button>

        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
          Point camera at the acrylic standee at the pickup bar.
        </div>
      </div>
    </div>
  );
}
