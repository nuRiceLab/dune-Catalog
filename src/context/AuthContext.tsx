'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSession, login as startLogin, logout as endLogout, type UserInfo } from '@/lib/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  user: UserInfo | null;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    const session = await getSession();
    setIsAuthenticated(session.authenticated);
    setUser(session.user ?? null);
    setIsLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = (): void => {
    startLogin();
  };

  const logout = async (): Promise<void> => {
    await endLogout();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isAdmin: user?.is_admin === true,
        user,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
