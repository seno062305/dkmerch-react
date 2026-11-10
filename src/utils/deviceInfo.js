function isStandalonePwa() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

function getBrowserLabel(ua) {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return "Browser";
}

/** Parse phone brand/model from UA when Client Hints aren't available. */
function parsePhoneFromUa(ua) {
  // Infinix_X6812 / Infinix X6812 / Infinix-Hot
  let m = ua.match(/\b(Infinix)[_\s-]?([A-Za-z0-9+-]+)?/i);
  if (m) return m[2] ? `Infinix ${m[2].replace(/_/g, " ")}` : "Infinix";

  m = ua.match(/\b(TECNO)[_\s-]?([A-Za-z0-9+-]+)?/i);
  if (m) return m[2] ? `TECNO ${m[2].replace(/_/g, " ")}` : "TECNO";

  m = ua.match(/\b(itel)[_\s-]?([A-Za-z0-9+-]+)?/i);
  if (m) return m[2] ? `itel ${m[2].replace(/_/g, " ")}` : "itel";

  m = ua.match(/\b(Redmi|POCO)[_\s-]?([A-Za-z0-9+-]+)?/i);
  if (m) return m[2] ? `${m[1]} ${m[2].replace(/_/g, " ")}` : m[1];

  m = ua.match(/\b(Mi|Xiaomi)\s+([A-Za-z0-9+-]+)/i);
  if (m) return `Xiaomi ${m[2]}`;

  m = ua.match(/\b(OPPO|CPH[0-9]+|P[A-Z]{2}M[0-9]+)\b/i);
  if (m) {
    if (/^CPH|^P[A-Z]{2}M/i.test(m[1])) return `OPPO ${m[1]}`;
    return "OPPO";
  }

  m = ua.match(/\b(vivo|V[0-9]{4}[A-Z]*)\b/i);
  if (m) return /^V[0-9]/i.test(m[1]) ? `vivo ${m[1]}` : "vivo";

  m = ua.match(/\b(realme|RMX[0-9]+)\b/i);
  if (m) return /^RMX/i.test(m[1]) ? `realme ${m[1]}` : "realme";

  m = ua.match(/\b(SM-[A-Z0-9]+)\b/i);
  if (m) return `Samsung ${m[1]}`;

  m = ua.match(/\b(Pixel\s?[0-9a-zA-Z]+)\b/i);
  if (m) return `Google ${m[1]}`;

  m = ua.match(/\b(Nokia\s?[A-Za-z0-9]+)\b/i);
  if (m) return m[1];

  m = ua.match(/\b(Huawei|Honor)[_\s-]?([A-Za-z0-9+-]+)?/i);
  if (m) return m[2] ? `${m[1]} ${m[2]}` : m[1];

  // Generic Android device model in "; MODEL Build/" segment
  m = ua.match(/Android[^;]*;\s*([^;)]+?)\s*(?:Build\/|\))/i);
  if (m) {
    let model = m[1].trim();
    model = model.replace(/^wv$/i, "").trim();
    // Chrome UA-reduction uses "K" as a fake model — ignore placeholders
    if (
      model
      && !/^(Linux|U|Mobile|armv|Android|K|WK|Phone|Tablet)$/i.test(model)
      && model.length > 1
      && model.length < 40
    ) {
      return model.replace(/_/g, " ");
    }
  }
  return "";
}

/** Drop Chrome privacy placeholders / junk models. */
function sanitizePhoneModel(raw) {
  const model = String(raw || "").trim();
  if (!model) return "";
  if (/^(K|WK|Mobile|Android|Phone|Tablet|Unknown|null|undefined)$/i.test(model)) return "";
  if (model.length < 2) return "";
  return model.replace(/_/g, " ");
}

async function getClientHintModel() {
  try {
    const uaData = navigator.userAgentData;
    if (!uaData?.getHighEntropyValues) return "";
    const hints = await Promise.race([
      uaData.getHighEntropyValues(["model", "platform", "platformVersion", "fullVersionList"]),
      new Promise((r) => setTimeout(() => r(null), 800)),
    ]);
    return sanitizePhoneModel(hints?.model);
  } catch {
    return "";
  }
}

/**
 * Human-readable device label for login alerts.
 * Prefers phone brand/model (e.g. Infinix X6812) when detectable.
 */
export async function getDeviceLabel() {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";
  const browser = getBrowserLabel(ua);
  const standalone = isStandalonePwa();
  const hintModel = await getClientHintModel();
  const uaPhone = sanitizePhoneModel(parsePhoneFromUa(ua));
  const phoneModel = sanitizePhoneModel(hintModel || uaPhone);

  if (/iPhone/i.test(ua)) {
    return standalone ? "DKMerch App · iPhone" : "Safari on iPhone";
  }
  if (/iPad/i.test(ua)) {
    return standalone ? "DKMerch App · iPad" : `${browser} on iPad`;
  }
  if (/Android/i.test(ua)) {
    const name = phoneModel || "Android phone";
    if (standalone) return `DKMerch App · ${name}`;
    return `${browser} on ${name}`;
  }
  if (/Windows NT/i.test(ua)) {
    return standalone ? "DKMerch App · Windows" : `${browser} on Windows`;
  }
  if (/Mac OS X/i.test(ua)) {
    return standalone ? "DKMerch App · Mac" : `${browser} on Mac`;
  }
  if (/CrOS/i.test(ua)) return `${browser} on Chromebook`;
  if (/Linux/i.test(ua)) return `${browser} on Linux`;

  if (standalone) return phoneModel ? `DKMerch App · ${phoneModel}` : "DKMerch App";
  return phoneModel ? `${browser} on ${phoneModel}` : browser;
}

/** Sync fallback when async label isn't ready yet. */
export function getDeviceLabelSync() {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";
  const browser = getBrowserLabel(ua);
  const standalone = isStandalonePwa();
  const phoneModel = sanitizePhoneModel(parsePhoneFromUa(ua));
  if (/iPhone/i.test(ua)) return standalone ? "DKMerch App · iPhone" : "Safari on iPhone";
  if (/iPad/i.test(ua)) return standalone ? "DKMerch App · iPad" : `${browser} on iPad`;
  if (/Android/i.test(ua)) {
    const name = phoneModel || "Android phone";
    return standalone ? `DKMerch App · ${name}` : `${browser} on ${name}`;
  }
  if (/Windows NT/i.test(ua)) return `${browser} on Windows`;
  if (/Mac OS X/i.test(ua)) return `${browser} on Mac`;
  return browser;
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

/** True when the label / platform looks like a phone or tablet. */
export function isMobileDeviceLabel(deviceName = "", platform = "") {
  const s = `${deviceName} ${platform}`.toLowerCase();
  if (/windows|mac\b|macos|chromebook|linux(?!\s*android)/i.test(s)) return false;
  return /android|iphone|ipad|ios|mobile|phone|infinix|tecno|itel|redmi|poco|xiaomi|oppo|vivo|realme|sm-|pixel|nokia|huawei|honor/i.test(s);
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
  const platform = getPlatformLabel();
  // Prefer detailed model (Infinix, etc.); fall back sync if hints are slow
  const deviceName =
    (await withTimeout(getDeviceLabel(), 500)) || getDeviceLabelSync();

  const cached = readLocCache();
  if (cached?.place && isSpecificPlace(cached.place)) {
    try {
      Promise.resolve().then(() => guessLocation().catch(() => {}));
    } catch { /* ignore */ }
    return { deviceName, location: cached.place, platform };
  }

  const waitMs = fast ? 3200 : 6000;
  const resolved = await withTimeout(guessLocation(), waitMs);
  if (isSpecificPlace(resolved)) {
    return { deviceName, location: resolved, platform };
  }

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
