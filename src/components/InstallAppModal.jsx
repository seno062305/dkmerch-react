import React, { useState } from 'react';
import './InstallAppModal.css';

export const PRODUCTION_SITE_URL =
  process.env.REACT_APP_SITE_URL || 'https://dkmerchwebsite.vercel.app';

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  );
}

/** True when current page is localhost or a raw LAN IP — home-screen shortcuts will open that IP. */
export function isInsecureInstallHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return window.location.protocol === 'http:' && host !== 'localhost';
}

/**
 * Install modal with platform options:
 * - Android / Desktop (Chrome) — native install when available
 * - iPhone / iPad — Safari Add to Home Screen steps only
 */
export default function InstallAppModal({
  open,
  onClose,
  title = 'Install DKMerch',
  canNativeInstall = false,
  onNativeInstall,
}) {
  const needsLiveSite = isInsecureInstallHost();
  const liveUrl = PRODUCTION_SITE_URL.replace(/\/$/, '');
  const defaultTab = isIosDevice() ? 'ios' : 'android';
  const [tab, setTab] = useState(defaultTab);
  const [installing, setInstalling] = useState(false);

  if (!open) return null;

  const handleNative = async () => {
    if (!onNativeInstall) return;
    setInstalling(true);
    try {
      await onNativeInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="iam-overlay" onClick={onClose} role="presentation">
      <div className="iam-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="iam-title">
        <button type="button" className="iam-close" onClick={onClose} aria-label="Close">
          <i className="fas fa-times" aria-hidden="true" />
        </button>

        <div className="iam-icon-wrap">
          <img src="/images/dklogo2-removebg-preview.png" alt="" />
        </div>
        <h3 id="iam-title">{title}</h3>
        <p className="iam-lead">Choose your device — install DKMerch like an app.</p>

        <div className="iam-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`iam-tab ${tab === 'android' ? 'active' : ''}`}
            aria-selected={tab === 'android'}
            onClick={() => setTab('android')}
          >
            <i className="fas fa-mobile-alt" aria-hidden="true" /> Android / Desktop
          </button>
          <button
            type="button"
            role="tab"
            className={`iam-tab ${tab === 'ios' ? 'active' : ''}`}
            aria-selected={tab === 'ios'}
            onClick={() => setTab('ios')}
          >
            <i className="fab fa-apple" aria-hidden="true" /> iPhone / iPad
          </button>
        </div>

        {needsLiveSite && (
          <div className="iam-live-warn">
            <p>
              You’re on a local/IP address. Open the live site first so the home-screen icon is not an IP shortcut:
            </p>
            <a className="iam-live-link" href={liveUrl} target="_blank" rel="noopener noreferrer">
              <i className="fas fa-external-link-alt" aria-hidden="true" />
              {liveUrl.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}

        {tab === 'android' ? (
          <div className="iam-panel">
            <p className="iam-lead">
              On Chrome (Android or desktop), tap install below. If the button is unavailable, use the browser menu.
            </p>
            {canNativeInstall && !needsLiveSite ? (
              <button type="button" className="iam-install-native" onClick={handleNative} disabled={installing}>
                {installing
                  ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Installing…</>
                  : <><i className="fas fa-download" aria-hidden="true" /> Install DKMerch</>}
              </button>
            ) : (
              <ol className="iam-steps">
                <li>Open this site in <strong>Chrome</strong>.</li>
                <li>Tap the <strong>☰ menu</strong> (or address-bar install icon).</li>
                <li>Choose <strong>Install app</strong> / <strong>Add to Home screen</strong>.</li>
                <li>Confirm — DKMerch opens like a normal app.</li>
              </ol>
            )}
          </div>
        ) : (
          <div className="iam-panel">
            <p className="iam-lead">
              iPhone can’t use the Chrome install button — use <strong>Safari</strong> only:
            </p>
            <ol className="iam-steps">
              <li>Open this page in <strong>Safari</strong> (not Chrome / Instagram / Facebook).</li>
              <li>Tap the <strong>Share</strong> button <span className="iam-share-glyph" aria-hidden="true">⎋</span> at the bottom.</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> — it opens full-screen with no Safari bar.</li>
            </ol>
            <p className="iam-hint">
              Tip: if you don’t see “Add to Home Screen”, open{' '}
              <a href={liveUrl}>{liveUrl.replace(/^https?:\/\//, '')}</a>
              {' '}in Safari first.
            </p>
          </div>
        )}

        <button type="button" className="iam-done" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
