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

/** Best-effort city/country (IP) with timezone fallback. */
export async function guessLocation() {
  try {
    const ctrl = typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(3500)
      : undefined;
    const res = await fetch("https://ipapi.co/json/", {
      signal: ctrl,
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      const city = String(data?.city || "").trim();
      const region = String(data?.region || "").trim();
      const country = String(data?.country_name || data?.country || "").trim();
      const parts = [city || region, country].filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
  } catch { /* ignore */ }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz) return tz.replace(/_/g, " ");
  } catch { /* ignore */ }

  return "Unknown location";
}

export async function collectLoginDeviceInfo() {
  const deviceName = getDeviceLabel();
  const platform = getPlatformLabel();
  const location = await guessLocation();
  return { deviceName, location, platform };
}
