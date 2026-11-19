/** Shared store-radius / LBC delivery helpers */

/** Approximate Philippines land bbox — pins outside this are blocked. */
export const PH_BOUNDS = {
  minLat: 4.2,
  maxLat: 21.5,
  minLng: 116.0,
  maxLng: 127.0,
};

/** Legacy Metro Manila box — kept only for old labels; prefer store radius. */
export const NCR_BOUNDS = {
  minLat: 14.35,
  maxLat: 14.80,
  minLng: 120.86,
  maxLng: 121.15,
};

export const isInPhilippinesBounds = (lat, lng) => {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return (
    la >= PH_BOUNDS.minLat && la <= PH_BOUNDS.maxLat &&
    ln >= PH_BOUNDS.minLng && ln <= PH_BOUNDS.maxLng
  );
};

/**
 * Nominatim reverse/search result must be land in the Philippines
 * (blocks other countries, ocean/sea, and empty water pins).
 * Offshore taps near coast often reverse to a city-only admin — those are rejected.
 */
export const isPhilippinesLandResult = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (data.error) return false;
  const a = data.address || {};
  const cc = String(a.country_code || '').toLowerCase();
  const display = String(data.display_name || data.name || '');
  if (cc && cc !== 'ph') return false;
  if (!cc && !/philippines/i.test(display)) return false;

  // Explicit water tags from reverse geocode
  if (a.ocean || a.sea || a.bay || a.water || a.strait || a.channel || a.fjord) {
    return false;
  }

  const cls = String(data.class || data.category || '').toLowerCase();
  const typ = String(data.type || data.addresstype || '').toLowerCase();
  const waterTypes = new Set([
    'water', 'bay', 'ocean', 'sea', 'strait', 'channel', 'coastline',
    'river', 'wetland', 'reef', 'lagoon', 'reservoir', 'harbour', 'harbor',
    'ferry_terminal',
  ]);
  if (cls === 'waterway' || cls === 'water') return false;
  if (cls === 'natural' && waterTypes.has(typ)) return false;
  if (cls === 'place' && (typ === 'ocean' || typ === 'sea' || typ === 'bay')) return false;
  if (waterTypes.has(typ)) return false;
  if (/^(philippine sea|south china sea|celebes sea|sulu sea|pacific ocean|manila bay)\b/i.test(display.trim())) {
    return false;
  }
  // Water feature named in the label without a street (typical offshore snap)
  if (
    /\b(sea|ocean|bay|strait|channel|gulf|reef|lagoon|harbour|harbor)\b/i.test(display)
    && !a.road && !a.pedestrian && !a.house_number
  ) {
    return false;
  }

  // Must resolve to a deliverable place — city/municipality alone is not enough
  // (blocks sea pins that snap to "Limay, Bataan" with no street/barangay).
  const hasDeliverablePlace = !!(
    a.road || a.pedestrian || a.residential || a.house_number || a.building
    || a.amenity || a.shop || a.tourism || a.office || a.industrial
    || a.suburb || a.neighbourhood || a.barangay || a.village
    || a.hamlet || a.quarter || a.city_district
  );
  if (!hasDeliverablePlace) return false;

  const lat = parseFloat(data.lat);
  const lon = parseFloat(data.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && !isInPhilippinesBounds(lat, lon)) {
    return false;
  }
  return true;
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
