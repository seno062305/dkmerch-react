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

export function isAppOutdated(latestVersion) {
  if (!latestVersion) return false;
  return getInstalledAppVersion() !== String(latestVersion);
}

export function dismissUpdatePrompt(version) {
  try {
    sessionStorage.setItem(`dkmerch_update_dismiss_${version}`, '1');
  } catch { /* ignore */ }
}

export function isUpdatePromptDismissed(version) {
  if (!version) return false;
  try {
    return sessionStorage.getItem(`dkmerch_update_dismiss_${version}`) === '1';
  } catch {
    return false;
  }
}
