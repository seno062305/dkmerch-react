/** Product sale schedule helpers (Philippine Time) */

/** Reject NaN / absurd values (concatenated digits, float corruption, etc.). */
export const MAX_SANE_PRICE = 1_000_000_000; // ₱1B

export const saneMoney = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0 || x > MAX_SANE_PRICE) return null;
  return x;
};

/** Format peso for UI; returns null if value is unusable. */
export const formatPeso = (n) => {
  const x = saneMoney(n);
  if (x == null) return null;
  return `₱${x.toLocaleString('en-PH')}`;
};

export const toPhtMs = (dateStr, timeStr = '00:00') => {
  if (!dateStr) return null;
  const t = timeStr || '00:00';
  const ms = new Date(`${dateStr}T${t}:00+08:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const formatSaleDateTime = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const time = timeStr || '00:00';
  return new Date(`${dateStr}T${time}:00+08:00`).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatSaleRange = (product) => {
  if (!product?.isSale && !product?.saleEndDate) return null;
  const start = formatSaleDateTime(product.saleStartDate, product.saleStartTime);
  const end = formatSaleDateTime(product.saleEndDate, product.saleEndTime);
  if (start && end) return `${start} – ${end}`;
  if (end) return `Until ${end}`;
  if (start) return `From ${start}`;
  return null;
};

/** Short customer-facing label: "Ends Nov 15, 11:59 PM" */
export const formatSaleEndLabel = (product) => {
  if (!product?.saleEndDate) return null;
  // No sale end date on out-of-stock items
  if (Number(product?.stock ?? 0) <= 0) return null;
  const end = formatSaleDateTime(product.saleEndDate, product.saleEndTime);
  return end ? `Ends ${end}` : null;
};

/** Compact badge line: "Until Nov 15, 11:59 PM" (admin-set end) */
export const formatSaleEndShort = (product) => {
  if (!product?.saleEndDate || Number(product?.stock ?? 0) <= 0) return null;
  const end = formatSaleDateTime(product.saleEndDate, product.saleEndTime || '23:59');
  return end ? `Until ${end}` : null;
};

/** True when product is marked on sale and current time is within sale window (if set). */
export const isSaleActive = (product, now = Date.now()) => {
  if (!product?.isSale) return false;
  const startMs = toPhtMs(product.saleStartDate, product.saleStartTime);
  const endMs = toPhtMs(product.saleEndDate, product.saleEndTime || '23:59');
  if (startMs != null && now < startMs) return false;
  if (endMs != null && now > endMs) return false;
  return true;
};

/**
 * True when listed price is lower than a sane original (discounted display).
 * Rejects corrupt / concatenated originals that would render as absurd ₱ amounts.
 */
export const hasDiscountedPrice = (product) => {
  const price = saneMoney(product?.price);
  const orig = saneMoney(product?.originalPrice);
  if (price == null || orig == null || orig <= price) return false;
  // Cap relative discount — e.g. reject ₱1 vs ₱1e15 style corruption
  if (orig > price * 50) return false;
  return true;
};

/**
 * Discount % for badges. Uses floor so we never overstate
 * (e.g. ₱1,329 of ₱1,350 → 1%, not rounded 2%).
 * Returns null when there is no usable discount.
 */
export const getDiscountPercent = (product) => {
  if (!hasDiscountedPrice(product)) return null;
  const price = saneMoney(product.price);
  const orig = saneMoney(product.originalPrice);
  if (price == null || orig == null || orig <= 0) return null;
  const exact = ((orig - price) / orig) * 100;
  if (!Number.isFinite(exact) || exact <= 0) return null;
  return Math.max(1, Math.min(99, Math.floor(exact + 1e-9)));
};

/**
 * Show a SALE badge when admin marked sale (active window) OR price is discounted.
 * Hidden when out of stock — no point advertising a sale you can't buy.
 * Works together with Pre-Order — both can show at once (while in stock).
 */
export const shouldShowSaleBadge = (product, now = Date.now()) => {
  if (!product) return false;
  if (Number(product.stock ?? 0) <= 0) return false;
  if (isSaleActive(product, now)) return true;
  return hasDiscountedPrice(product);
};

/** True when a pre-order product's release datetime (PHT) has passed. */
export const isProductReleased = (product, now = Date.now()) => {
  if (!product) return false;
  const isPre = !!(product.isPreOrder || product.status === 'preorder');
  if (!isPre && product.releasedAt) return true;
  if (!product.releaseDate) return !isPre;
  const ms = toPhtMs(product.releaseDate, product.releaseTime);
  return ms != null && now >= ms;
};

/** Show PRE-ORDER badge only while still unreleased. */
export const shouldShowPreOrderBadge = (product, now = Date.now()) => {
  if (!(product?.isPreOrder || product?.status === 'preorder')) return false;
  return !isProductReleased(product, now);
};

/**
 * New Arrivals window: 1–3 days after release (or createdAt if never a pre-order).
 * Default window = 3 days.
 */
export const NEW_ARRIVAL_DAYS = 3;

export const getProductNewAnchorMs = (product) => {
  if (!product) return 0;
  if (product.releasedAt) return Number(product.releasedAt) || 0;
  if (product.releaseDate) {
    const ms = toPhtMs(product.releaseDate, product.releaseTime);
    if (ms != null) return ms;
  }
  return Number(product._creationTime) || 0;
};

export const isNewArrival = (product, now = Date.now(), days = NEW_ARRIVAL_DAYS) => {
  const anchor = getProductNewAnchorMs(product);
  if (!anchor) return false;
  const age = now - anchor;
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
};

export const getDisplaySalePrice = (product) => {
  if (!product) return { price: 0, originalPrice: null, onSale: false };
  const price = saneMoney(product.price) ?? 0;
  const onSale = shouldShowSaleBadge(product) && hasDiscountedPrice(product);
  return {
    price,
    originalPrice: onSale ? saneMoney(product.originalPrice) : null,
    onSale,
  };
};
