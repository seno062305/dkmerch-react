const KEY = 'dkmerch_settings_backup_history_v1';

export function readLocalBackupHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushLocalBackupHistory(entry) {
  const next = [
    {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      ...entry,
    },
    ...readLocalBackupHistory(),
  ].slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function removeLocalBackupHistory(id) {
  const next = readLocalBackupHistory().filter((r) => r.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
