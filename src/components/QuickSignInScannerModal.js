import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useConfirm } from '../context/ConfirmContext';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import './WaybillScannerModal.css';

/** Format typed code as ABCD-EFGH while typing. */
function formatQuickSignInInput(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

function extractQuickSignInToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get('qsi') || url.searchParams.get('token');
    if (fromQuery) return fromQuery.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  } catch { /* not a URL */ }

  const qsiMatch = text.match(/[?&]qsi=([^&\s#]+)/i);
  if (qsiMatch?.[1]) {
    return decodeURIComponent(qsiMatch[1]).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed?.t === 'qsi' && parsed?.token) {
      return String(parsed.token).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    if (parsed?.token) {
      return String(parsed.token).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
  } catch { /* not JSON */ }

  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z0-9]{6,16}$/.test(cleaned)) return cleaned;
  return null;
}

/**
 * Customer Settings — scan desktop Quick Sign In QR to log that browser into this account.
 */
const QuickSignInScannerModal = ({ onClose, onScan, accountLabel = 'this account' }) => {
  const { confirm } = useConfirm();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const busyRef = useRef(false);
  const cooldownRef = useRef(0);
  const [error, setError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [scanning, setScanning] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [watchToken, setWatchToken] = useState('');
  const closedRef = useRef(false);

  useCloseOnHistoryBack(true, onClose, 'quickSignInScanner');

  const watchedSession = useQuery(
    api.quickSignIn.getSession,
    success && watchToken ? { token: watchToken } : 'skip'
  );

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const handleDetected = useCallback(async (raw) => {
    if (busyRef.current || success) return;
    if (Date.now() < cooldownRef.current) return;
    const token = extractQuickSignInToken(raw);
    if (!token) {
      setError('Could not read a Quick Sign In code. Try again or paste the code.');
      return;
    }
    busyRef.current = true;
    setError('');
    try {
      const ok = await confirm({
        title: 'Approve desktop login?',
        message: `Sign in the desktop browser as ${accountLabel}?\n\nOnly continue if you opened Quick Sign In on your own computer.`,
        confirmLabel: 'Sign in desktop',
        cancelLabel: 'Cancel',
        variant: 'primary',
        icon: 'fa-desktop',
      });
      if (!ok) {
        cooldownRef.current = Date.now() + 800;
        return;
      }

      setSubmitting(true);
      const result = await onScan(token);
      if (!result?.success) {
        setError(result?.error || 'Could not approve this QR. Generate a new one on desktop.');
        cooldownRef.current = Date.now() + 1500;
        return;
      }
      setWatchToken(token);
      setSuccess(true);
      stopCamera();
    } catch (err) {
      setError(err?.message || 'Scan failed. Try again.');
      cooldownRef.current = Date.now() + 1500;
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [onScan, stopCamera, success, confirm, accountLabel]);

  // Close scanner when desktop finishes login (consumed), or shortly after approve
  useEffect(() => {
    if (!success || closedRef.current) return undefined;
    const status = watchedSession?.status;
    const desktopDone = status === 'consumed';
    const approvedFallback = status === 'approved';
    if (!desktopDone && !approvedFallback) {
      // Fallback if desktop never updates — still close so phone isn't stuck
      const t = setTimeout(() => {
        if (closedRef.current) return;
        closedRef.current = true;
        onClose?.();
      }, 4000);
      return () => clearTimeout(t);
    }
    const delay = desktopDone ? 250 : 900;
    const t = setTimeout(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onClose?.();
    }, delay);
    return () => clearTimeout(t);
  }, [success, watchedSession?.status, onClose]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      setError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera not supported. Paste the code from the desktop QR instead.');
        setScanning(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
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
          setError('Live QR scan isn’t supported in this browser. Paste the code manually.');
          return;
        }

        let detector;
        try {
          detector = new Detector({ formats: ['qr_code'] });
        } catch {
          detector = new Detector();
        }

        const tick = async () => {
          if (cancelled || !streamRef.current || success) return;
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
          } catch { /* keep scanning */ }
          if (!cancelled && streamRef.current && !success) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('Camera access denied. Allow camera, or paste the code manually.');
          setScanning(false);
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [handleDetected, stopCamera, success]);

  const submitManual = async (e) => {
    e.preventDefault();
    const token = extractQuickSignInToken(manualToken) || manualToken.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!token) {
      setError('Enter the code shown under the desktop QR.');
      return;
    }
    await handleDetected(token);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="wb-scan-overlay" onClick={handleClose}>
      <div className="wb-scan-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wb-scan-close" onClick={handleClose} aria-label="Close">
          <i className="fas fa-times" />
        </button>
        <h3 className="wb-scan-title"><i className="fas fa-qrcode"></i> Quick Sign In</h3>
        <p className="wb-scan-sub">
          Scan the QR on your desktop login to sign that browser into this account.
        </p>

        {success ? (
          <div className="wb-scan-error" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
            <i className="fas fa-check-circle"></i>
            <div>
              <strong>
                {watchedSession?.status === 'consumed' ? 'Desktop signed in!' : 'Approved — waiting for desktop…'}
              </strong>
              <span> Closing…</span>
            </div>
          </div>
        ) : (
          <>
            <div className={`wb-scan-viewport ${cameraReady ? 'ready' : ''}`}>
              <video ref={videoRef} playsInline muted autoPlay className="wb-scan-video" />
              {scanning && <div className="wb-scan-frame" />}
              {!cameraReady && scanning && (
                <div className="wb-scan-loading"><i className="fas fa-spinner fa-spin"></i> Opening camera…</div>
              )}
            </div>

            {error && (
              <div className="wb-scan-error" role="alert">
                <i className="fas fa-exclamation-circle"></i>
                <div><span>{error}</span></div>
              </div>
            )}

            <form className="wb-scan-manual" onSubmit={submitManual}>
              <label htmlFor="qsi-manual">Or paste desktop code</label>
              <div className="wb-scan-manual-row">
                <input
                  id="qsi-manual"
                  value={manualToken}
                  onChange={(e) => setManualToken(formatQuickSignInInput(e.target.value))}
                  placeholder="e.g. ABCD-EFGH"
                  autoComplete="off"
                  inputMode="text"
                  maxLength={9}
                  spellCheck={false}
                  disabled={submitting}
                />
                <button type="submit" className="wb-scan-submit" disabled={submitting || !manualToken.trim()}>
                  {submitting ? <i className="fas fa-spinner fa-spin"></i> : 'Continue'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default QuickSignInScannerModal;
