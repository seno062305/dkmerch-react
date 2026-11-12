/** Shared store-radius / LBC delivery helpers */

/** Legacy Metro Manila box — kept only for old labels; prefer store radius. */
export const NCR_BOUNDS = {
  minLat: 14.35,
  maxLat: 14.80,
  minLng: 120.86,
  maxLng: 121.15,
};

export const LBC_TRACK_URL = 'https://www.lbcexpress.com/track/';

/** Flat provincial courier fee when address is outside rider range */
export const LBC_FLAT_SHIPPING_FEE = 250;

/** Max motorcycle delivery distance from store (km). Beyond this → LBC. */
export const RIDER_MAX_KM = 40;

export function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** @deprecated Prefer isWithinRiderRange with store coords */
export const isWithinNCR = (lat, lng) => {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
  return (
    la >= NCR_BOUNDS.minLat && la <= NCR_BOUNDS.maxLat &&
    ln >= NCR_BOUNDS.minLng && ln <= NCR_BOUNDS.maxLng
  );
};

/** True when pin is within motorcycle range of the store. */
export const isWithinRiderRange = (
  lat,
  lng,
  storeLat,
  storeLng,
  maxKm = RIDER_MAX_KM,
) => {
  const la = Number(lat);
  const ln = Number(lng);
  const sLat = Number(storeLat);
  const sLng = Number(storeLng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
  if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) {
    // No store pin — fall back to legacy NCR box
    return isWithinNCR(la, ln);
  }
  return getDistanceKm(sLat, sLng, la, ln) <= maxKm;
};

/**
 * Prefer stored deliveryMethod; otherwise use distance from store.
 * Mis-tagged LBC near the store still counts as rider-deliverable.
 */
export const isLbcOrder = (order, store = null) => {
  if (!order) return false;
  if (order.deliveryMethod === 'rider') return false;

  const storeLat = store?.storeLat ?? store?.lat;
  const storeLng = store?.storeLng ?? store?.lng;
  const lat = Number(order.addressLat);
  const lng = Number(order.addressLng);

  if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(Number(storeLat)) && Number.isFinite(Number(storeLng))) {
    return !isWithinRiderRange(lat, lng, storeLat, storeLng);
  }

  if (order.deliveryMethod === 'lbc') return true;
  if (order.addressLat != null && order.addressLng != null) {
    return !isWithinNCR(order.addressLat, order.addressLng);
  }
  return false;
};

/** Confirmed paid orders riders can claim */
export const isRiderAvailableOrder = (order, store = null) => {
  if (!order) return false;
  const st = String(order.orderStatus || '').toLowerCase();
  const label = String(order.status || '');
  const confirmed = st === 'confirmed' || label === 'Confirmed';
  if (!confirmed) return false;
  return !isLbcOrder(order, store);
};

export const openLbcTracker = () => {
  window.open(LBC_TRACK_URL, '_blank', 'noopener,noreferrer');
};
