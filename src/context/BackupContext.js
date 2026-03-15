// src/context/BackupContext.js
import React, { createContext, useContext, useState, useCallback } from 'react';

const BackupContext = createContext(null);

const STORAGE_KEY = 'dkmerch_backup_data';
const META_KEY    = 'dkmerch_backup_meta';

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const loadMetaFromStorage = () => {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : { lastFetched: null };
  } catch { return { lastFetched: null }; }
};

const saveToStorage = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
};

const saveMetaToStorage = (meta) => {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
};

export const BackupProvider = ({ children }) => {
  // ✅ Init from localStorage — survives page reloads & navigation
  const [allData, setAllData] = useState(() => loadFromStorage());
  const [loadStatus, setLoadStatus] = useState(() => {
    const stored = loadFromStorage();
    const status = {};
    for (const key of Object.keys(stored)) status[key] = 'done';
    return status;
  });
  const [lastFetched, setLastFetchedState] = useState(
    () => loadMetaFromStorage().lastFetched
  );

  const updateTable = useCallback((key, data) => {
    setAllData(prev => {
      const next = { ...prev, [key]: data };
      saveToStorage(next); // ✅ persist on every update
      return next;
    });
    setLoadStatus(prev => ({ ...prev, [key]: 'done' }));
  }, []);

  const setTableStatus = useCallback((key, status) => {
    setLoadStatus(prev => ({ ...prev, [key]: status }));
  }, []);

  // ✅ Only resets STATUS — keeps old data visible while refreshing
  const resetAll = useCallback((tableKeys) => {
    setLoadStatus(Object.fromEntries(tableKeys.map(k => [k, 'loading'])));
    // intentionally NOT wiping allData so cached data stays displayed
  }, []);

  const setLastFetched = useCallback((val) => {
    setLastFetchedState(val);
    saveMetaToStorage({ lastFetched: val });
  }, []);

  return (
    <BackupContext.Provider value={{
      allData, loadStatus, lastFetched,
      updateTable, setTableStatus, resetAll, setLastFetched,
    }}>
      {children}
    </BackupContext.Provider>
  );
};

export const useBackup = () => useContext(BackupContext);