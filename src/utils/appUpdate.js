export const APP_VERSION_KEY = 'dkmerch_app_version';
/** Survives update reload / SW restart — AuthContext restores without PIN/logout. */
export const KEEP_SESSION_AFTER_UPDATE_KEY = 'dkmerch_keep_session_after_update';

export function getInstalledAppVersion() {
  try {
    return localStorage.getItem(APP_VERSION_KEY) || '';
  } catch {
    return '';
  }
}

export function setInstalledAppVersion(version) {
  try {
    localStorage.setItem(APP_VERSION_KEY, String(version || ''));
  } catch { /* ignore */ }
}

/** Call right before update reload so every role stays signed in. */
export function markKeepSessionAfterUpdate() {
  try {
    localStorage.setItem(KEEP_SESSION_AFTER_UPDATE_KEY, String(Date.now()));
  } catch { /* ignore */ }
  try {
    sessionStorage.setItem('dkmerch_session_alive', '1');
  } catch { /* ignore */ }
}

/** One-shot: true if an update just finished (within 10 minutes). */
export function consumeKeepSessionAfterUpdate() {
  try {
    const raw = localStorage.getItem(KEEP_SESSION_AFTER_UPDATE_KEY);
    localStorage.removeItem(KEEP_SESSION_AFTER_UPDATE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * First visit: seed installed version so the prompt does not loop on every reload.
 * Only treat as outdated when a previously installed version differs from latest.
 */
export function isAppOutdated(latestVersion) {
  if (!latestVersion) return false;
  const latest = String(latestVersion);
  const installed = getInstalledAppVersion();
  if (!installed) {
    setInstalledAppVersion(latest);
    return false;
  }
  return installed !== latest;
}

export function dismissUpdatePrompt(version) {
  try {
    // Persist across reloads for this version (Maybe later / X)
    localStorage.setItem(`dkmerch_update_dismiss_${version}`, '1');
  } catch { /* ignore */ }
}

export function isUpdatePromptDismissed(version) {
  if (!version) return false;
  try {
    return localStorage.getItem(`dkmerch_update_dismiss_${version}`) === '1';
  } catch {
    return false;
  }
}

export function clearUpdatePromptDismiss(version) {
  try {
    localStorage.removeItem(`dkmerch_update_dismiss_${version}`);
  } catch { /* ignore */ }
}
