// src/context/BackupContext.js
import React, { createContext, useContext, useState } from 'react';

const BackupContext = createContext(null);

export const BackupProvider = ({ children }) => {
  const [allData,    setAllData]    = useState({});
  const [loadStatus, setLoadStatus] = useState({});
  const [lastFetched, setLastFetched] = useState(null);

  const updateTable = (key, data) => {
    setAllData(prev => ({ ...prev, [key]: data }));
    setLoadStatus(prev => ({ ...prev, [key]: 'done' }));
  };

  const setTableStatus = (key, status) => {
    setLoadStatus(prev => ({ ...prev, [key]: status }));
  };

  const resetAll = (tableKeys) => {
    setAllData({});
    setLoadStatus(Object.fromEntries(tableKeys.map(k => [k, 'loading'])));
  };

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