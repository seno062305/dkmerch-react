/** Shared cooldown so file exports/downloads cannot be spammed. */
export const EXPORT_COOLDOWN_MS = 30_000;

const STORAGE_KEY = 'dkmerch_export_cooldown_until';

export class ExportCooldownError extends Error {
  constructor(remainingMs) {
    const secs = Math.max(1, Math.ceil(remainingMs / 1000));
    super(`Please wait ${secs}s before downloading again.`);
    this.name = 'ExportCooldownError';
    this.remainingMs = remainingMs;
  }
}

export function getExportCooldownRemainingMs(now = Date.now()) {
  if (typeof localStorage === 'undefined') return 0;
  const until = Number(localStorage.getItem(STORAGE_KEY) || 0);
  if (!Number.isFinite(until) || until <= now) return 0;
  return until - now;
}

export function assertExportAllowed(now = Date.now()) {
  const remaining = getExportCooldownRemainingMs(now);
  if (remaining > 0) throw new ExportCooldownError(remaining);
}

export function markExportStarted(now = Date.now()) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, String(now + EXPORT_COOLDOWN_MS));
}

/** Check cooldown, run export, mark cooldown only on success. */
export async function withExportCooldown(fn) {
  assertExportAllowed();
  const result = await fn();
  markExportStarted();
  return result;
}

export function formatExportCooldownMessage(error) {
  if (error instanceof ExportCooldownError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Export is temporarily unavailable. Try again shortly.';
}
