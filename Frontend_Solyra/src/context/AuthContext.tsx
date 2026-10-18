import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@solyra/shared';
import { client } from '../api/client';

export interface AuthContextType {
  user: User | null;
  tier: 'guest' | 'member' | 'owner';
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setGuestMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const token = sessionStorage.getItem('token');
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const response = await client.get('/auth/me');
      if (response.data && response.data.user) {
        setUser(response.data.user);
        setIsGuest(false);
      }
    } catch (error) {
      console.error('Failed to refresh user profile:', error);
      sessionStorage.removeItem('token');
      setUser(null);
      setIsGuest(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = sessionStorage.getItem('token');
      if (token) {
        await refreshUser();
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await client.post('/auth/login', { email, password });
      const { user: authedUser, token } = response.data;
      if (token) {
        sessionStorage.setItem('token', token);
      }
      setUser(authedUser);
      setIsGuest(false);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (fullName: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await client.post('/auth/signup', { fullName, email, password });
      const { user: newUser, token } = response.data;
      if (token) {
        sessionStorage.setItem('token', token);
      }
      setUser(newUser);
      setIsGuest(false);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await client.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      sessionStorage.removeItem('token');
      setUser(null);
      setIsGuest(false);
    }
  };

  const setGuestMode = () => {
    sessionStorage.removeItem('token');
    setUser(null);
    setIsGuest(true);
  };

  const tier: 'guest' | 'member' | 'owner' = user ? (user.role === 'owner' || user.role === 'admin' ? 'owner' : 'member') : isGuest ? 'guest' : 'guest';

  return (
    <AuthContext.Provider
      value={{
        user,
        tier,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        refreshUser,
        setGuestMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
