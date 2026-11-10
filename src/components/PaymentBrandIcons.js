import React from 'react';

export const PAYMENT_LOGOS = {
  gcash: '/images/payments/gcash.svg',
  maya: '/images/payments/maya.svg',
};

/** Small GCash / Maya brand mark used across checkout, refunds, admin. */
export const PaymentBrandIcon = ({ brand, size = 28, className = '', alt }) => {
  const key = String(brand || '').toLowerCase();
  const src =
    key.includes('gcash') ? PAYMENT_LOGOS.gcash :
    key.includes('maya') || key.includes('paymaya') ? PAYMENT_LOGOS.maya :
    null;

  if (!src) return null;

  const label = key.includes('gcash') ? 'GCash' : 'Maya';

  return (
    <img
      src={src}
      alt={alt || label}
      className={`payment-brand-icon ${className}`.trim()}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, display: 'block', flexShrink: 0 }}
      draggable={false}
    />
  );
};

export default PaymentBrandIcon;
