import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './PromoCodeInput.css';

/**
 * PromoCodeInput
 * 
 * Props:
 *  promos       — array from Convex getAllPromos (passed from parent)
 *  onPromoApplied(promoObj) — called when code is valid & applied
 *  onPromoRemoved()         — called when user removes the promo
 *  appliedPromo             — currently applied promo object (or null)
 *  subtotal                 — product price (number)
 *  productGroup             — kpopGroup of the product (string), used for group-lock validation
 */
const PromoCodeInput = ({
  promos = [],
  onPromoApplied,
  onPromoRemoved,
  appliedPromo,
  subtotal = 0,
  productGroup = '',
}) => {
  const { isAuthenticated } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleApply = () => {
    if (!isAuthenticated) {
      setError('Please login first to use a promo code.');
      return;
    }

    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter a promo code.');
      return;
    }

    setError('');
    setSuccess('');

    const today = new Date().toISOString().split('T')[0];
    const promo = promos.find(p => p.code === trimmed);

    if (!promo)           { setError('Invalid promo code.'); return; }
    if (!promo.isActive)  { setError('This promo is no longer active.'); return; }
    if (promo.startDate && promo.startDate > today) { setError('This promo has not started yet.'); return; }
    if (promo.endDate   && promo.endDate   < today) { setError('This promo has expired.'); return; }

    // ── Group-lock: promo name must match the product's kpop group ──
    // The promo "name" is the kpop group (e.g. "BTS", "BLACKPINK")
    // We do a case-insensitive check; if promo has no name, skip the check
    if (promo.name && productGroup) {
      const promoGroup   = promo.name.trim().toUpperCase();
      const prodGroupNorm = productGroup.trim().toUpperCase();
      if (promoGroup !== prodGroupNorm) {
        setError(
          `This promo is only valid for ${promo.name} merchandise. This product is ${productGroup}.`
        );
        return;
      }
    }

    const discountAmount = Math.min(
      Math.floor(subtotal * (promo.discount / 100)),
      promo.maxDiscount
    );

    setSuccess(`✅ "${promo.code}" applied! You save ₱${discountAmount.toLocaleString()}`);
    onPromoApplied({ ...promo, discountAmount });
  };

  const handleRemove = () => {
    setCode('');
    setError('');
    setSuccess('');
    onPromoRemoved();
  };

  // ── Applied state ──
  if (appliedPromo) {
    return (
      <div className="promo-input-wrapper applied">
        {/* ✅ Promo indicator banner */}
        <div className="promo-active-indicator">
          <span className="promo-active-dot" />
          <span className="promo-active-label">Promo Active</span>
          <span className="promo-active-group">{appliedPromo.name}</span>
        </div>

        <div className="promo-applied-info">
          <div className="promo-applied-left">
            <span className="promo-applied-icon">🎉</span>
            <div>
              <span className="promo-applied-code">{appliedPromo.code}</span>
              <span className="promo-applied-desc">
                {appliedPromo.discount}% off · Max ₱{appliedPromo.maxDiscount?.toLocaleString()}
              </span>
            </div>
          </div>
          <button className="promo-remove-btn" onClick={handleRemove}>Remove</button>
        </div>

        {appliedPromo.discountAmount > 0 && (
          <div className="promo-savings-row">
            You save: <strong>₱{appliedPromo.discountAmount.toLocaleString()}</strong>
          </div>
        )}
      </div>
    );
  }

  // ── Input state ──
  return (
    <div className="promo-input-wrapper">
      <label className="promo-input-label">
        <i className="fas fa-tag"></i> Promo Code
      </label>
      <div className="promo-input-row">
        <input
          type="text"
          className={`promo-input-field ${error ? 'promo-input-error' : ''} ${success ? 'promo-input-success' : ''}`}
          placeholder="Enter promo code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
            setSuccess('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
          }}
          maxLength={20}
        />
        <button
          className="promo-apply-btn"
          onClick={handleApply}
          disabled={!code.trim()}
        >
          Apply
        </button>
      </div>
      {error   && <p className="promo-msg promo-msg-error"><i className="fas fa-times-circle"></i> {error}</p>}
      {success && <p className="promo-msg promo-msg-success">{success}</p>}

      {/* Group hint — show if product has a group */}
      {productGroup && !error && !success && (
        <p className="promo-group-hint">
          <i className="fas fa-info-circle"></i> Promo codes for <strong>{productGroup}</strong> merch only
        </p>
      )}
    </div>
  );
};

export default PromoCodeInput;