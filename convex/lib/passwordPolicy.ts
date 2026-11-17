/** How many previous passwords we remember (cannot be reused). */
export const PASSWORD_HISTORY_MAX = 10;

export function assertPasswordNotReused(
  current: string | undefined | null,
  history: string[] | undefined | null,
  nextPassword: string
): { ok: true } | { ok: false; message: string } {
  const next = String(nextPassword || "");
  if (!next) return { ok: false, message: "Password is required." };
  if (current != null && String(current) === next) {
    return {
      ok: false,
      message: "You can't reuse your current password. Choose a different one.",
    };
  }
  const hist = Array.isArray(history) ? history : [];
  if (hist.some((p) => String(p) === next)) {
    return {
      ok: false,
      message: "You can't reuse a previous password. Choose a different one.",
    };
  }
  return { ok: true };
}

/** Push current password into history when rotating to a new one. */
export function nextPasswordHistory(
  current: string | undefined | null,
  history: string[] | undefined | null
): string[] {
  const hist = Array.isArray(history) ? history.map((p) => String(p)) : [];
  const cur = current != null ? String(current) : "";
  if (cur) hist.unshift(cur);
  // Dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of hist) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= PASSWORD_HISTORY_MAX) break;
  }
  return out;
}
