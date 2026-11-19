/** PayMongo e-wallet processing fees charged to the customer (VAT-inclusive rates). */

export const PAYMENT_FEE_RATES = {
  gcash: 0.0223, // 2.23%
  maya: 0.0179, // 1.79%
} as const;

export type PaymentFeeMethod = keyof typeof PAYMENT_FEE_RATES;

export function roundPeso(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function computePaymentFee(baseAmount: number, method: string) {
  const key: PaymentFeeMethod =
    method === "maya" || method === "paymaya" ? "maya" : "gcash";
  const rate = PAYMENT_FEE_RATES[key];
  const fee = roundPeso(Number(baseAmount) * rate);
  return {
    fee,
    rate,
    method: key,
    label: key === "maya" ? "Maya" : "GCash",
    ratePercent: roundPeso(rate * 100),
  };
}
