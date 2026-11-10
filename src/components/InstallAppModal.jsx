import React from 'react';
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
 * Shared install modal:
 * - iPhone/iPad: Add to Home Screen guide (Safari only)
 * - If opened via LAN IP / http: force live HTTPS site first so the icon is not an IP shortcut
 */
export default function InstallAppModal({ open, onClose, title = 'Install DKMerch' }) {
  if (!open) return null;

  const needsLiveSite = isInsecureInstallHost();
  const liveUrl = PRODUCTION_SITE_URL.replace(/\/$/, '');

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

        {needsLiveSite ? (
          <>
            <p className="iam-lead">
              You’re on a local/IP address right now. Adding to Home Screen from here only creates a Safari shortcut to that IP.
            </p>
            <p className="iam-lead">
              Open the live site first, then install from Safari:
            </p>
            <a className="iam-live-link" href={liveUrl} target="_blank" rel="noopener noreferrer">
              <i className="fas fa-external-link-alt" aria-hidden="true" />
              {liveUrl.replace(/^https?:\/\//, '')}
            </a>
            <ol className="iam-steps">
              <li>Open the link above in <strong>Safari</strong> (not Chrome).</li>
              <li>Tap the <strong>Share</strong> button <span className="iam-share-glyph" aria-hidden="true">⎋</span>.</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>.</li>
            </ol>
          </>
        ) : (
          <>
            <p className="iam-lead">
              iPhone can’t download an APK — install DKMerch as an app from Safari:
            </p>
            <ol className="iam-steps">
              <li>Make sure you’re in <strong>Safari</strong> (not Chrome / Instagram / Facebook browser).</li>
              <li>Tap the <strong>Share</strong> button <span className="iam-share-glyph" aria-hidden="true">⎋</span> at the bottom.</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> — it opens full-screen like an app (no Safari bar).</li>
            </ol>
            <p className="iam-hint">
              Tip: if Share doesn’t show “Add to Home Screen”, open this page in Safari first:
              {' '}
              <a href={liveUrl}>{liveUrl.replace(/^https?:\/\//, '')}</a>
            </p>
          </>
        )}

        <button type="button" className="iam-done" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
