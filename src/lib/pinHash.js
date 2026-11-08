/** SHA-256 hex digest for login PINs (browser). */
export async function hashPin(pin) {
  if (!pin || typeof pin !== "string") return "";
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isPlainPin(value) {
  return typeof value === "string" && /^\d{4,6}$/.test(value);
}
