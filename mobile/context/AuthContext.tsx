import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  research_count: number;
  api_key?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function authFetch(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/auth/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from AsyncStorage
    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          AsyncStorage.getItem('rm_token'),
          AsyncStorage.getItem('rm_user'),
        ]);
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authFetch('login', { email, password });
    await AsyncStorage.setItem('rm_token', data.access_token);
    await AsyncStorage.setItem('rm_refresh_token', data.refresh_token);
    await AsyncStorage.setItem('rm_user', JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await authFetch('register', { email, password, name });
    await AsyncStorage.setItem('rm_token', data.access_token);
    await AsyncStorage.setItem('rm_refresh_token', data.refresh_token);
    await AsyncStorage.setItem('rm_user', JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem('rm_refresh_token');
      if (refreshToken && token) {
        await authFetch('logout', { refresh_token: refreshToken }, token);
      }
    } catch {}
    await AsyncStorage.multiRemove(['rm_token', 'rm_refresh_token', 'rm_user']);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      isAuthenticated: !!user,
      login, register, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
