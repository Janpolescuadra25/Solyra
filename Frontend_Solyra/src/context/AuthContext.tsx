import React, { createContext, useContext, useState } from 'react';
import type { User } from '@solyra/shared';

export type AuthTier = 'guest' | 'member' | 'owner';

interface AuthContextType {
  user: User | null;
  token: string | null;
  tier: AuthTier;
  isAuthenticated: boolean;
  isGuest: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setGuestMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('solyra_auth_token'));
  const [user, setUser] = useState<User | null>(() => {
    const stored = sessionStorage.getItem('solyra_user');
    return stored ? (JSON.parse(stored) as User) : null;
  });

  const tier: AuthTier = !user || user.isGuest ? 'guest' : user.role === 'admin' ? 'owner' : 'member';

  const login = (newToken: string, newUser: User) => {
    sessionStorage.setItem('solyra_auth_token', newToken);
    sessionStorage.setItem('solyra_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    sessionStorage.removeItem('solyra_auth_token');
    sessionStorage.removeItem('solyra_user');
    setToken(null);
    setUser(null);
  };

  const setGuestMode = () => {
    logout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        tier,
        isAuthenticated: !!token && !!user && !user.isGuest,
        isGuest: tier === 'guest',
        login,
        logout,
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
