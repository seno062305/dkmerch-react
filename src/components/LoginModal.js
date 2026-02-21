import React, { useState, useEffect } from "react";
import "./LoginModal.css";
import { useAuth } from "../context/AuthContext";
import RegisterModal from "./RegisterModal";
import RiderRegistrationModal from "./RiderRegistrationModal";
import { useNavigate } from "react-router-dom";

const LoginModal = ({ onClose }) => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const [showRegister, setShowRegister] = useState(false);
  const [showRiderRegister, setShowRiderRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRiderMode, setIsRiderMode] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add('login-modal-open');
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove('login-modal-open');
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    setTimeout(() => {
      const result = login(formData.email, formData.password);

      if (!result.success) {
        setError(result.message);
        setIsLoading(false);
        return;
      }

      // 🔥 ADMIN AUTO REDIRECT
      if (result.role === "admin") {
        onClose();
        navigate("/admin", { replace: true });
        return;
      }

      // 🛵 RIDER AUTO REDIRECT
      if (result.role === "rider") {
        onClose();
        navigate("/rider", { replace: true });
        return;
      }

      // normal user
      onClose();
    }, 500);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleSwitchToRegister = () => {
    setFormData({ email: "", password: "" });
    setError("");
    setShowRegister(true);
  };

  const handleForgotPassword = () => {
    onClose();
    localStorage.setItem('dkmerch_forgot_password', 'true');
    navigate("/settings", { state: { activeTab: "password", forgotPassword: true } });
  };

  const handleRegisterSuccess = () => {
    setShowRegister(false);
  };

  const toggleRiderMode = () => {
    setIsRiderMode(!isRiderMode);
    setFormData({ email: "", password: "" });
    setError("");
  };

  if (showRegister) {
    return <RegisterModal onClose={handleRegisterSuccess} />;
  }

  if (showRiderRegister) {
    return <RiderRegistrationModal onClose={() => setShowRiderRegister(false)} />;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 🛵 Rider Login Toggle Button - Top Left */}
        <button
          className={`rider-toggle-btn ${isRiderMode ? 'rider-mode-active' : ''}`}
          onClick={toggleRiderMode}
          title={isRiderMode ? "Switch to User Login" : "Rider Login"}
          aria-label="Rider Login"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 7c0-1.1-.9-2-2-2h-3v2h3v2.65L13.52 14H10V9H6c-2.21 0-4 1.79-4 4v3h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4.48L19 10.35V7zm-13 8c-.55 0-1-.45-1-1h2c0 .55-.45 1-1 1z"/>
            <path d="M5 6h5v2H5zm14 7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
          </svg>
          <span>{isRiderMode ? "Rider" : "Rider"}</span>
        </button>

        <div className="login-modal-header">
          <div className={`login-icon ${isRiderMode ? 'rider-icon-mode' : ''}`}>
            {isRiderMode ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 7c0-1.1-.9-2-2-2h-3v2h3v2.65L13.52 14H10V9H6c-2.21 0-4 1.79-4 4v3h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4.48L19 10.35V7zm-13 8c-.55 0-1-.45-1-1h2c0 .55-.45 1-1 1z"/>
                <path d="M5 6h5v2H5zm14 7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
              </svg>
            )}
          </div>
          <h2>{isRiderMode ? "Rider Login" : "Welcome Back!"}</h2>
          <p className="login-subtitle">
            {isRiderMode
              ? "Log in to your DKMerch Rider account"
              : "Log in to your DKMerch account"}
          </p>
          {isRiderMode && (
            <div className="rider-mode-badge">
              🛵 Rider Portal
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-banner">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">Email / Username</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              <input
                type="text"
                id="email"
                name="email"
                placeholder={isRiderMode ? "Enter your rider email" : "Enter your email or username"}
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                placeholder={isRiderMode ? "Enter your @rider password" : "Enter your password"}
                className="form-input password-input"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            {isRiderMode && (
              <p className="rider-password-hint">
                🔑 Rider passwords must start with <strong>@rider</strong> (max 10 characters)
              </p>
            )}
          </div>

          <div className="forgot-password-wrapper">
            <button type="button" className="forgot-password-link" onClick={handleForgotPassword}>
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            className={`login-submit-btn ${isRiderMode ? 'rider-submit-mode' : ''}`}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="spinner" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Logging in...
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {isRiderMode ? "Rider Log In" : "Log In"}
              </>
            )}
          </button>

          <div className="divider">
            <span>OR</span>
          </div>

          {isRiderMode ? (
            <div className="signup-section">
              <p>
                Want to be a rider?{" "}
                <button type="button" className="signup-link" onClick={() => setShowRiderRegister(true)}>
                  Apply Now
                </button>
              </p>
              <p style={{ marginTop: '10px' }}>
                Not a rider?{" "}
                <button type="button" className="signup-link" onClick={toggleRiderMode}>
                  User Login
                </button>
              </p>
            </div>
          ) : (
            <div className="signup-section">
              <p>
                New to DKMerch?{" "}
                <button type="button" className="signup-link" onClick={handleSwitchToRegister}>
                  Create an account
                </button>
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginModal;