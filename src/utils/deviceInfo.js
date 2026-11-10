/** Human-readable device / browser label for login alerts. */
export function getDeviceLabel() {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";

  let os = "Unknown device";
  if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "Mac";
  else if (/CrOS/i.test(ua)) os = "Chromebook";
  else if (/Linux/i.test(ua)) os = "Linux";

  let standalone = false;
  try {
    standalone =
      window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  } catch { /* ignore */ }

  if (standalone) return `DKMerch App · ${os}`;
  return `${browser} on ${os}`;
}

export function getPlatformLabel() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  return "Web";
}

const LOC_CACHE_KEY = "dkmerch_loc_v2";
const LOC_STICKY_MS = 30 * 24 * 60 * 60 * 1000;

/** City-level place only — never country-only / timezone. */
export function isSpecificPlace(place) {
  const p = String(place || "").trim();
  if (!p) return false;
  if (/^philippines$/i.test(p)) return false;
  if (/^unknown/i.test(p)) return false;
  if (/unavailable/i.test(p)) return false;
  if (/^[A-Za-z]+\/[A-Za-z_]+$/.test(p)) return false; // Asia/Manila
  if (/^asia\b/i.test(p) && !/,/.test(p)) return false;
  return true;
}

function readLocCache() {
  try {
    const raw = localStorage.getItem(LOC_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const place = String(parsed?.place || "").trim();
    const source = parsed?.source === "gps" ? "gps" : "ip";
    const at = Number(parsed?.at) || 0;
    if (!isSpecificPlace(place)) return null;
    return { place, source, at };
  } catch {
    return null;
  }
}

function writeLocCache(place, source) {
  if (!isSpecificPlace(place)) return;
  try {
    localStorage.setItem(
      LOC_CACHE_KEY,
      JSON.stringify({
        place: String(place).trim(),
        source: source === "gps" ? "gps" : "ip",
        at: Date.now(),
      })
    );
  } catch { /* ignore */ }
}

function formatPlace(parts) {
  return parts.filter(Boolean).join(", ");
}

async function reverseGeocode(lat, lon) {
  try {
    const ctrl = typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(3000)
      : undefined;
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}`
      + `&lon=${encodeURIComponent(lon)}&zoom=12&addressdetails=1`;
    const res = await fetch(url, {
      signal: ctrl,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address || {};
    const city =
      a.city
      || a.municipality
      || a.town
      || a.village
      || a.suburb
      || a.city_district
      || a.county
      || "";
    const region = a.state || a.region || "";
    const country = a.country || "";
    // Require a city/municipality — not country alone
    if (!city) return null;
    return formatPlace([city, country || region]);
  } catch {
    return null;
  }
}

async function lookupGpsLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 3000,
        maximumAge: 60 * 60 * 1000,
      });
    });
    const lat = pos?.coords?.latitude;
    const lon = pos?.coords?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const place = await reverseGeocode(lat, lon);
    return isSpecificPlace(place) ? place : null;
  } catch {
    return null;
  }
}

async function lookupIpLocation() {
  // Try two providers — require a city name (not country-only)
  const tryIpapi = async () => {
    const ctrl = typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(2500)
      : undefined;
    const res = await fetch("https://ipapi.co/json/", {
      signal: ctrl,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const city = String(data?.city || "").trim();
    const country = String(data?.country_name || data?.country || "").trim();
    if (!city) return null;
    return formatPlace([city, country || "Philippines"]);
  };

  const tryIpWho = async () => {
    const ctrl = typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(2500)
      : undefined;
    const res = await fetch("https://ipwho.is/", {
      signal: ctrl,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success === false) return null;
    const city = String(data?.city || "").trim();
    const country = String(data?.country || "").trim();
    if (!city) return null;
    return formatPlace([city, country || "Philippines"]);
  };

  try {
    const a = await tryIpapi();
    if (a) return a;
  } catch { /* ignore */ }
  try {
    const b = await tryIpWho();
    if (b) return b;
  } catch { /* ignore */ }
  return null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Resolve a city-level location quickly (GPS + IP in parallel).
 * Sticky cache prevents city flipping across logins.
 */
export async function guessLocation() {
  const cached = readLocCache();
  const cacheFresh = cached && (Date.now() - cached.at) < LOC_STICKY_MS;

  if (cached?.source === "gps" && cacheFresh) return cached.place;

  // Parallel GPS + IP for speed; prefer GPS
  const [gps, ip] = await Promise.all([
    withTimeout(lookupGpsLocation(), 3500),
    withTimeout(lookupIpLocation(), 2800),
  ]);

  if (isSpecificPlace(gps)) {
    writeLocCache(gps, "gps");
    return gps;
  }

  if (cached && cacheFresh) return cached.place;

  if (isSpecificPlace(ip)) {
    writeLocCache(ip, "ip");
    return ip;
  }

  return cached?.place || null;
}

/**
 * For login alerts: use sticky city cache, otherwise wait briefly for a real city.
 * Never returns bare "Philippines".
 */
export async function collectLoginDeviceInfo({ fast = true } = {}) {
  const deviceName = getDeviceLabel();
  const platform = getPlatformLabel();

  const cached = readLocCache();
  if (cached?.place && isSpecificPlace(cached.place)) {
    // Keep GPS upgrades warm without blocking
    try {
      Promise.resolve().then(() => guessLocation().catch(() => {}));
    } catch { /* ignore */ }
    return { deviceName, location: cached.place, platform };
  }

  // No city cached yet — wait a short moment so the alert shows a real city
  const waitMs = fast ? 3200 : 6000;
  const resolved = await withTimeout(guessLocation(), waitMs);
  if (isSpecificPlace(resolved)) {
    return { deviceName, location: resolved, platform };
  }

  // Last resort: one more short IP attempt
  const ipOnly = await withTimeout(lookupIpLocation(), 2000);
  if (isSpecificPlace(ipOnly)) {
    writeLocCache(ipOnly, "ip");
    return { deviceName, location: ipOnly, platform };
  }

  return {
    deviceName,
    location: "City unavailable — enable location access",
    platform,
  };
}
