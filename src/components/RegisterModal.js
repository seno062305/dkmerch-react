// src/components/RegisterModal.js
import React, { useState, useEffect, useRef } from "react";
import "./RegisterModal.css";
import { useAuth } from "../context/AuthContext";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

const RegisterModal = ({ onClose }) => {
  const { register } = useAuth();

  const [view, setView] = useState("register"); // "register" | "otp" | "forgot"

  const [formData, setFormData] = useState({
    name: "", username: "", email: "", password: "", confirmPassword: ""
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    minLength: false, hasUppercase: false, hasLowercase: false,
    hasNumber: false, hasSymbol: false
  });

  // ── OTP state ─────────────────────────────────────
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpSuccess, setOtpSuccess] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingName, setPendingName] = useState("");
  const otpRefs = useRef([]);

  // ── Forgot password state ─────────────────────────
  const [forgotEmail, setForgotEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeMsg, setCodeMsg] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [passwordCooldown, setPasswordCooldown] = useState(0);
  const [passwordAttempts, setPasswordAttempts] = useState(0);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);
  const [newPwFocused, setNewPwFocused] = useState(false);
  const [newPwValidation, setNewPwValidation] = useState({
    minLength: false, hasUppercase: false, hasLowercase: false,
    hasNumber: false, hasSymbol: false
  });

  // ── Convex mutations / actions ────────────────────
  const registerPendingUser = useMutation(api.users.registerPendingUser);
  const verifyOtpAndCreateUser = useMutation(api.users.verifyOtpAndCreateUser);
  const resendOtpMutation = useMutation(api.users.resendOtp);
  const resetPasswordByEmail = useMutation(api.users.resetPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);
  const sendRegistrationOTP = useAction(api.sendEmail.sendRegistrationOTP);

  // ── VALIDATION ───────────────────────────────────
  const gmailRegex = /^[a-zA-Z0-9._%+-]{1,25}@gmail\.com$/i;
  const isValidEmail = (email) => gmailRegex.test(email);
  const MAX_NAME_LENGTH = 20;
  const MAX_USERNAME_LENGTH = 10;

  // ── EFFECTS ──────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add("login-modal-open");
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("login-modal-open");
    };
  }, []);

  useEffect(() => {
    const p = formData.password;
    setPasswordValidation({
      minLength: p.length >= 8,
      hasUppercase: /[A-Z]/.test(p),
      hasLowercase: /[a-z]/.test(p),
      hasNumber: /[0-9]/.test(p),
      hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)
    });
  }, [formData.password]);

  useEffect(() => {
    const p = newPassword;
    setNewPwValidation({
      minLength: p.length >= 8,
      hasUppercase: /[A-Z]/.test(p),
      hasLowercase: /[a-z]/.test(p),
      hasNumber: /[0-9]/.test(p),
      hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)
    });
  }, [newPassword]);

  useEffect(() => {
    if (passwordCooldown <= 0) return;
    const t = setTimeout(() => setPasswordCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [passwordCooldown]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Auto-focus first OTP input when entering OTP view
  useEffect(() => {
    if (view === "otp") {
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  }, [view]);

  // ── HELPERS ──────────────────────────────────────
  const isPasswordValid = () => Object.values(passwordValidation).every(v => v === true);
  const isNewPwValid = () => Object.values(newPwValidation).every(v => v === true);

  const getStrength = (validation) => {
    const count = Object.values(validation).filter(v => v).length;
    if (count === 0) return { text: "", percentage: 0, color: "" };
    if (count <= 2) return { text: "Weak", percentage: 20, color: "#dc3545" };
    if (count === 3) return { text: "Fair", percentage: 40, color: "#ffc107" };
    if (count === 4) return { text: "Good", percentage: 70, color: "#17a2b8" };
    return { text: "Strong", percentage: 100, color: "#28a745" };
  };

  const strength = getStrength(passwordValidation);
  const newPwStrength = getStrength(newPwValidation);
  const showPwReqs = (passwordFocused || formData.password) && !isPasswordValid();
  const showNewPwReqs = (newPwFocused || newPassword) && !isNewPwValid();
  const passwordsMatch = formData.confirmPassword && formData.password === formData.confirmPassword;
  const newPasswordsMatch = confirmNewPassword && newPassword === confirmNewPassword;

  const getFingerprint = () => {
    return btoa([
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
    ].join("|")).slice(0, 32);
  };

  const PwToggleIcon = ({ show }) => show ? (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  );

  const PwRequirements = ({ validation }) => (
    <div className="password-requirements">
      <div className="requirements-title">Password must contain:</div>
      <div className="requirements-list">
        {[
          { key: "minLength", label: "At least 8 characters" },
          { key: "hasUppercase", label: "One uppercase letter" },
          { key: "hasLowercase", label: "One lowercase letter" },
          { key: "hasNumber", label: "One number" },
          { key: "hasSymbol", label: "One special character" },
        ].map(({ key, label }) => (
          <div key={key} className={`requirement-item ${validation[key] ? "valid" : ""}`}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              {validation[key] ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              )}
            </svg>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── OTP INPUT HANDLERS ───────────────────────────
  const handleOtpChange = (index, value) => {
    const cleaned = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleaned;
    setOtpDigits(newDigits);
    setOtpError("");

    if (cleaned && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (cleaned && index === 5) {
      const fullOtp = [...newDigits.slice(0, 5), cleaned].join("");
      if (fullOtp.length === 6) {
        handleVerifyOtp(fullOtp);
      }
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otpDigits[index]) {
        const newDigits = [...otpDigits];
        newDigits[index] = "";
        setOtpDigits(newDigits);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setOtpDigits(newDigits);
    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
    } else {
      otpRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const handleVerifyOtp = async (otpValue) => {
    const otp = otpValue || otpDigits.join("");
    if (otp.length !== 6) {
      setOtpError("Please enter the complete 6-digit code.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      const result = await verifyOtpAndCreateUser({ email: pendingEmail, otp });
      if (result.success) {
        setOtpSuccess("✅ Email verified! Your account is ready.");
        setTimeout(() => onClose(), 1500);
      } else {
        setOtpError(result.message || "Incorrect code. Please try again.");
        if (result.expired) {
          setOtpDigits(["", "", "", "", "", ""]);
        }
      }
    } catch {
      setOtpError("Verification failed. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setOtpError("");
    setOtpSuccess("");
    try {
      const result = await resendOtpMutation({ email: pendingEmail });
      if (result.success) {
        // Send the NEW otp from result — old OTP is already invalidated in DB
        await sendRegistrationOTP({
          to: pendingEmail,
          name: pendingName,
          otp: result.otp,
        });
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpSuccess("✅ New code sent! Check your inbox.");
        setResendCooldown(60); // ← 60 second cooldown
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } else {
        setOtpError(result.message || "Failed to resend. Please try again.");
      }
    } catch {
      setOtpError("Failed to resend OTP. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  // ── REGISTER SUBMIT ──────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: "" }));
  };

  const handleEmailBlur = () => {
    if (formData.email && !isValidEmail(formData.email)) {
      setErrors(prev => ({
        ...prev,
        email: "Email must be a Gmail address with up to 25 characters before @gmail.com"
      }));
    } else {
      setErrors(prev => ({ ...prev, email: "" }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    else if (formData.name.length > MAX_NAME_LENGTH) newErrors.name = `Name must be at most ${MAX_NAME_LENGTH} characters`;

    if (!formData.username.trim()) newErrors.username = "Username is required";
    else if (formData.username.length < 3) newErrors.username = "Username must be at least 3 characters";
    else if (formData.username.length > MAX_USERNAME_LENGTH) newErrors.username = `Username must be at most ${MAX_USERNAME_LENGTH} characters`;
    else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) newErrors.username = "Letters, numbers, and underscores only";

    if (!formData.email.trim()) newErrors.email = "Email is required";
    else if (!isValidEmail(formData.email)) newErrors.email = "Email must be a Gmail address with up to 25 characters before @gmail.com";

    if (!formData.password) newErrors.password = "Password is required";
    else if (!isPasswordValid()) newErrors.password = "Password does not meet all requirements";

    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);

    try {
      const fingerprint = getFingerprint();
      const result = await registerPendingUser({
        name: formData.name,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        fingerprint,
      });

      if (!result.success) {
        setErrors({ submit: result.message });
        return;
      }

      // Send OTP email
      await sendRegistrationOTP({
        to: formData.email,
        name: formData.name,
        otp: result.otp,
      });

      // Switch to OTP view
      setPendingEmail(formData.email);
      setPendingName(formData.name);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpError("");
      setOtpSuccess("");
      setResendCooldown(60); // ← 60 second cooldown after first send
      setView("otp");

    } catch (err) {
      setErrors({ submit: "Registration failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  // ── FORGOT PASSWORD ──────────────────────────────
  const handleSendCode = async () => {
    if (passwordCooldown > 0) return;
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setCodeMsg("❌ Please enter a valid email address.");
      return;
    }
    if (passwordAttempts >= 3) {
      setCodeMsg("❌ Maximum attempts reached. Try again later.");
      setPasswordCooldown(300);
      setPasswordAttempts(0);
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code);
    setSendingCode(true);
    setCodeMsg("");

    try {
      const result = await sendPasswordResetCode({ to: forgotEmail, code });
      if (result?.success) {
        setCodeMsg(`✅ Code sent to ${forgotEmail}! Check your inbox.`);
      } else {
        setCodeMsg(`❌ Failed to send: ${result?.message || "Unknown error"}`);
        setSentCode("");
      }
    } catch {
      setCodeMsg("❌ Failed to send email.");
      setSentCode("");
    } finally {
      setSendingCode(false);
      const cooldown = passwordAttempts === 0 ? 60 : passwordAttempts === 1 ? 120 : 180;
      setPasswordCooldown(cooldown);
      setPasswordAttempts(prev => prev + 1);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMsg("");
    if (!sentCode) { setResetMsg("❌ Please request a verification code first."); return; }
    if (verificationCode !== sentCode) { setResetMsg("❌ Invalid verification code."); return; }
    if (!isNewPwValid()) { setResetMsg("❌ Password does not meet all requirements."); return; }
    if (!newPasswordsMatch) { setResetMsg("❌ Passwords do not match."); return; }

    setResetLoading(true);
    try {
      const result = await resetPasswordByEmail({ email: forgotEmail, newPassword });
      if (result?.success) {
        setResetMsg("✅ Password reset successful! You can now log in.");
        setTimeout(() => onClose(), 1500);
      } else {
        setResetMsg(`❌ ${result?.message || "No account found with that email."}`);
      }
    } catch {
      setResetMsg("❌ Failed to reset password. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  // ── RENDER ───────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="register-modal-content" onClick={(e) => e.stopPropagation()}>

        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ══ OTP VERIFICATION VIEW ══ */}
        {view === "otp" ? (
          <>
            <div className="register-modal-header">
              <div className="register-icon" style={{ background: "linear-gradient(135deg, #fc1268, #9c27b0)" }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              </div>
              <h2>Verify Your Email</h2>
              <p className="register-subtitle">Enter the 6-digit code we sent to your inbox</p>
            </div>

            <div style={{ padding: "0 32px 36px" }}>

              {/* Email display */}
              <div style={{
                background: "linear-gradient(135deg, #fff0f6, #f5f3ff)",
                border: "1.5px solid #ffd6e7",
                borderRadius: "12px",
                padding: "14px 20px",
                textAlign: "center",
                marginBottom: "24px"
              }}>
                <p style={{ color: "#6b7280", fontSize: "13px", margin: "0 0 4px" }}>Code sent to:</p>
                <p style={{ color: "#fc1268", fontWeight: "700", fontSize: "15px", margin: 0, fontFamily: "monospace" }}>
                  {pendingEmail}
                </p>
              </div>

              {/* OTP Input Boxes */}
              <div style={{
                display: "flex",
                gap: "10px",
                justifyContent: "center",
                marginBottom: "20px"
              }}>
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => otpRefs.current[index] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(index, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(index, e)}
                    onPaste={index === 0 ? handleOtpPaste : undefined}
                    style={{
                      width: "48px",
                      height: "56px",
                      textAlign: "center",
                      fontSize: "22px",
                      fontWeight: "700",
                      border: `2px solid ${otpError ? "#dc2626" : digit ? "#fc1268" : "#e5e7eb"}`,
                      borderRadius: "12px",
                      outline: "none",
                      background: digit ? "linear-gradient(135deg, #fff0f6, #f5f3ff)" : "white",
                      color: "#1f2937",
                      transition: "all 0.15s ease",
                      caretColor: "#fc1268",
                    }}
                    disabled={otpLoading}
                  />
                ))}
              </div>

              {/* Error / Success */}
              {otpError && (
                <div style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                  color: "#dc2626",
                  fontSize: "13px",
                  fontWeight: "600",
                  textAlign: "center"
                }}>
                  ❌ {otpError}
                </div>
              )}
              {otpSuccess && (
                <div style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                  color: "#15803d",
                  fontSize: "13px",
                  fontWeight: "600",
                  textAlign: "center"
                }}>
                  {otpSuccess}
                </div>
              )}

              {/* Verify Button */}
              <button
                type="button"
                onClick={() => handleVerifyOtp()}
                disabled={otpLoading || otpDigits.join("").length !== 6}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: otpDigits.join("").length === 6
                    ? "linear-gradient(135deg, #fc1268, #9c27b0)"
                    : "linear-gradient(135deg, #d1d5db, #9ca3af)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: "700",
                  cursor: otpDigits.join("").length === 6 ? "pointer" : "not-allowed",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "all 0.2s",
                  boxShadow: otpDigits.join("").length === 6 ? "0 4px 12px rgba(252,18,104,0.3)" : "none",
                }}
              >
                {otpLoading ? (
                  <>
                    <svg style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" style={{ opacity: 0.25 }} />
                      <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying...
                  </>
                ) : "✅ Verify Email"}
              </button>

              {/* Resend */}
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "#6b7280", fontSize: "13px", margin: "0 0 8px" }}>
                  Didn't receive the code?
                </p>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || resendLoading}
                  style={{
                    background: "none",
                    border: "none",
                    color: resendCooldown > 0 ? "#9ca3af" : "#fc1268",
                    fontWeight: "700",
                    fontSize: "14px",
                    cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                    padding: "4px 0",
                    marginBottom: "16px",
                  }}
                >
                  {resendLoading
                    ? "Sending..."
                    : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "📨 Resend Code"}
                </button>

                <br />
                <button
                  type="button"
                  onClick={() => setView("register")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  ← Back to Register
                </button>
              </div>

              {/* Expiry note */}
              <div style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "10px",
                padding: "12px 16px",
                marginTop: "20px"
              }}>
                <p style={{ color: "#92400e", fontSize: "12px", margin: 0 }}>
                  ⏱ Code expires in <strong>3 minutes</strong>. Check your spam folder if you don't see it.
                </p>
              </div>
            </div>
          </>

        ) : view === "forgot" ? (
          <>
            <div className="register-modal-header">
              <div className="register-icon forgot-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              </div>
              <h2>Reset Password</h2>
              <p className="register-subtitle">Enter your email to get a verification code</p>
            </div>

            <form onSubmit={handleResetPassword} className="register-form">
              <div className="input-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  <input
                    type="email" placeholder="Enter your registered email"
                    className="form-input" value={forgotEmail}
                    onChange={(e) => { setForgotEmail(e.target.value); setCodeMsg(""); }}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Verification Code</label>
                <div className="forgot-code-row">
                  <div className="input-wrapper" style={{ flex: 1 }}>
                    <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text" placeholder="Enter 6-digit code" className="form-input"
                      value={verificationCode}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        if (digits.length <= 6) setVerificationCode(digits);
                      }}
                      maxLength="6" required
                    />
                  </div>
                  <button
                    type="button" className="send-code-btn"
                    onClick={handleSendCode}
                    disabled={passwordCooldown > 0 || sendingCode}
                  >
                    {sendingCode ? "Sending..." : passwordCooldown > 0 ? `Wait ${passwordCooldown}s` : "Send Code"}
                  </button>
                </div>
                {codeMsg && (
                  <div className={`forgot-msg ${codeMsg.startsWith("✅") ? "success" : "error"}`}>
                    {codeMsg}
                  </div>
                )}
              </div>

              <div className="input-group">
                <label>New Password</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <input
                    type={showNewPw ? "text" : "password"}
                    placeholder="Create a strong password"
                    className={`form-input password-input ${isNewPwValid() && newPassword ? "valid" : ""}`}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onFocus={() => setNewPwFocused(true)}
                    onBlur={() => setNewPwFocused(false)}
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowNewPw(p => !p)}>
                    <PwToggleIcon show={showNewPw} />
                  </button>
                </div>
                {newPassword && (
                  <div className="password-strength-container">
                    <div className="password-strength-bar">
                      <div className="password-strength-fill" style={{ width: `${newPwStrength.percentage}%`, backgroundColor: newPwStrength.color }} />
                    </div>
                    {newPwStrength.text && <div className="password-strength-label" style={{ color: newPwStrength.color }}>{newPwStrength.text}</div>}
                  </div>
                )}
                {showNewPwReqs && <PwRequirements validation={newPwValidation} />}
                {isNewPwValid() && newPassword && (
                  <div className="password-success-message">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Great! Your password is strong</span>
                  </div>
                )}
              </div>

              <div className="input-group">
                <label>Confirm New Password</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <input
                    type={showConfirmNewPw ? "text" : "password"}
                    placeholder="Confirm your new password"
                    className={`form-input password-input ${newPasswordsMatch ? "valid" : ""}`}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowConfirmNewPw(p => !p)}>
                    <PwToggleIcon show={showConfirmNewPw} />
                  </button>
                </div>
                {newPasswordsMatch && (
                  <div className="password-match-success">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Passwords match!</span>
                  </div>
                )}
              </div>

              {resetMsg && (
                <div className={`forgot-msg ${resetMsg.startsWith("✅") ? "success" : "error"}`} style={{ marginBottom: "12px" }}>
                  {resetMsg}
                </div>
              )}

              <button
                type="submit" className="register-submit-btn"
                disabled={!isNewPwValid() || !newPasswordsMatch || !sentCode || resetLoading}
              >
                {resetLoading ? (
                  <>
                    <svg className="spinner" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" style={{ opacity: 0.25 }} />
                      <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Resetting...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Reset Password
                  </>
                )}
              </button>

              <div className="divider"><span>OR</span></div>
              <div className="login-section">
                <p>
                  <button type="button" className="login-link" onClick={() => setView("register")}>
                    ← Back to Register
                  </button>
                </p>
              </div>
            </form>
          </>

        ) : (
          /* ══ REGISTER VIEW ══ */
          <>
            <div className="register-modal-header">
              <div className="register-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                </svg>
              </div>
              <h2>Create Your Account</h2>
              <p className="register-subtitle">Join DKMerch community today!</p>
            </div>

            <form onSubmit={handleSubmit} className="register-form">
              {errors.submit && (
                <div className="error-banner">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{errors.submit}</span>
                </div>
              )}

              <div className="input-group">
                <label htmlFor="name">Full Name</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  <input
                    type="text" id="name" name="name"
                    placeholder="Enter your full name"
                    className={`form-input ${errors.name ? "error" : ""}`}
                    value={formData.name} onChange={handleChange}
                    maxLength={MAX_NAME_LENGTH} required
                  />
                </div>
                {errors.name && <span className="error-text">{errors.name}</span>}
              </div>

              <div className="input-group">
                <label htmlFor="username">Username</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                  </svg>
                  <input
                    type="text" id="username" name="username"
                    placeholder="Choose a username"
                    className={`form-input ${errors.username ? "error" : ""}`}
                    value={formData.username} onChange={handleChange}
                    maxLength={MAX_USERNAME_LENGTH} required
                  />
                </div>
                {errors.username && <span className="error-text">{errors.username}</span>}
              </div>

              <div className="input-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  <input
                    type="email" id="email" name="email"
                    placeholder="Enter your Gmail (max 25 chars before @)"
                    className={`form-input ${errors.email ? "error" : ""}`}
                    value={formData.email} onChange={handleChange}
                    onBlur={handleEmailBlur} required
                  />
                </div>
                {errors.email && <span className="error-text">{errors.email}</span>}
              </div>

              <div className="input-group">
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <input
                    type={showPassword ? "text" : "password"} id="password" name="password"
                    placeholder="Create a strong password"
                    className={`form-input password-input ${errors.password ? "error" : ""} ${isPasswordValid() && formData.password ? "valid" : ""}`}
                    value={formData.password} onChange={handleChange}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)} required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(p => !p)}>
                    <PwToggleIcon show={showPassword} />
                  </button>
                </div>
                {errors.password && <span className="error-text">{errors.password}</span>}
                {formData.password && (
                  <div className="password-strength-container">
                    <div className="password-strength-bar">
                      <div className="password-strength-fill" style={{ width: `${strength.percentage}%`, backgroundColor: strength.color }} />
                    </div>
                    {strength.text && <div className="password-strength-label" style={{ color: strength.color }}>{strength.text}</div>}
                  </div>
                )}
                {showPwReqs && <PwRequirements validation={passwordValidation} />}
                {isPasswordValid() && formData.password && (
                  <div className="password-success-message">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Great! Your password is strong</span>
                  </div>
                )}
              </div>

              <div className="input-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <input
                    type={showConfirmPassword ? "text" : "password"} id="confirmPassword"
                    name="confirmPassword" placeholder="Confirm your password"
                    className={`form-input password-input ${errors.confirmPassword ? "error" : ""} ${passwordsMatch ? "valid" : ""}`}
                    value={formData.confirmPassword} onChange={handleChange} required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword(p => !p)}>
                    <PwToggleIcon show={showConfirmPassword} />
                  </button>
                </div>
                {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                {passwordsMatch && (
                  <div className="password-match-success">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Passwords match!</span>
                  </div>
                )}
              </div>

              <div className="forgot-password-wrapper">
                <button type="button" className="forgot-password-link" onClick={() => setView("forgot")}>
                  Forgot Password?
                </button>
              </div>

              <button type="submit" className="register-submit-btn"
                disabled={!isPasswordValid() || !passwordsMatch || isLoading}>
                {isLoading ? (
                  <>
                    <svg className="spinner" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" style={{ opacity: 0.25 }} />
                      <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending Code...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                    </svg>
                    Create Account
                  </>
                )}
              </button>

              <div className="divider"><span>OR</span></div>
              <div className="login-section">
                <p>Already have an account?{" "}
                  <button type="button" className="login-link" onClick={onClose}>
                    Log in here
                  </button>
                </p>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default RegisterModal;