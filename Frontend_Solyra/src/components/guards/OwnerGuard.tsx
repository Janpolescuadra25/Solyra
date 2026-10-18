import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const OwnerGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, tier } = useAuth();

  if (tier !== 'owner' && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
