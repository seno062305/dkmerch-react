import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import './PromoCodeInput.css';

/**
 * PromoCodeInput — validates using Convex server time (anti-cheat)
 *
 * Props:
 *  promos           — array from Convex getAllPromos (for group-lock hint)
 *  onPromoApplied   — called with promoObj when valid
 *  onPromoRemoved   — called when user removes the promo
 *  appliedPromo     — currently applied promo object (or null)
 *  subtotal         — product price (number)
 *  productGroup     — kpopGroup of the product (string)
 */
const PromoCodeInput = ({
  promos = [],
  onPromoApplied,
  onPromoRemoved,
  appliedPromo,
  subtotal = 0,
  productGroup = '',
}) => {
  const { isAuthenticated, user } = useAuth();
  const [code, setCode] = useState('');
  const [pendingCode, setPendingCode] = useState(null); // code being validated
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const userEmail = String(user?.email || '').trim().toLowerCase();

  // Server time + one-use-per-account check
  const validationResult = useQuery(
    api.promos.validatePromo,
    pendingCode
      ? { code: pendingCode, ...(userEmail ? { email: userEmail } : {}) }
      : 'skip'
  );

  // When validation result comes back, process it
  React.useEffect(() => {
    if (!pendingCode || validationResult === undefined) return;

    if (!validationResult.valid) {
      setError(validationResult.message);
      setPendingCode(null);
      return;
    }

    const promo = validationResult.promo;

    // Group-lock check (client-side only — not security-critical)
    if (promo.name && productGroup) {
      const promoGroup = promo.name.trim().toUpperCase();
      const prodGroupNorm = productGroup.trim().toUpperCase();
      if (promoGroup !== prodGroupNorm) {
        setError(
          `This promo is only valid for ${promo.name} merchandise. This product is ${productGroup}.`
        );
        setPendingCode(null);
        return;
      }
    }

    const discountAmount = Math.min(
      Math.floor(subtotal * (promo.discount / 100)),
      promo.maxDiscount
    );

    setSuccess(`✅ "${promo.code}" applied! You save ₱${discountAmount.toLocaleString()}`);
    onPromoApplied({ ...promo, discountAmount });
    setPendingCode(null);
  }, [validationResult, pendingCode]); // eslint-disable-line

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
    // Trigger server validation
    setPendingCode(trimmed);
  };

  const handleRemove = () => {
    setCode('');
    setError('');
    setSuccess('');
    setPendingCode(null);
    onPromoRemoved();
  };

  const isValidating = !!pendingCode && validationResult === undefined;

  // ── Applied state ──
  if (appliedPromo) {
    return (
      <div className="promo-input-wrapper applied">
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
          disabled={isValidating}
        />
        <button
          className="promo-apply-btn"
          onClick={handleApply}
          disabled={!code.trim() || isValidating}
        >
          {isValidating ? '⏳' : 'Apply'}
        </button>
      </div>
      {error   && <p className="promo-msg promo-msg-error"><i className="fas fa-times-circle"></i> {error}</p>}
      {success && <p className="promo-msg promo-msg-success">{success}</p>}
      {isValidating && <p className="promo-msg" style={{ color: '#9333ea' }}>🔍 Checking code…</p>}

      {productGroup && !error && !success && !isValidating && (
        <p className="promo-group-hint">
          <i className="fas fa-info-circle"></i> Promo codes for <strong>{productGroup}</strong> merch only
        </p>
      )}
    </div>
  );
};

export default PromoCodeInput;