import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Organization, OrganizationRole, User } from '@solyra/shared';
import { client, createOrganizationApi, getOrganizationMembers, getOrganizations } from '../api/client';

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
  organizations: Organization[];
  currentOrganization: Organization | null;
  userOrgRole: OrganizationRole | null;
  isLoadingOrgs: boolean;
  switchOrganization: (orgId: string) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
  createOrganization: (name: string, slug?: string) => Promise<Organization>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [userOrgRole, setUserOrgRole] = useState<OrganizationRole | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  const refreshOrganizations = useCallback(async () => {
    if (!user) return;
    setIsLoadingOrgs(true);
    try {
      const orgs = await getOrganizations();
      setOrganizations(orgs);
      const saved = sessionStorage.getItem('activeOrganizationId');
      const current = orgs.find((org) => org.id === saved) ?? orgs[0] ?? null;
      setCurrentOrganization(current);
      if (current) {
        sessionStorage.setItem('activeOrganizationId', current.id);
        const member = (await getOrganizationMembers(current.id)).find((item) => item.userId === user.id);
        setUserOrgRole(member?.role ?? null);
      } else {
        sessionStorage.removeItem('activeOrganizationId');
        setUserOrgRole(null);
      }
    } catch { setOrganizations([]); setCurrentOrganization(null); setUserOrgRole(null); }
    finally { setIsLoadingOrgs(false); }
  }, [user]);

  const switchOrganization = useCallback(async (orgId: string) => {
    const target = organizations.find((org) => org.id === orgId);
    if (!target) return;
    setCurrentOrganization(target);
    sessionStorage.setItem('activeOrganizationId', target.id);
    const member = (await getOrganizationMembers(target.id)).find((item) => item.userId === user?.id);
    setUserOrgRole(member?.role ?? null);
  }, [organizations, user]);

  const createOrganization = useCallback(async (name: string, slug?: string) => {
    const created = await createOrganizationApi({ name, slug });
    await refreshOrganizations();
    await switchOrganization(created.id);
    return created;
  }, [refreshOrganizations, switchOrganization]);

  useEffect(() => { if (user) void refreshOrganizations(); }, [user, refreshOrganizations]);

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
      sessionStorage.removeItem('activeOrganizationId');
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
    sessionStorage.removeItem('activeOrganizationId');
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
        organizations,
        currentOrganization,
        userOrgRole,
        isLoadingOrgs,
        switchOrganization,
        refreshOrganizations,
        createOrganization,
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
