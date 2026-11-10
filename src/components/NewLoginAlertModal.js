import React, { useState } from "react";
import { createPortal } from "react-dom";
import { isMobileDeviceLabel } from "../utils/deviceInfo";
import { getOverlayRoot } from "../utils/scrollLock";
import "./NewLoginAlertModal.css";

function formatWhen(at) {
  if (!at) return "";
  try {
    return new Date(at).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(at).toLocaleString();
  }
}

/**
 * Facebook-style prompt when this account signed in on another device.
 * Yes → allow other device; stay signed in here
 * No  → block other login; stay signed in here
 */
const NewLoginAlertModal = ({ alert, onConfirmYes, onConfirmNo }) => {
  const [busy, setBusy] = useState(null); // 'yes' | 'no' | null
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // 'yes' | 'no' | null

  if (!alert) return null;

  const deviceName = alert.deviceName || "Unknown device";
  const location = alert.location || "Unknown location";
  const when = formatWhen(alert.at);
  const mobile = isMobileDeviceLabel(deviceName, alert.platform || "");

  const run = async (kind) => {
    if (busy || done) return;
    setBusy(kind);
    setError("");
    try {
      if (kind === "yes") await onConfirmYes?.();
      else await onConfirmNo?.();
      setDone(kind);
      setBusy(null);
    } catch (err) {
      setError(String(err?.message || err || "Something went wrong.").slice(0, 160));
      setBusy(null);
    }
  };

  const portalTarget = getOverlayRoot() || document.body;

  // Confirmation after Yes / No
  if (done === "yes") {
    return createPortal(
      <div className="nla-overlay" role="presentation">
        <div className="nla-modal" role="alertdialog" aria-modal="true" aria-labelledby="nla-ok-title">
          <div className="nla-icon" aria-hidden="true">
            <i className="fas fa-check" />
          </div>
          <h2 id="nla-ok-title" className="nla-title">Login approved</h2>
          <p className="nla-desc">
            Your account successfully opened on <strong>{deviceName}</strong>
            {location ? <> ({location})</> : null}.
          </p>
          <p className="nla-desc" style={{ marginTop: -8 }}>
            You’re still signed in on this device.
          </p>
          <div className="nla-actions">
            <button
              type="button"
              className="nla-btn nla-btn-yes"
              onClick={() => onConfirmYes?.({ dismiss: true })}
            >
              OK
            </button>
          </div>
        </div>
      </div>,
      portalTarget
    );
  }

  if (done === "no") {
    return createPortal(
      <div className="nla-overlay" role="presentation">
        <div className="nla-modal" role="alertdialog" aria-modal="true" aria-labelledby="nla-block-title">
          <div className="nla-icon" aria-hidden="true">
            <i className="fas fa-shield-alt" />
          </div>
          <h2 id="nla-block-title" className="nla-title">Login blocked</h2>
          <p className="nla-desc">
            That sign-in on <strong>{deviceName}</strong> was denied. You’re still logged in here.
          </p>
          <div className="nla-actions">
            <button
              type="button"
              className="nla-btn nla-btn-yes"
              onClick={() => onConfirmNo?.({ dismiss: true })}
            >
              OK
            </button>
          </div>
        </div>
      </div>,
      portalTarget
    );
  }

  return createPortal(
    <div className="nla-overlay" role="presentation">
      <div
        className="nla-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nla-title"
        aria-describedby="nla-desc"
      >
        <div className="nla-icon" aria-hidden="true">
          <i className="fas fa-shield-alt" />
        </div>
        <h2 id="nla-title" className="nla-title">New login to your account</h2>
        <p id="nla-desc" className="nla-desc">
          Someone is trying to sign in to your DKMerch account on another device.
          They won’t get in until you confirm. Was this you?
        </p>

        <div className="nla-card">
          <div className="nla-row">
            <i className={`fas ${mobile ? "fa-mobile-alt" : "fa-laptop"}`} aria-hidden="true" />
            <div>
              <div className="nla-label">Device</div>
              <div className="nla-value">{deviceName}</div>
            </div>
          </div>
          <div className="nla-row">
            <i className="fas fa-map-marker-alt" aria-hidden="true" />
            <div>
              <div className="nla-label">Approx. location</div>
              <div className="nla-value">{location}</div>
            </div>
          </div>
          {when && (
            <div className="nla-row">
              <i className="fas fa-clock" aria-hidden="true" />
              <div>
                <div className="nla-label">When</div>
                <div className="nla-value">{when}</div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="nla-error">{error}</div>}

        <div className="nla-actions">
          <button
            type="button"
            className="nla-btn nla-btn-yes"
            disabled={!!busy}
            onClick={() => run("yes")}
          >
            {busy === "yes" ? "Saving…" : "Yes, it's me"}
          </button>
          <button
            type="button"
            className="nla-btn nla-btn-no"
            disabled={!!busy}
            onClick={() => run("no")}
          >
            {busy === "no" ? "Securing…" : "No, that's not me"}
          </button>
        </div>
        <p className="nla-hint">
          Yes lets the other device sign in while you stay logged in here. No blocks that login.
        </p>
      </div>
    </div>,
    portalTarget
  );
};

export default NewLoginAlertModal;
