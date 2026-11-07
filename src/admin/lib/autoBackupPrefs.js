const STORAGE_KEY = 'dkmerch_auto_backup_prefs';

const DEFAULTS = {
  schedule: 'off',
  lastAutoBackupAt: null,
  lastRestoreAt: null,
};

export function readAutoBackupPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeAutoBackupPrefs(patch) {
  const next = { ...readAutoBackupPrefs(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('dkmerch-auto-backup-prefs'));
  return next;
}
