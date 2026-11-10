export const APP_VERSION_KEY = 'dkmerch_app_version';

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
