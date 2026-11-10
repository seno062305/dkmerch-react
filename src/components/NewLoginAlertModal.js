import React, { useState } from "react";
import { createPortal } from "react-dom";
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
 * Yes → accept & stay signed out here
 * No  → revoke the other login and restore this device
 */
const NewLoginAlertModal = ({ alert, onConfirmYes, onConfirmNo }) => {
  const [busy, setBusy] = useState(null); // 'yes' | 'no' | null
  const [error, setError] = useState("");

  if (!alert) return null;

  const deviceName = alert.deviceName || "Unknown device";
  const location = alert.location || "Unknown location";
  const when = formatWhen(alert.at);

  const run = async (kind) => {
    if (busy) return;
    setBusy(kind);
    setError("");
    try {
      if (kind === "yes") await onConfirmYes?.();
      else await onConfirmNo?.();
    } catch (err) {
      setError(String(err?.message || err || "Something went wrong.").slice(0, 160));
      setBusy(null);
    }
  };

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
            <i className="fas fa-laptop" aria-hidden="true" />
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
          Yes activates the other device and signs you out here. No blocks that login and keeps you signed in.
        </p>
      </div>
    </div>,
    document.body
  );
};

export default NewLoginAlertModal;
