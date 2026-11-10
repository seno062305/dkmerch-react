import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import './AppUpdateModal.css';

const LS_KEY = 'dkmerch_app_version';

const AppUpdateModal = () => {
  const latest = useQuery(api.appUpdates.getLatestUpdate);
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('prompt'); // prompt | loading | done
  const forcedVersion = searchParams.get('appUpdate');

  useEffect(() => {
    if (!latest?.isActive || !latest.version) return;
    const installed = localStorage.getItem(LS_KEY) || '';
    if (forcedVersion && forcedVersion === latest.version) {
      setOpen(true);
      setPhase('prompt');
      return;
    }
    if (installed !== latest.version) {
      setOpen(true);
      setPhase('prompt');
    }
  }, [latest, forcedVersion]);

  if (!open || !latest) return null;

  const runUpdate = async () => {
    setPhase('loading');
    // Simulate apply + refresh service worker / caches
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
    localStorage.setItem(LS_KEY, latest.version);
    setPhase('done');

    await new Promise((r) => setTimeout(r, 1200));
    if (forcedVersion) {
      const next = new URLSearchParams(searchParams);
      next.delete('appUpdate');
      setSearchParams(next, { replace: true });
    }
    // Soft restart
    window.location.reload();
  };

  return (
    <div className="aum-overlay" role="dialog" aria-modal="true">
      <div className="aum-modal">
        {phase === 'prompt' && (
          <>
            <div className="aum-icon">📲</div>
            <h2>Update available</h2>
            <p className="aum-title">{latest.title}</p>
            <p className="aum-msg">{latest.message}</p>
            <p className="aum-ver">Version {latest.version}</p>
            <button type="button" className="aum-btn" onClick={runUpdate}>
              Update now
            </button>
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
