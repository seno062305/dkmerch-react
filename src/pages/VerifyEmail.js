// src/pages/VerifyEmail.js
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import "./VerifyEmail.css";

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const verifyEmail = useMutation(api.users.verifyEmailAndCreateUser);

  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "expired" | "error"
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("No verification token found. Please register again.");
      return;
    }

    verifyEmail({ token })
      .then((result) => {
        if (result.success) {
          setStatus("success");
          setMessage("Your email has been verified! Your account is now active.");
        } else if (result.expired) {
          setStatus("expired");
          setMessage(result.message || "Verification link has expired.");
        } else {
          setStatus("error");
          setMessage(result.message || "Verification failed. Please try again.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown redirect on success
  useEffect(() => {
    if (status !== "success") return;
    if (countdown <= 0) {
      navigate("/", { replace: true });
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, countdown, navigate]);

  return (
    <div className="verify-email-page">
      <div className="verify-email-card">
        {/* DKMerch Logo/Brand */}
        <div className="verify-email-brand">
          <div className="verify-email-logo">DKMerch</div>
          <div className="verify-email-tagline">K-Pop Paradise</div>
        </div>

        {/* Status Content */}
        {status === "verifying" && (
          <div className="verify-email-body">
            <div className="verify-spinner-wrapper">
              <div className="verify-spinner" />
            </div>
            <h2 className="verify-email-title">Verifying your email...</h2>
            <p className="verify-email-subtitle">Please wait a moment.</p>
          </div>
        )}

        {status === "success" && (
          <div className="verify-email-body verify-success">
            <div className="verify-icon-circle verify-icon-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="verify-email-title">Email Verified! 🎉</h2>
            <p className="verify-email-subtitle">{message}</p>
            <div className="verify-redirect-notice">
              Redirecting to homepage in <strong>{countdown}s</strong>...
            </div>
            <div className="verify-progress-bar">
              <div
                className="verify-progress-fill"
                style={{ width: `${((5 - countdown) / 5) * 100}%` }}
              />
            </div>
            <button
              className="verify-btn verify-btn-primary"
              onClick={() => navigate("/", { replace: true })}
            >
              Go to Homepage Now →
            </button>
          </div>
        )}

        {status === "expired" && (
          <div className="verify-email-body verify-warning">
            <div className="verify-icon-circle verify-icon-warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="verify-email-title">Link Expired ⏱</h2>
            <p className="verify-email-subtitle">{message}</p>
            <div className="verify-info-box verify-info-warning">
              Verification links expire after <strong>24 hours</strong>.
              Please register again to get a new link.
            </div>
            <button
              className="verify-btn verify-btn-primary"
              onClick={() => navigate("/", { replace: true })}
            >
              Back to Homepage
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="verify-email-body verify-error">
            <div className="verify-icon-circle verify-icon-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="verify-email-title">Verification Failed ❌</h2>
            <p className="verify-email-subtitle">{message}</p>
            <div className="verify-info-box verify-info-error">
              If you already verified your account, try logging in directly.
            </div>
            <button
              className="verify-btn verify-btn-primary"
              onClick={() => navigate("/", { replace: true })}
            >
              Back to Homepage
            </button>
          </div>
        )}

        <div className="verify-email-footer">
          © 2026 DKMerch · K-Pop Paradise
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;