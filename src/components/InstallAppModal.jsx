import React, { useEffect, useState } from 'react';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
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

function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|Snapchat|Messenger/i.test(ua);
}

/**
 * Install modal with platform options:
 * - Android / Desktop — native Install when available + Add to Home Screen
 * - iPhone / iPad — Add to Home Screen primary action (Safari)
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
  const ios = isIosDevice();
  const inApp = isInAppBrowser();
  const defaultTab = ios ? 'ios' : 'android';
  const [tab, setTab] = useState(defaultTab);
  const [installing, setInstalling] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [androidHint, setAndroidHint] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(isIosDevice() ? 'ios' : 'android');
    setShowIosGuide(false);
    setAndroidHint(false);
  }, [open]);

  useCloseOnHistoryBack(!!open, onClose, 'installAppModal');

  if (!open) return null;

  const handleNative = async () => {
    if (!onNativeInstall) {
      setAndroidHint(true);
      return;
    }
    setInstalling(true);
    try {
      await onNativeInstall();
    } finally {
      setInstalling(false);
    }
  };

  const openLiveInSafariHint = () => {
    // Best we can do from in-app browsers: open live URL (user then uses Safari Share)
    window.open(liveUrl, '_blank', 'noopener,noreferrer');
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
        <p className="iam-lead">Install DKMerch on your device — open it like a normal app.</p>

        <div className="iam-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`iam-tab ${tab === 'android' ? 'active' : ''}`}
            aria-selected={tab === 'android'}
            onClick={() => { setTab('android'); setShowIosGuide(false); }}
          >
            <i className="fas fa-mobile-alt" aria-hidden="true" /> Android / Desktop
          </button>
          <button
            type="button"
            role="tab"
            className={`iam-tab ${tab === 'ios' ? 'active' : ''}`}
            aria-selected={tab === 'ios'}
            onClick={() => { setTab('ios'); setAndroidHint(false); }}
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

        {inApp && (
          <div className="iam-live-warn">
            <p>
              Open DKMerch in {ios ? 'Safari' : 'Chrome'} (not Messenger / Instagram) to install properly.
            </p>
            <button type="button" className="iam-live-link iam-live-link-btn" onClick={openLiveInSafariHint}>
              <i className="fas fa-external-link-alt" aria-hidden="true" />
              Open live site
            </button>
          </div>
        )}

        {tab === 'android' ? (
          <div className="iam-panel">
            <div className="iam-actions">
              <button
                type="button"
                className="iam-install-native"
                onClick={handleNative}
                disabled={installing || needsLiveSite}
              >
                {installing
                  ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Installing…</>
                  : <><i className="fas fa-download" aria-hidden="true" /> Install DKMerch</>}
              </button>
              <button
                type="button"
                className="iam-add-home"
                onClick={() => setAndroidHint(true)}
              >
                <i className="fas fa-plus-square" aria-hidden="true" /> Add to Home Screen
              </button>
            </div>
            {(androidHint || !canNativeInstall) && (
              <p className="iam-hint">
                {canNativeInstall
                  ? 'Or use Chrome menu → Install app / Add to Home screen.'
                  : 'Tap Install when Chrome offers it, or use the browser menu → Install app / Add to Home screen.'}
              </p>
            )}
          </div>
        ) : (
          <div className="iam-panel">
            <div className="iam-actions">
              <button
                type="button"
                className="iam-install-native iam-install-ios"
                onClick={() => setShowIosGuide(true)}
              >
                <i className="fas fa-plus-square" aria-hidden="true" /> Add to Home Screen
              </button>
              <a
                className="iam-add-home"
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-safari" aria-hidden="true" /> Open in Safari
              </a>
            </div>

            {showIosGuide && (
              <div className="iam-ios-guide">
                <p className="iam-ios-guide-title">Quick steps in Safari</p>
                <ol className="iam-steps">
                  <li>Tap <strong>Share</strong> <span className="iam-share-glyph" aria-hidden="true">⎋</span></li>
                  <li>Tap <strong>Add to Home Screen</strong></li>
                  <li>Tap <strong>Add</strong></li>
                </ol>
              </div>
            )}
          </div>
        )}

        <button type="button" className="iam-done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
