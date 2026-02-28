// src/components/RiderRegistrationModal.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './RiderRegistrationModal.css';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ─────────────────────────────────────────────
// CROP MODAL
// ─────────────────────────────────────────────
const CropModal = ({ imageSrc, onCropDone, onCancel }) => {
  const canvasRef = useRef();
  const containerRef = useRef();
  const imgRef = useRef(new Image());
  const dragStart = useRef({ mx: 0, my: 0, box: null });

  const [cropBox, setCropBox] = useState({ x: 0.15, y: 0.05, w: 0.7, h: 0.9 });
  const [dragging, setDragging] = useState(null);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setDisplaySize({ w: r.width, h: r.height });
      }
    };
    measure();
    const t = setTimeout(measure, 80);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || displaySize.w === 0) return;
    const ctx = canvas.getContext('2d');
    canvas.width = displaySize.w;
    canvas.height = displaySize.h;
    const img = imgRef.current;
    if (!img.complete || imgNaturalSize.w === 0) return;

    ctx.drawImage(img, 0, 0, displaySize.w, displaySize.h);
    const bx = cropBox.x * displaySize.w;
    const by = cropBox.y * displaySize.h;
    const bw = cropBox.w * displaySize.w;
    const bh = cropBox.h * displaySize.h;

    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, displaySize.w, by);
    ctx.fillRect(0, by + bh, displaySize.w, displaySize.h - by - bh);
    ctx.fillRect(0, by, bx, bh);
    ctx.fillRect(bx + bw, by, displaySize.w - bx - bw, bh);

    ctx.save();
    ctx.beginPath();
    ctx.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(bx + (bw * i) / 3, by); ctx.lineTo(bx + (bw * i) / 3, by + bh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by + (bh * i) / 3); ctx.lineTo(bx + bw, by + (bh * i) / 3); ctx.stroke();
    }

    const H = 14;
    ctx.fillStyle = '#fff';
    [{ cx: bx, cy: by }, { cx: bx + bw, cy: by }, { cx: bx, cy: by + bh }, { cx: bx + bw, cy: by + bh }]
      .forEach(({ cx, cy }) => ctx.fillRect(cx - H / 2, cy - H / 2, H, H));
  }, [cropBox, displaySize, imgNaturalSize]);

  const getEventPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) / rect.width, y: (src.clientY - rect.top) / rect.height };
  };

  const getHit = (pos) => {
    const { x, y, w, h } = cropBox;
    const t = 0.05;
    for (const { key, cx, cy } of [
      { key: 'nw', cx: x, cy: y }, { key: 'ne', cx: x + w, cy: y },
      { key: 'sw', cx: x, cy: y + h }, { key: 'se', cx: x + w, cy: y + h },
    ]) {
      if (Math.abs(pos.x - cx) < t && Math.abs(pos.y - cy) < t) return key;
    }
    if (pos.x > x + t && pos.x < x + w - t && pos.y > y + t && pos.y < y + h - t) return 'move';
    return null;
  };

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    const pos = getEventPos(e);
    const target = getHit(pos);
    if (!target) return;
    setDragging(target);
    dragStart.current = { mx: pos.x, my: pos.y, box: { ...cropBox } };
  }, [cropBox]); // eslint-disable-line

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const pos = getEventPos(e);
    const dx = pos.x - dragStart.current.mx;
    const dy = pos.y - dragStart.current.my;
    const b = dragStart.current.box;
    const min = 0.1;
    let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
    if (dragging === 'move') { nx = Math.max(0, Math.min(1 - b.w, b.x + dx)); ny = Math.max(0, Math.min(1 - b.h, b.y + dy)); }
    else if (dragging === 'nw') { nx = Math.min(b.x + b.w - min, b.x + dx); ny = Math.min(b.y + b.h - min, b.y + dy); nw = b.x + b.w - nx; nh = b.y + b.h - ny; }
    else if (dragging === 'ne') { ny = Math.min(b.y + b.h - min, b.y + dy); nw = Math.max(min, b.w + dx); nh = b.y + b.h - ny; }
    else if (dragging === 'sw') { nx = Math.min(b.x + b.w - min, b.x + dx); nw = b.x + b.w - nx; nh = Math.max(min, b.h + dy); }
    else if (dragging === 'se') { nw = Math.max(min, b.w + dx); nh = Math.max(min, b.h + dy); }
    nx = Math.max(0, nx); ny = Math.max(0, ny);
    nw = Math.min(1 - nx, nw); nh = Math.min(1 - ny, nh);
    setCropBox({ x: nx, y: ny, w: nw, h: nh });
  }, [dragging]); // eslint-disable-line

  const onPointerUp = () => setDragging(null);

  useEffect(() => {
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };
  }, [onPointerMove]);

  // Attach touchstart as non-passive via ref to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    return () => canvas.removeEventListener('touchstart', onPointerDown);
  }, [onPointerDown]);

  const handleApply = () => {
    const img = imgRef.current;
    if (!img.complete || imgNaturalSize.w === 0) return;
    const sx = cropBox.x * imgNaturalSize.w, sy = cropBox.y * imgNaturalSize.h;
    const sw = cropBox.w * imgNaturalSize.w, sh = cropBox.h * imgNaturalSize.h;
    const OUT = 400;
    const off = document.createElement('canvas');
    off.width = OUT; off.height = OUT;
    const ctx = off.getContext('2d');
    ctx.beginPath();
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT, OUT);
    onCropDone(off.toDataURL('image/jpeg', 0.88));
  };

  return (
    <div className="crop-overlay">
      <div className="crop-modal">
        <div className="crop-header">
          <div className="crop-title">✂️ Crop Your Selfie</div>
          <p className="crop-subtitle">Drag the box to center your face. The dashed circle shows the final shape.</p>
        </div>
        <div className="crop-canvas-wrapper" ref={containerRef}>
          <canvas ref={canvasRef} className="crop-canvas"
            onMouseDown={onPointerDown}
            style={{ cursor: dragging === 'move' ? 'grabbing' : 'grab', touchAction: 'none' }} />
        </div>
        <div className="crop-actions">
          <button className="crop-btn-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className="crop-btn-apply" type="button" onClick={handleApply}>✅ Apply Crop</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const RiderRegistrationModal = ({ onClose }) => {
  const createRider = useMutation(api.riders.createRiderApplication);

  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', address: '',
    vehicleType: '', plateNumber: '', licenseNumber: '',
    password: '', confirmPassword: '',
  });

  const [photos, setPhotos] = useState({ riderPhoto: null, validId1: null, validId2: null });
  const [photoPreviews, setPhotoPreviews] = useState({ riderPhoto: null, validId1: null, validId2: null });
  const [cropSrc, setCropSrc] = useState(null);
  const [showCrop, setShowCrop] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const riderPhotoRef = useRef();
  const validId1Ref = useRef();
  const validId2Ref = useRef();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const validateRiderPassword = (pw) => {
    if (!pw) return ['Password is required.'];
    const e = [];
    if (!pw.startsWith('@rider')) e.push('Password must start with @rider.');
    if (pw.length < 7) e.push('Must be at least 7 characters (e.g. @rider1).');
    if (pw.length > 10) e.push('Maximum 10 characters.');
    return e;
  };

  const getPasswordStrength = (pw) => {
    if (!pw) return null;
    if (pw.startsWith('@rider') && pw.length >= 7 && pw.length <= 10) return 'valid';
    if (pw.startsWith('@rider')) return 'partial';
    return 'invalid';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...form };
    if (name === 'phone') next.phone = value.replace(/\D/g, '').slice(0, 11);
    else if (name === 'plateNumber') next.plateNumber = value.toUpperCase().slice(0, 8);
    else if (name === 'licenseNumber') next.licenseNumber = value.toUpperCase().slice(0, 20);
    else if (name === 'password') next.password = value.slice(0, 10);
    else next[name] = value;
    setForm(next);
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const fileToBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const validateFile = (file, field) => {
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, [field]: 'Please upload an image file.' }));
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrors(prev => ({ ...prev, [field]: 'File size must be 5MB or less.' }));
      return false;
    }
    return true;
  };

  const handleSelfieChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !validateFile(file, 'riderPhoto')) return;
    try {
      const b64 = await fileToBase64(file);
      setCropSrc(b64);
      setShowCrop(true);
      setErrors(prev => ({ ...prev, riderPhoto: '' }));
    } catch {
      setErrors(prev => ({ ...prev, riderPhoto: 'Failed to read image.' }));
    }
  };

  const handleCropDone = (cropped) => {
    setPhotos(prev => ({ ...prev, riderPhoto: cropped }));
    setPhotoPreviews(prev => ({ ...prev, riderPhoto: cropped }));
    setShowCrop(false);
    setCropSrc(null);
    if (riderPhotoRef.current) riderPhotoRef.current.value = '';
  };

  const handleCropCancel = () => {
    setShowCrop(false);
    setCropSrc(null);
    if (riderPhotoRef.current) riderPhotoRef.current.value = '';
  };

  const handleIdChange = async (e, field) => {
    const file = e.target.files[0];
    if (!file || !validateFile(file, field)) return;
    try {
      const b64 = await fileToBase64(file);
      setPhotos(prev => ({ ...prev, [field]: b64 }));
      setPhotoPreviews(prev => ({ ...prev, [field]: b64 }));
      setErrors(prev => ({ ...prev, [field]: '' }));
    } catch {
      setErrors(prev => ({ ...prev, [field]: 'Failed to read image.' }));
    }
  };

  const removePhoto = (field) => {
    setPhotos(prev => ({ ...prev, [field]: null }));
    setPhotoPreviews(prev => ({ ...prev, [field]: null }));
    const refs = { riderPhoto: riderPhotoRef, validId1: validId1Ref, validId2: validId2Ref };
    if (refs[field]?.current) refs[field].current.value = '';
  };

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required.';
    else if (form.fullName.trim().length < 3) e.fullName = 'At least 3 characters.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email.';
    if (!form.phone.trim()) e.phone = 'Phone is required.';
    else if (form.phone.length !== 11) e.phone = 'Must be exactly 11 digits.';
    else if (!form.phone.startsWith('09')) e.phone = 'Must start with 09.';
    if (!form.address.trim()) e.address = 'Address is required.';
    else if (form.address.trim().length < 10) e.address = 'Please enter a complete address.';
    if (!form.vehicleType) e.vehicleType = 'Select a vehicle type.';
    if (!form.plateNumber.trim()) e.plateNumber = 'Plate number is required.';
    else if (form.plateNumber.trim().length < 5) e.plateNumber = 'Enter a valid plate number.';
    if (!form.licenseNumber.trim()) e.licenseNumber = 'License number is required.';
    else if (form.licenseNumber.trim().length < 6) e.licenseNumber = 'License number too short.';
    if (!photos.riderPhoto) e.riderPhoto = 'Please upload your selfie.';
    const pwErrs = validateRiderPassword(form.password);
    if (pwErrs.length) e.password = pwErrs[0];
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsLoading(true);
    try {
      const result = await createRider({
        fullName: form.fullName, email: form.email, phone: form.phone,
        address: form.address, vehicleType: form.vehicleType,
        plateNumber: form.plateNumber, licenseNumber: form.licenseNumber,
        password: form.password,
        riderPhoto: photos.riderPhoto ?? undefined,
        validId1: photos.validId1 ?? undefined,
        validId2: photos.validId2 ?? undefined,
      });
      if (!result.success) { setErrors({ email: result.message }); return; }
      setSubmitted(true);
    } catch {
      setErrors({ submit: 'Submission failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(form.password);

  return (
    <>
      {showCrop && cropSrc && (
        <CropModal imageSrc={cropSrc} onCropDone={handleCropDone} onCancel={handleCropCancel} />
      )}

      <div className="rider-modal-overlay" onClick={onClose}>
        <div className="rider-modal-container" onClick={(e) => e.stopPropagation()}>
          <button className="rider-modal-close" onClick={onClose}>✕</button>

          {/* ── HEADER ── */}
          <div className="rider-modal-header">
            <h2 className="rider-modal-title">🛵 Rider Application</h2>
            <p className="rider-modal-subtitle">Apply to be a DKMerch delivery rider</p>
          </div>

          {submitted ? (
            <div className="rider-modal-success">
              <div className="success-icon">✅</div>
              <h3>Application Submitted!</h3>
              <p>We'll review your application and get back to you via email or phone.</p>
              <button className="rider-btn-close" onClick={onClose}>Close</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="rider-form" noValidate>
              {errors.submit && <div className="rider-submit-error">⚠ {errors.submit}</div>}

              {/* ── TWO COLUMN BODY ── */}
              <div className="rider-form-columns">

                {/* ══ LEFT: Form Fields ══ */}
                <div className="rider-col-left">
                  <div className="col-section-label">Personal & Vehicle Info</div>

                  {/* Full Name */}
                  <div className="rider-form-group">
                    <label>Full Name</label>
                    <input name="fullName" type="text" placeholder="Juan Dela Cruz"
                      value={form.fullName} onChange={handleChange} maxLength={60}
                      className={errors.fullName ? 'input-error' : ''} />
                    {errors.fullName && <span className="error-msg">⚠ {errors.fullName}</span>}
                  </div>

                  {/* Email */}
                  <div className="rider-form-group">
                    <label>Email Address</label>
                    <input name="email" type="email" placeholder="juan@email.com"
                      value={form.email} onChange={handleChange} maxLength={60}
                      className={errors.email ? 'input-error' : ''} />
                    {errors.email && <span className="error-msg">⚠ {errors.email}</span>}
                  </div>

                  {/* Phone */}
                  <div className="rider-form-group">
                    <label>Phone Number</label>
                    <input name="phone" type="tel" placeholder="09XXXXXXXXX"
                      value={form.phone} onChange={handleChange} maxLength={11} inputMode="numeric"
                      className={errors.phone ? 'input-error' : ''} />
                    {errors.phone && <span className="error-msg">⚠ {errors.phone}</span>}
                  </div>

                  {/* Address */}
                  <div className="rider-form-group">
                    <label>Home Address</label>
                    <input name="address" type="text" placeholder="Street, Barangay, City, Province"
                      value={form.address} onChange={handleChange} maxLength={120}
                      className={errors.address ? 'input-error' : ''} />
                    {errors.address && <span className="error-msg">⚠ {errors.address}</span>}
                  </div>

                  {/* Vehicle + Plate */}
                  <div className="rider-form-row">
                    <div className="rider-form-group">
                      <label>Vehicle Type</label>
                      <select name="vehicleType" value={form.vehicleType} onChange={handleChange}
                        className={errors.vehicleType ? 'input-error' : ''}>
                        <option value="">Select</option>
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
                      {errors.plateNumber && <span className="error-msg">⚠ {errors.plateNumber}</span>}
                    </div>
                  </div>

                  {/* License */}
                  <div className="rider-form-group">
                    <label>Driver's License Number</label>
                    <input name="licenseNumber" type="text" placeholder="e.g. N01-23-456789"
                      value={form.licenseNumber} onChange={handleChange} maxLength={20}
                      className={errors.licenseNumber ? 'input-error' : ''} />
                    {errors.licenseNumber && <span className="error-msg">⚠ {errors.licenseNumber}</span>}
                  </div>

                  {/* Password */}
                  <div className="rider-form-group">
                    <label>Create Password</label>
                    <div className="rider-password-wrapper">
                      <input name="password" type={showPassword ? 'text' : 'password'}
                        placeholder="@rider + up to 4 chars"
                        value={form.password} onChange={handleChange} maxLength={10}
                        className={errors.password ? 'input-error' : ''} />
                      <button type="button" className="rider-pw-toggle" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {form.password && (
                      <div className={`rider-pw-strength ${passwordStrength}`}>
                        {passwordStrength === 'valid' && '✅ Password looks good!'}
                        {passwordStrength === 'partial' && '⚠️ Add more chars after @rider'}
                        {passwordStrength === 'invalid' && '❌ Must start with @rider'}
                      </div>
                    )}
                    <div className="rider-pw-rules">
                      <div className={`pw-rule ${form.password.startsWith('@rider') ? 'rule-ok' : ''}`}>
                        {form.password.startsWith('@rider') ? '✅' : '○'} Starts with <strong>@rider</strong>
                      </div>
                      <div className={`pw-rule ${form.password.length >= 7 && form.password.length <= 10 ? 'rule-ok' : ''}`}>
                        {form.password.length >= 7 && form.password.length <= 10 ? '✅' : '○'} 7–10 characters
                      </div>
                    </div>
                    {errors.password && <span className="error-msg">⚠ {errors.password}</span>}
                  </div>

                  {/* Confirm Password */}
                  <div className="rider-form-group">
                    <label>Confirm Password</label>
                    <div className="rider-password-wrapper">
                      <input name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Re-enter your password"
                        value={form.confirmPassword} onChange={handleChange} maxLength={10}
                        className={errors.confirmPassword ? 'input-error' : ''} />
                      <button type="button" className="rider-pw-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                        {showConfirmPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {errors.confirmPassword
                      ? <span className="error-msg">⚠ {errors.confirmPassword}</span>
                      : form.confirmPassword && form.password === form.confirmPassword
                        ? <span className="match-ok">✅ Passwords match</span>
                        : null}
                  </div>
                </div>

                {/* ══ RIGHT: Photos & IDs ══ */}
                <div className="rider-col-right">
                  <div className="col-section-label">Identity Verification</div>
                  <p className="col-section-hint">Selfie is required. Valid IDs are optional for now.</p>

                  {/* SELFIE */}
                  <div className="rider-form-group">
                    <label>🤳 Selfie <span className="required-tag">Required</span></label>

                    {/* Guidelines */}
                    <div className="selfie-guidelines">
                      <div className="selfie-guidelines-title">📋 Photo Requirements</div>
                      <div className="selfie-guideline-item guideline-required">
                        <span>✅</span><span>Plain <strong>white background</strong></span>
                      </div>
                      <div className="selfie-guideline-item guideline-required">
                        <span>✅</span><span>Face clearly visible, looking straight at camera</span>
                      </div>
                      <div className="selfie-guideline-item guideline-prohibited">
                        <span>🚫</span><span>No <strong>sunglasses</strong></span>
                      </div>
                      <div className="selfie-guideline-item guideline-prohibited">
                        <span>🚫</span><span>No <strong>caps or hats</strong></span>
                      </div>
                    </div>

                    {photoPreviews.riderPhoto ? (
                      <div className="selfie-preview-wrapper">
                        <img src={photoPreviews.riderPhoto} alt="Selfie" className="selfie-preview-img" />
                        <div className="selfie-preview-actions">
                          <button type="button" className="photo-recrop-btn" onClick={() => {
                            setCropSrc(photoPreviews.riderPhoto);
                            setShowCrop(true);
                          }}>✂️ Re-crop</button>
                          <button type="button" className="photo-remove-btn-inline"
                            onClick={() => removePhoto('riderPhoto')}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`photo-upload-box selfie-upload-box ${errors.riderPhoto ? 'upload-error' : ''}`}
                        onClick={() => riderPhotoRef.current?.click()}>
                        <div className="selfie-upload-icon">🤳</div>
                        <div className="photo-upload-text">Take / upload selfie</div>
                        <div className="photo-upload-sub">JPG, PNG • 5MB max • You can crop after</div>
                      </div>
                    )}
                    <input ref={riderPhotoRef} type="file" accept="image/*" capture="user"
                      style={{ display: 'none' }} onChange={handleSelfieChange} />
                    {errors.riderPhoto && <span className="error-msg">⚠ {errors.riderPhoto}</span>}
                  </div>

                  {/* VALID ID 1 */}
                  <div className="rider-form-group">
                    <label>🪪 Valid ID #1 <span className="optional-tag">Optional</span></label>
                    <p className="upload-hint">Driver's License, PhilSys, Passport, SSS, UMID, etc.</p>

                    {photoPreviews.validId1 ? (
                      <div className="id-preview-wrapper">
                        <img src={photoPreviews.validId1} alt="ID 1" className="id-preview-img" />
                        <button type="button" className="photo-remove-abs" onClick={() => removePhoto('validId1')}>✕</button>
                      </div>
                    ) : (
                      <div className="photo-upload-box" onClick={() => validId1Ref.current?.click()}>
                        <div className="photo-upload-icon">📄</div>
                        <div className="photo-upload-text">Upload ID #1</div>
                        <div className="photo-upload-sub">JPG, PNG • 5MB max</div>
                      </div>
                    )}
                    <input ref={validId1Ref} type="file" accept="image/*" capture="environment"
                      style={{ display: 'none' }} onChange={(e) => handleIdChange(e, 'validId1')} />
                    {errors.validId1 && <span className="error-msg">⚠ {errors.validId1}</span>}
                  </div>

                  {/* VALID ID 2 */}
                  <div className="rider-form-group">
                    <label>🪪 Valid ID #2 <span className="optional-tag">Optional</span></label>
                    <p className="upload-hint">A different gov't-issued ID for verification.</p>

                    {photoPreviews.validId2 ? (
                      <div className="id-preview-wrapper">
                        <img src={photoPreviews.validId2} alt="ID 2" className="id-preview-img" />
                        <button type="button" className="photo-remove-abs" onClick={() => removePhoto('validId2')}>✕</button>
                      </div>
                    ) : (
                      <div className="photo-upload-box" onClick={() => validId2Ref.current?.click()}>
                        <div className="photo-upload-icon">📄</div>
                        <div className="photo-upload-text">Upload ID #2</div>
                        <div className="photo-upload-sub">JPG, PNG • 5MB max</div>
                      </div>
                    )}
                    <input ref={validId2Ref} type="file" accept="image/*" capture="environment"
                      style={{ display: 'none' }} onChange={(e) => handleIdChange(e, 'validId2')} />
                    {errors.validId2 && <span className="error-msg">⚠ {errors.validId2}</span>}
                  </div>
                </div>
              </div>

              {/* ── SUBMIT ── */}
              <button type="submit" className="rider-submit-btn" disabled={isLoading}>
                {isLoading
                  ? <span className="rider-submit-loading"><span className="rider-spinner" /> Submitting...</span>
                  : 'Submit Application'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
};

export default RiderRegistrationModal;