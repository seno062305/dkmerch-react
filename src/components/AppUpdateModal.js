import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import {
  clearUpdatePromptDismiss,
  dismissUpdatePrompt,
  isAppOutdated,
  isUpdatePromptDismissed,
  markKeepSessionAfterUpdate,
  setInstalledAppVersion,
} from '../utils/appUpdate';
import './AppUpdateModal.css';

/**
 * Soft prompt while browsing (close / Maybe later — persists across reloads).
 * Forced on checkout / payment and when opened from email (?appUpdate=).
 * Cart / wishlist / auth live in Convex + localStorage — update never clears those.
 */
const AppUpdateModal = ({ force = false }) => {
  const latest = useQuery(api.appUpdates.getLatestUpdate);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('prompt'); // prompt | loading | done
  const forcedVersion = searchParams.get('appUpdate');
  const onCheckout =
    force ||
    location.pathname.startsWith('/checkout') ||
    location.pathname.startsWith('/order-success');

  const clearForcedParam = () => {
    if (!forcedVersion) return;
    try {
      const next = new URLSearchParams(searchParams);
      next.delete('appUpdate');
      setSearchParams(next, { replace: true });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!latest?.isActive || !latest.version) return;
    const outdated = isAppOutdated(latest.version);
    const fromNotif =
      !!(forcedVersion && (forcedVersion === latest.version || forcedVersion === '1'));

    // Opened from notification / email
    if (fromNotif) {
      if (!outdated) {
        // Already on latest — show success, never re-prompt Update now
        setOpen(true);
        setPhase('already');
        return;
      }
      try { clearUpdatePromptDismiss(latest.version); } catch { /* ignore */ }
      setOpen(true);
      setPhase('prompt');
      return;
    }

    if (!outdated) {
      setOpen(false);
      return;
    }

    // Checkout / payment: always force update
    if (onCheckout) {
      setOpen(true);
      setPhase('prompt');
      return;
    }

    // Browsing: respect Maybe later / X (localStorage — survives reload)
    if (isUpdatePromptDismissed(latest.version)) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setPhase('prompt');
  }, [latest, forcedVersion, onCheckout]);

  if (!open || !latest) return null;

  const outdatedNow = isAppOutdated(latest.version);
  const mustUpdate =
    outdatedNow
    && (
      onCheckout
      || !!(forcedVersion && (forcedVersion === latest.version || forcedVersion === '1'))
    );

  const dismiss = () => {
    if (mustUpdate || phase === 'loading' || phase === 'done') return;
    if (phase === 'already') {
      setOpen(false);
      clearForcedParam();
      return;
    }
    dismissUpdatePrompt(latest.version);
    setOpen(false);
    clearForcedParam();
  };

  const runUpdate = async () => {
    setPhase('loading');
    // Mark version first so reload does not re-prompt; keep cart/local data intact
    setInstalledAppVersion(latest.version);
    clearUpdatePromptDismiss(latest.version);
    // Keep customer / admin / rider signed in across reload + SW claim
    markKeepSessionAfterUpdate();

    try {
      if (navigator.serviceWorker?.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
      // Refresh app shell cache only — do not wipe storage / IndexedDB / localStorage
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => String(k).startsWith('dkmerch-'))
            .map((k) => caches.delete(k))
        );
      }
    } catch { /* ignore */ }

    // Re-stamp right before reload in case SW install cleared sessionStorage
    markKeepSessionAfterUpdate();

    await new Promise((r) => setTimeout(r, 1200));
    setPhase('done');

    await new Promise((r) => setTimeout(r, 700));
    clearForcedParam();
    markKeepSessionAfterUpdate();
    window.location.reload();
  };

  return (
    <div className="aum-overlay" role="dialog" aria-modal="true">
      <div className="aum-modal">
        {(phase === 'prompt' && !mustUpdate) || phase === 'already' ? (
          <button type="button" className="aum-close" onClick={dismiss} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        ) : null}

        {phase === 'already' && (
          <>
            <div className="aum-icon">✅</div>
            <h2>Update successfully</h2>
            <p className="aum-msg">
              You&apos;re already on the latest version. No update needed.
            </p>
            <p className="aum-ver">Version {latest.version}</p>
            <button type="button" className="aum-btn" onClick={dismiss}>
              OK
            </button>
          </>
        )}

        {phase === 'prompt' && (
          <>
            <div className="aum-icon">📲</div>
            <h2>{mustUpdate ? 'Update required' : 'Update available'}</h2>
            <p className="aum-title">{latest.title}</p>
            <p className="aum-msg">{latest.message}</p>
            <p className="aum-ver">Version {latest.version}</p>
            {mustUpdate && (
              <p className="aum-force-note">
                Please update the app before continuing to payment.
              </p>
            )}
            <button type="button" className="aum-btn" onClick={runUpdate}>
              Update now
            </button>
            {!mustUpdate && (
              <button type="button" className="aum-btn-later" onClick={dismiss}>
                Maybe later
              </button>
            )}
          </>
        )}

        {phase === 'loading' && (
          <>
            <div className="aum-spinner" />
            <h2>Updating…</h2>
            <p className="aum-msg">Please wait while we apply the latest version.</p>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="aum-icon">✅</div>
            <h2>Update successfully</h2>
            <p className="aum-msg">Restarting the app…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AppUpdateModal;
