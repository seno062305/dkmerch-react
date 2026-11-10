/** Shared NCR / LBC delivery helpers */

export const NCR_BOUNDS = {
  minLat: 14.35,
  maxLat: 14.80,
  minLng: 120.86,
  maxLng: 121.15,
};

export const LBC_TRACK_URL = 'https://www.lbcexpress.com/track/';

/** Flat provincial courier fee when address is outside Metro Manila */
export const LBC_FLAT_SHIPPING_FEE = 250;

export const isWithinNCR = (lat, lng) => {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
  return (
    la >= NCR_BOUNDS.minLat && la <= NCR_BOUNDS.maxLat &&
    ln >= NCR_BOUNDS.minLng && ln <= NCR_BOUNDS.maxLng
  );
};

/** Prefer stored deliveryMethod; fall back to map pin outside NCR */
export const isLbcOrder = (order) => {
  if (!order) return false;
  if (order.deliveryMethod === 'lbc') return true;
  if (order.deliveryMethod === 'rider') return false;
  if (order.addressLat != null && order.addressLng != null) {
    return !isWithinNCR(order.addressLat, order.addressLng);
  }
  return false;
};

export const openLbcTracker = () => {
  window.open(LBC_TRACK_URL, '_blank', 'noopener,noreferrer');
};
