'use client';

import React, { useState, useEffect, useRef } from 'react';

interface BarcodeScannerInputProps {
  onBarcodeScanned: (barcode: string) => Promise<void>;
  isLoading?: boolean;
}

export function BarcodeScannerInput({ onBarcodeScanned, isLoading = false }: BarcodeScannerInputProps) {
  const [manualBarcode, setManualBarcode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep input focused automatically for USB / Bluetooth keyboard scanners
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(focusTimer);
  }, [isLoading]);

  // Global listener for USB / Bluetooth scanners when focus is lost
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        if (target !== inputRef.current) return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) {
        buffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.trim().length >= 3) {
          const barcodeToProcess = buffer.trim();
          buffer = '';
          e.preventDefault();
          onBarcodeScanned(barcodeToProcess);
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBarcodeScanned]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    const barcode = manualBarcode.trim();
    setManualBarcode('');
    await onBarcodeScanned(barcode);
    inputRef.current?.focus();
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'code_39'],
        });

        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const detectedCode = barcodes[0].rawValue;
                stopCamera();
                onBarcodeScanned(detectedCode);
              }
            } catch {}
          }
        }, 300);
      } else {
        setCameraError('Camera scanning is not supported in this browser. Please enter barcode or use a handheld barcode scanner.');
      }
    } catch {
      setCameraError('Unable to access device camera. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    inputRef.current?.focus();
  };

  return (
    <div className="scanner-box">
      <div className="scanner-box__header">
        <span className="scanner-box__title">
          <span className="scanner-box__status-dot" aria-hidden="true" />
          Barcode Scanner Ready (USB / Bluetooth / Keyboard)
        </span>
        <span className="badge badge--denim badge--sm">Auto-Detect Active</span>
      </div>

      <form onSubmit={handleSubmit} className="scanner-box__input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="scanner-box__input"
          placeholder="Scan barcode or type and press Enter..."
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          disabled={isLoading}
          autoFocus
        />

        <button
          type="submit"
          disabled={isLoading || !manualBarcode.trim()}
          className="btn btn-primary scanner-box__btn"
        >
          {isLoading ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              <span>Scanning…</span>
            </>
          ) : (
            <>
              <span>+ Add to Cart</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={startCamera}
          className="btn btn-secondary scanner-box__btn"
          title="Open camera scanner"
        >
          📷 Camera Scan
        </button>
      </form>

      {/* Camera Scanning Modal */}
      {isCameraActive && (
        <div className="pos-modal-overlay">
          <div className="pos-modal">
            <div className="pos-modal__header">
              <h3 className="pos-modal__title">Camera Barcode Scanner</h3>
              <button onClick={stopCamera} className="modal-close" aria-label="Close camera">
                &times;
              </button>
            </div>

            <div className="pos-modal__body">
              {cameraError ? (
                <div className="form-server-error">{cameraError}</div>
              ) : (
                <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                  <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
                  <div style={{ position: 'absolute', inset: '16px', border: '2px dashed var(--color-denim)', borderRadius: 'var(--radius-sm)', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="badge badge--denim">Align Barcode Here</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pos-modal__footer">
              <button type="button" onClick={stopCamera} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
