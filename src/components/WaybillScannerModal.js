import React, { useCallback, useEffect, useRef, useState } from 'react';
import './WaybillScannerModal.css';

function isScreenOnlyQrPayload(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const text = raw.trim();
  if (/[?&]src=screen\b/i.test(text)) return true;
  if (/src%3Dscreen/i.test(text)) return true;
  if (/SCREEN[-_]?ONLY|PREVIEW[-_]?ONLY/i.test(text)) return true;
  try {
    const url = new URL(text);
    if ((url.searchParams.get('src') || '').toLowerCase() === 'screen') return true;
  } catch {
    /* not a URL */
  }
  return false;
}

function extractOrderId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  // On-screen admin preview QR must never yield a usable order id
  if (isScreenOnlyQrPayload(text)) return null;
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function grabVideoFrame(video, maxW = 240) {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) return null;
  const scale = Math.min(1, maxW / vw);
  const w = Math.max(32, Math.round(vw * scale));
  const h = Math.max(32, Math.round(vh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return { canvas, ctx, w, h, imageData: ctx.getImageData(0, 0, w, h) };
}

function lumaAt(data, w, x, y) {
  const i = (y * w + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Heuristics: phone/monitor screens flicker, band, and show RGB subpixels — printed paper does not. */
function scoreScreenLikeness(frameA, frameB) {
  if (!frameA?.imageData) return { isScreen: false, score: 0 };
  const { data, width: w, height: h } = frameA.imageData;
  const dataB = frameB?.imageData?.data;

  // 1) Temporal flicker between two nearby frames (display refresh / PWM)
  let flicker = 0;
  let flickerN = 0;
  if (dataB && dataB.length === data.length) {
    for (let i = 0; i < data.length; i += 24) {
      flicker += Math.abs(data[i] - dataB[i]) + Math.abs(data[i + 1] - dataB[i + 1]) + Math.abs(data[i + 2] - dataB[i + 2]);
      flickerN += 1;
    }
    flicker = flicker / Math.max(1, flickerN);
  }

  // 2) Horizontal banding (rolling shutter on lit screens)
  const rowMean = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    let n = 0;
    for (let x = 0; x < w; x += 2) {
      s += lumaAt(data, w, x, y);
      n += 1;
    }
    rowMean[y] = s / Math.max(1, n);
  }
  let band = 0;
  for (let y = 1; y < h; y++) band += Math.abs(rowMean[y] - rowMean[y - 1]);
  const banding = band / Math.max(1, h - 1);

  // Alternating-row pattern strength (common on photographed LCDs)
  let alt = 0;
  for (let y = 2; y < h; y++) {
    alt += Math.abs((rowMean[y] - rowMean[y - 1]) - (rowMean[y - 1] - rowMean[y - 2]));
  }
  const altBand = alt / Math.max(1, h - 2);

  // 3) RGB subpixel / channel stripe imbalance
  let sub = 0;
  let subN = 0;
  for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.75); y += 2) {
    for (let x = 2; x < w - 2; x += 3) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const i2 = (y * w + x + 1) * 4;
      sub += Math.abs(r - data[i2]) + Math.abs(b - data[i2 + 2]) + Math.abs(r - g) * 0.35;
      subN += 1;
    }
  }
  const subpixel = sub / Math.max(1, subN);

  // 4) Emissive glow: many near-white pixels + low mid texture (glass/backlight)
  let bright = 0;
  let edge = 0;
  let edgeN = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const L = lumaAt(data, w, x, y);
      if (L > 235) bright += 1;
      const gx = Math.abs(L - lumaAt(data, w, x + 1, y));
      const gy = Math.abs(L - lumaAt(data, w, x, y + 1));
      edge += gx + gy;
      edgeN += 1;
    }
  }
  const brightRatio = bright / Math.max(1, (w * h) / 4);
  const edgeAvg = edge / Math.max(1, edgeN);

  // Weighted score — tuned to reject phone/monitor captures while allowing paper labels
  let score = 0;
  if (flicker > 9) score += 2.2;
  if (flicker > 16) score += 1.6;
  if (banding > 7.5) score += 1.5;
  if (altBand > 4.5) score += 1.4;
  if (subpixel > 28) score += 1.5;
  if (subpixel > 42) score += 1.2;
  if (brightRatio > 0.18 && edgeAvg < 18) score += 1.8; // bright + smooth = glass/screen
  if (brightRatio > 0.28) score += 1.0;

  return {
    isScreen: score >= 3.2,
    score,
    detail: { flicker, banding, altBand, subpixel, brightRatio, edgeAvg },
  };
}

/**
 * Returns true when the camera is likely pointed at a phone/monitor screen
 * instead of a physically printed waybill label.
 */
async function isDigitalScreenCapture(video) {
  if (!video || video.readyState < 2) return { isScreen: false, score: 0 };
  const frameA = grabVideoFrame(video);
  await sleep(48); // ~3 frames @ 60Hz — catch display refresh flicker
  const frameB = grabVideoFrame(video);
  return scoreScreenLikeness(frameA, frameB);
}

/**
 * Built-in waybill scanner for riders.
 * Uses device camera + BarcodeDetector when available; always allows manual order ID entry.
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
  const [errorKind, setErrorKind] = useState(''); // 'mismatch' | 'screen' | 'cancelled' | 'error' | ''
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
    if (isScreenOnlyQrPayload(raw)) {
      setErrorKind('screen');
      setError(
        'Screen QR blocked — this code is from an on-screen preview. Print the waybill and scan the physical label only. Order was not accepted.'
      );
      cooldownRef.current = Date.now() + 2800;
      return;
    }
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
      // Reject QR shown on phone/monitor — only printed thermal waybills are valid
      const screenCheck = await isDigitalScreenCapture(videoRef.current);
      if (screenCheck.isScreen) {
        setErrorKind('screen');
        setError(
          'Screen QR blocked — scanning from a phone or computer screen is not allowed. Print the waybill and scan the physical label only. Order was not accepted.'
        );
        cooldownRef.current = Date.now() + 2800;
        return;
      }

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
        // Prevent the same wrong QR from spamming the banner
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
          {hint || 'Point your camera at the printed waybill QR only. QR codes on phone or computer screens are blocked.'}
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
                : errorKind === 'screen' ? 'wb-scan-error--screen'
                : errorKind === 'cancelled' ? 'wb-scan-error--cancelled'
                : ''
            }`}
            role="alert"
          >
            <i className={`fas ${
              errorKind === 'mismatch' ? 'fa-times-circle'
                : errorKind === 'screen' ? 'fa-mobile-alt'
                : errorKind === 'cancelled' ? 'fa-hand-paper'
                : 'fa-exclamation-circle'
            }`}></i>
            <div>
              {errorKind === 'mismatch' && (
                <strong className="wb-scan-error-title">Mismatch — wrong QR / item</strong>
              )}
              {errorKind === 'screen' && (
                <strong className="wb-scan-error-title">Printed waybill required</strong>
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
