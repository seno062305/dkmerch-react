import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import {
  dismissUpdatePrompt,
  isAppOutdated,
  isUpdatePromptDismissed,
  setInstalledAppVersion,
} from '../utils/appUpdate';
import './AppUpdateModal.css';

/**
 * Soft prompt while browsing (close / Maybe later).
 * Forced on checkout / payment and when opened from email (?appUpdate=).
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

  useEffect(() => {
    if (!latest?.isActive || !latest.version) return;
    const outdated = isAppOutdated(latest.version);

    if (forcedVersion && forcedVersion === latest.version) {
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

    // Browsing: respect Maybe later / X for this session
    if (isUpdatePromptDismissed(latest.version)) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setPhase('prompt');
  }, [latest, forcedVersion, onCheckout]);

  if (!open || !latest) return null;

  const mustUpdate = onCheckout || !!(forcedVersion && forcedVersion === latest.version);

  const dismiss = () => {
    if (mustUpdate || phase === 'loading' || phase === 'done') return;
    dismissUpdatePrompt(latest.version);
    setOpen(false);
  };

  const runUpdate = async () => {
    setPhase('loading');
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (navigator.serviceWorker?.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } catch { /* ignore */ }

    await new Promise((r) => setTimeout(r, 1800));
    setInstalledAppVersion(latest.version);
    setPhase('done');

    await new Promise((r) => setTimeout(r, 1000));
    if (forcedVersion) {
      const next = new URLSearchParams(searchParams);
      next.delete('appUpdate');
      setSearchParams(next, { replace: true });
    }
    window.location.reload();
  };

  return (
    <div className="aum-overlay" role="dialog" aria-modal="true">
      <div className="aum-modal">
        {phase === 'prompt' && !mustUpdate && (
          <button type="button" className="aum-close" onClick={dismiss} aria-label="Close">
            <i className="fas fa-times" />
          </button>
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
            <h2>Update complete</h2>
            <p className="aum-msg">Restarting the app…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AppUpdateModal;
