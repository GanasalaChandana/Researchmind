import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
  colors: typeof darkColors;
}

export const darkColors = {
  bg: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  text: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  brand: '#3b82f6',
  brandLight: '#1e40af',
  error: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  inputBg: '#1e293b',
  cardBg: '#1e293b',
  tabBar: '#0f172a',
  headerBg: '#1e293b',
};

export const lightColors = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  brand: '#3b82f6',
  brandLight: '#dbeafe',
  error: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  inputBg: '#f1f5f9',
  cardBg: '#ffffff',
  tabBar: '#ffffff',
  headerBg: '#ffffff',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState<Theme>(systemScheme === 'dark' ? 'dark' : 'dark'); // default dark

  useEffect(() => {
    // Load saved theme from storage
    AsyncStorage.getItem('rm_theme').then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
      }
    });
  }, []);

  const toggleTheme = async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    await AsyncStorage.setItem('rm_theme', next);
  };

  const isDark = theme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
