// src/context/RewardsContext.js
import React, { createContext, useContext, useState } from 'react';

const RewardsContext = createContext(null);

export const RewardsProvider = ({ children }) => {
  const [showRewardsModal, setShowRewardsModal] = useState(false);

  return (
    <RewardsContext.Provider value={{ showRewardsModal, setShowRewardsModal }}>
      {children}
    </RewardsContext.Provider>
  );
};

export const useRewards = () => useContext(RewardsContext);