import React, { useCallback, useEffect, useRef, useState } from 'react';
import './WaybillScannerModal.css';

function extractOrderId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get('order');
    if (fromQuery) return fromQuery.trim();
  } catch {
    /* not a URL */
  }
  const match = text.match(/[?&]order=([^&\s#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]).trim();
  if (/^[A-Za-z0-9_-]{6,}$/.test(text)) return text;
  return null;
}

/**
 * Built-in waybill scanner for riders.
 * Uses device camera + BarcodeDetector when available; always allows manual order ID entry.
 * Screen and printed QRs are both accepted — order ID must still match the selected Available order.
 */
const normalizeScanResult = (result) => {
  if (result === true) return { ok: true };
  if (result === false) {
    return {
      ok: false,
      reason: 'mismatch',
      message: 'QR mismatch — this waybill does not match the selected order. Order was not accepted.',
    };
  }
  if (result && typeof result === 'object') {
    return {
      ok: !!result.ok,
      reason: result.reason || (result.ok ? 'ok' : 'error'),
      message: result.message || '',
    };
  }
  return { ok: false, reason: 'error', message: 'Could not verify this waybill.' };
};

const WaybillScannerModal = ({ onClose, onScan, hint }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const busyRef = useRef(false);
  const cooldownRef = useRef(0);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState(''); // 'mismatch' | 'cancelled' | 'error' | ''
  const [manualId, setManualId] = useState('');
  const [scanning, setScanning] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const handleDetected = useCallback(async (raw) => {
    if (busyRef.current) return;
    if (Date.now() < cooldownRef.current) return;
    const orderId = extractOrderId(raw);
    if (!orderId) {
      setErrorKind('error');
      setError('Could not read an order ID from that code. Try again or enter it manually.');
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    setError('');
    setErrorKind('');
    try {
      const result = normalizeScanResult(await onScan(orderId));
      if (!result.ok) {
        const kind = result.reason === 'mismatch' ? 'mismatch' : result.reason === 'cancelled' ? 'cancelled' : 'error';
        setErrorKind(kind);
        setError(
          result.message ||
          (kind === 'mismatch'
            ? 'QR mismatch — this waybill does not match the selected order. Order was not accepted.'
            : 'Order was not accepted.')
        );
        cooldownRef.current = Date.now() + (kind === 'mismatch' ? 2500 : 1200);
        return;
      }
      stopCamera();
    } catch (err) {
      setErrorKind('error');
      setError(err?.message || 'Scan failed. Try again.');
      cooldownRef.current = Date.now() + 1500;
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [onScan, stopCamera]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      setError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera not supported on this device. Enter the order ID manually.');
        setScanning(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }

        const Detector = window.BarcodeDetector;
        if (!Detector) {
          setError('Live QR scan isn’t supported in this browser. Point a photo at the waybill or type the order ID.');
          return;
        }

        let detector;
        try {
          detector = new Detector({ formats: ['qr_code'] });
        } catch {
          detector = new Detector();
        }

        const tick = async () => {
          if (cancelled || !streamRef.current) return;
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) {
              const value = codes[0].rawValue || codes[0].rawData || '';
              if (value) await handleDetected(String(value));
            }
          } catch {
            /* keep scanning */
          }
          if (!cancelled && streamRef.current) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('Camera access denied. Allow camera permission, or enter the order ID manually.');
          setScanning(false);
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [handleDetected, stopCamera]);

  const submitManual = async (e) => {
    e.preventDefault();
    const orderId = extractOrderId(manualId) || manualId.trim();
    if (!orderId) {
      setErrorKind('error');
      setError('Enter a valid order ID from the waybill.');
      return;
    }
    setSubmitting(true);
    setError('');
    setErrorKind('');
    try {
      const result = normalizeScanResult(await onScan(orderId));
      if (!result.ok) {
        const kind = result.reason === 'mismatch' ? 'mismatch' : result.reason === 'cancelled' ? 'cancelled' : 'error';
        setErrorKind(kind);
        setError(
          result.message ||
          (kind === 'mismatch'
            ? 'QR mismatch — this waybill does not match the selected order. Order was not accepted.'
            : 'Order was not accepted.')
        );
        return;
      }
      stopCamera();
    } catch (err) {
      setErrorKind('error');
      setError(err?.message || 'Verify failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="wb-scan-overlay" onClick={handleClose}>
      <div className="wb-scan-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="wb-scan-close" onClick={handleClose} aria-label="Close">
          &times;
        </button>
        <h3 className="wb-scan-title"><i className="fas fa-qrcode"></i> Scan Waybill</h3>
        <p className="wb-scan-sub">
          {hint || 'Point your camera at the waybill QR (printed or on screen). Wrong order QR = mismatch.'}
        </p>

        <div className={`wb-scan-viewport ${cameraReady ? 'ready' : ''}`}>
          <video ref={videoRef} playsInline muted autoPlay className="wb-scan-video" />
          {scanning && <div className="wb-scan-frame" />}
          {!cameraReady && scanning && (
            <div className="wb-scan-loading"><i className="fas fa-spinner fa-spin"></i> Opening camera…</div>
          )}
        </div>

        {error && (
          <div
            className={`wb-scan-error ${
              errorKind === 'mismatch' ? 'wb-scan-error--mismatch'
                : errorKind === 'cancelled' ? 'wb-scan-error--cancelled'
                : ''
            }`}
            role="alert"
          >
            <i className={`fas ${
              errorKind === 'mismatch' ? 'fa-times-circle'
                : errorKind === 'cancelled' ? 'fa-hand-paper'
                : 'fa-exclamation-circle'
            }`}></i>
            <div>
              {errorKind === 'mismatch' && (
                <strong className="wb-scan-error-title">Mismatch — wrong QR / item</strong>
              )}
              {errorKind === 'cancelled' && (
                <strong className="wb-scan-error-title">Accept cancelled</strong>
              )}
              <span>{error}</span>
            </div>
          </div>
        )}

        <form className="wb-scan-manual" onSubmit={submitManual}>
          <label htmlFor="wb-manual-id">Or enter Order ID</label>
          <div className="wb-scan-manual-row">
            <input
              id="wb-manual-id"
              value={manualId}
              onChange={e => setManualId(e.target.value)}
              placeholder="Full ID or last 8 characters"
              autoComplete="off"
              disabled={submitting}
            />
            <button type="submit" className="wb-scan-submit" disabled={submitting || !manualId.trim()}>
              {submitting ? <i className="fas fa-spinner fa-spin"></i> : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WaybillScannerModal;
