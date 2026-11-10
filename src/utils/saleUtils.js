/** Product sale schedule helpers (Philippine Time) */

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
  if (!product?.isSale) return null;
  const start = formatSaleDateTime(product.saleStartDate, product.saleStartTime);
  const end = formatSaleDateTime(product.saleEndDate, product.saleEndTime);
  if (start && end) return `${start} – ${end}`;
  if (end) return `Until ${end}`;
  if (start) return `From ${start}`;
  return null;
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

/** True when listed price is lower than original (discounted display). */
export const hasDiscountedPrice = (product) =>
  Number(product?.originalPrice) > Number(product?.price);

/**
 * Show a SALE badge when admin marked sale (active window) OR price is discounted.
 * Works together with Pre-Order — both can show at once.
 */
export const shouldShowSaleBadge = (product, now = Date.now()) => {
  if (!product) return false;
  if (isSaleActive(product, now)) return true;
  return hasDiscountedPrice(product);
};

export const shouldShowPreOrderBadge = (product) => !!(product?.isPreOrder || product?.status === 'preorder');

export const getDisplaySalePrice = (product) => {
  if (!product) return { price: 0, originalPrice: null, onSale: false };
  const onSale = shouldShowSaleBadge(product) && hasDiscountedPrice(product);
  return {
    price: Number(product.price) || 0,
    originalPrice: onSale ? Number(product.originalPrice) : null,
    onSale,
  };
};
