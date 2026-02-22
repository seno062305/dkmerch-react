// src/components/RiderRegistrationModal.js
import React, { useState, useEffect } from 'react';
import './RiderRegistrationModal.css';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const RiderRegistrationModal = ({ onClose }) => {
  const createRider = useMutation(api.riders.createRiderApplication);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    vehicleType: '',
    plateNumber: '',
    licenseNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const validateRiderPassword = (password) => {
    const errs = [];
    if (!password) { errs.push('Password is required.'); return errs; }
    if (!password.startsWith('@rider')) errs.push('Password must start with @rider.');
    if (password.length > 10) errs.push('Password must be maximum 10 characters.');
    if (password.length < 7) errs.push('Password must be at least 7 characters (e.g. @rider1).');
    return errs;
  };

  const getPasswordStrength = (password) => {
    if (!password) return null;
    const startsWithRider = password.startsWith('@rider');
    const validLength = password.length >= 7 && password.length <= 10;
    if (startsWithRider && validLength) return 'valid';
    if (startsWithRider && password.length > 0) return 'partial';
    return 'invalid';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setForm({ ...form, phone: value.replace(/\D/g, '').slice(0, 11) });
    } else if (name === 'plateNumber') {
      setForm({ ...form, plateNumber: value.toUpperCase().slice(0, 8) });
    } else if (name === 'licenseNumber') {
      setForm({ ...form, licenseNumber: value.toUpperCase().slice(0, 20) });
    } else if (name === 'password') {
      setForm({ ...form, password: value.slice(0, 10) });
    } else {
      setForm({ ...form, [name]: value });
    }
    setErrors({ ...errors, [name]: '' });
  };

  const validate = () => {
    const newErrors = {};
    if (!form.fullName.trim()) newErrors.fullName = 'Full name is required.';
    else if (form.fullName.trim().length < 3) newErrors.fullName = 'Full name must be at least 3 characters.';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim()) newErrors.email = 'Email address is required.';
    else if (!emailRegex.test(form.email)) newErrors.email = 'Enter a valid email address.';

    if (!form.phone.trim()) newErrors.phone = 'Phone number is required.';
    else if (form.phone.length !== 11) newErrors.phone = 'Phone number must be exactly 11 digits.';
    else if (!form.phone.startsWith('09')) newErrors.phone = 'Phone number must start with 09.';

    if (!form.address.trim()) newErrors.address = 'Address is required.';
    else if (form.address.trim().length < 10) newErrors.address = 'Please enter a complete address.';

    if (!form.vehicleType) newErrors.vehicleType = 'Please select a vehicle type.';

    if (!form.plateNumber.trim()) newErrors.plateNumber = 'Plate number is required.';
    else if (form.plateNumber.trim().length < 5) newErrors.plateNumber = 'Enter a valid plate number (e.g. ABC 1234).';

    if (!form.licenseNumber.trim()) newErrors.licenseNumber = "Driver's license number is required.";
    else if (form.licenseNumber.trim().length < 6) newErrors.licenseNumber = 'License number seems too short.';

    const passwordErrs = validateRiderPassword(form.password);
    if (passwordErrs.length > 0) newErrors.password = passwordErrs[0];

    if (!form.confirmPassword) newErrors.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match.';

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    try {
      const result = await createRider({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        vehicleType: form.vehicleType,
        plateNumber: form.plateNumber,
        licenseNumber: form.licenseNumber,
        password: form.password,
      });

      if (!result.success) {
        setErrors({ email: result.message });
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setErrors({ submit: 'Submission failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(form.password);

  return (
    <div className="rider-modal-overlay" onClick={onClose}>
      <div className="rider-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="rider-modal-close" onClick={onClose}>✕</button>
        <h2 className="rider-modal-title">🛵 Rider Application</h2>
        <p className="rider-modal-subtitle">Apply to be a DKMerch delivery rider</p>

        {submitted ? (
          <div className="rider-modal-success">
            <div className="success-icon">✅</div>
            <h3>Application Submitted!</h3>
            <p>We'll review your application and get back to you via email or phone.</p>
            <button className="rider-btn-close" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rider-form" noValidate>

            {errors.submit && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' }}>
                ⚠ {errors.submit}
              </div>
            )}

            {/* Full Name */}
            <div className="rider-form-group">
              <label>Full Name</label>
              <input name="fullName" type="text" placeholder="Juan Dela Cruz"
                value={form.fullName} onChange={handleChange} maxLength={60}
                className={errors.fullName ? 'input-error' : ''} />
              <div className="field-footer">
                {errors.fullName ? <span className="error-msg">⚠ {errors.fullName}</span> : <span />}
                <span className="char-count">{form.fullName.length}/60</span>
              </div>
            </div>

            {/* Email */}
            <div className="rider-form-group">
              <label>Email Address</label>
              <input name="email" type="email" placeholder="juan@email.com"
                value={form.email} onChange={handleChange} maxLength={60}
                className={errors.email ? 'input-error' : ''} />
              <div className="field-footer">
                {errors.email ? <span className="error-msg">⚠ {errors.email}</span> : <span />}
                <span className="char-count">{form.email.length}/60</span>
              </div>
            </div>

            {/* Phone */}
            <div className="rider-form-group">
              <label>Phone Number</label>
              <input name="phone" type="tel" placeholder="09XXXXXXXXX"
                value={form.phone} onChange={handleChange} maxLength={11} inputMode="numeric"
                className={errors.phone ? 'input-error' : ''} />
              <div className="field-footer">
                {errors.phone ? <span className="error-msg">⚠ {errors.phone}</span> : <span />}
                <span className={`char-count ${form.phone.length === 11 ? 'count-done' : ''}`}>
                  {form.phone.length}/11
                </span>
              </div>
            </div>

            {/* Address */}
            <div className="rider-form-group">
              <label>Home Address</label>
              <input name="address" type="text" placeholder="Street, Barangay, City, Province"
                value={form.address} onChange={handleChange} maxLength={120}
                className={errors.address ? 'input-error' : ''} />
              <div className="field-footer">
                {errors.address ? <span className="error-msg">⚠ {errors.address}</span> : <span />}
                <span className="char-count">{form.address.length}/120</span>
              </div>
            </div>

            {/* Vehicle + Plate Row */}
            <div className="rider-form-row">
              <div className="rider-form-group">
                <label>Vehicle Type</label>
                <select name="vehicleType" value={form.vehicleType} onChange={handleChange}
                  className={errors.vehicleType ? 'input-error' : ''}>
                  <option value="">Select vehicle</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="bicycle">Bicycle</option>
                </select>
                {errors.vehicleType && <span className="error-msg">⚠ {errors.vehicleType}</span>}
              </div>
              <div className="rider-form-group">
                <label>Plate Number</label>
                <input name="plateNumber" type="text" placeholder="ABC 1234"
                  value={form.plateNumber} onChange={handleChange} maxLength={8}
                  className={errors.plateNumber ? 'input-error' : ''} />
                <div className="field-footer">
                  {errors.plateNumber ? <span className="error-msg">⚠ {errors.plateNumber}</span> : <span />}
                  <span className="char-count">{form.plateNumber.length}/8</span>
                </div>
              </div>
            </div>

            {/* License Number */}
            <div className="rider-form-group">
              <label>Driver's License Number</label>
              <input name="licenseNumber" type="text" placeholder="e.g. N01-23-456789"
                value={form.licenseNumber} onChange={handleChange} maxLength={20}
                className={errors.licenseNumber ? 'input-error' : ''} />
              <div className="field-footer">
                {errors.licenseNumber ? <span className="error-msg">⚠ {errors.licenseNumber}</span> : <span />}
                <span className="char-count">{form.licenseNumber.length}/20</span>
              </div>
            </div>

            {/* Password */}
            <div className="rider-form-group">
              <label>Create Password</label>
              <div className="rider-password-wrapper">
                <input name="password" type={showPassword ? 'text' : 'password'}
                  placeholder="@rider + up to 4 more chars"
                  value={form.password} onChange={handleChange} maxLength={10}
                  className={errors.password ? 'input-error' : ''} />
                <button type="button" className="rider-pw-toggle"
                  onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {form.password && (
                <div className={`rider-pw-strength ${passwordStrength}`}>
                  {passwordStrength === 'valid' && '✅ Password looks good!'}
                  {passwordStrength === 'partial' && '⚠️ Add more characters after @rider'}
                  {passwordStrength === 'invalid' && '❌ Password must start with @rider'}
                </div>
              )}
              <div className="rider-pw-rules">
                <div className={`pw-rule ${form.password.startsWith('@rider') ? 'rule-ok' : ''}`}>
                  {form.password.startsWith('@rider') ? '✅' : '○'} Must start with <strong>@rider</strong>
                </div>
                <div className={`pw-rule ${form.password.length >= 7 && form.password.length <= 10 ? 'rule-ok' : ''}`}>
                  {form.password.length >= 7 && form.password.length <= 10 ? '✅' : '○'} Total 7–10 characters max
                </div>
              </div>
              <div className="field-footer">
                {errors.password ? <span className="error-msg">⚠ {errors.password}</span> : <span />}
                <span className={`char-count ${form.password.length === 10 ? 'count-done' : ''}`}>
                  {form.password.length}/10
                </span>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="rider-form-group">
              <label>Confirm Password</label>
              <div className="rider-password-wrapper">
                <input name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={form.confirmPassword} onChange={handleChange} maxLength={10}
                  className={errors.confirmPassword ? 'input-error' : ''} />
                <button type="button" className="rider-pw-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label="Toggle confirm password visibility">
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <div className="field-footer">
                {errors.confirmPassword
                  ? <span className="error-msg">⚠ {errors.confirmPassword}</span>
                  : form.confirmPassword && form.password === form.confirmPassword
                    ? <span className="match-ok">✅ Passwords match</span>
                    : <span />}
              </div>
            </div>

            <button type="submit" className="rider-submit-btn" disabled={isLoading}>
              {isLoading ? 'Submitting...' : 'Submit Application'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RiderRegistrationModal;