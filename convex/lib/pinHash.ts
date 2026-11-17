export const PIN_RE = /^\d{4,6}$/;
export const PIN_SET_RE = /^\d{6}$/;

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isPlainPin(value: unknown): value is string {
  return typeof value === "string" && PIN_RE.test(value);
}
