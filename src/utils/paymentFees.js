/** PayMongo e-wallet processing fees charged to the customer (VAT-inclusive rates). */

export const PAYMENT_FEE_RATES = {
  gcash: 0.0223, // 2.23%
  maya: 0.0179,  // 1.79%
};

export const PAYMENT_FEE_LABELS = {
  gcash: 'GCash',
  maya: 'Maya',
};

/** Round to 2 decimal places (PHP). */
export function roundPeso(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Fee on merchandise + shipping (before fee).
 * @param {number} baseAmount
 * @param {'gcash'|'maya'} method
 */
export function computePaymentFee(baseAmount, method) {
  const key = method === 'maya' || method === 'paymaya' ? 'maya' : 'gcash';
  const rate = PAYMENT_FEE_RATES[key] ?? 0;
  const fee = roundPeso(Number(baseAmount) * rate);
  return {
    fee,
    rate,
    method: key,
    label: PAYMENT_FEE_LABELS[key] || 'E-wallet',
    ratePercent: roundPeso(rate * 100),
  };
}

export function formatFeeRatePercent(rate) {
  const p = roundPeso((Number(rate) || 0) * 100);
  return `${p}%`;
}
