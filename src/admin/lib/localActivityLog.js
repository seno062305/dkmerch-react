const STORAGE_KEY = 'dkmerch_activity_logs';
const MAX_LOGS = 300;

export function readActivityLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendActivityLog(entry) {
  try {
    const row = {
      _id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action: entry.action || 'event',
      actorEmail: entry.actorEmail || '',
      actorName: entry.actorName || '',
      actorRole: entry.actorRole || '',
      details: entry.details || '',
      createdAt: entry.createdAt || Date.now(),
    };
    const next = [row, ...readActivityLogs()].slice(0, MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('dkmerch-activity-log'));
    return row;
  } catch {
    return null;
  }
}

export function clearActivityLogs() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('dkmerch-activity-log'));
  } catch {}
}
