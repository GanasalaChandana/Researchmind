import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import HomeScreen from './screens/HomeScreen';
import ResearchScreen from './screens/ResearchScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';

type Tab = 'Home' | 'Research' | 'History' | 'Settings';

function AppContent() {
  const { colors } = useTheme();
  const { isAuthenticated, skipAuth, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  const [researchParams, setResearchParams] = useState<any>(null);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.brand, fontSize: 16 }}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated && !skipAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 50 }}>
        <LoginScreen />
      </View>
    );
  }

  const navigate = (screen: Tab, params?: any) => {
    if (params) setResearchParams(params);
    setActiveTab(screen);
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home': return <HomeScreen navigation={{ navigate }} />;
      case 'Research': return <ResearchScreen route={{ params: researchParams }} />;
      case 'History': return <HistoryScreen navigation={{ navigate }} />;
      case 'Settings': return <SettingsScreen />;
    }
  };

  const tabs: { name: Tab; icon: string; activeIcon: string }[] = [
    { name: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { name: 'Research', icon: 'search-outline', activeIcon: 'search' },
    { name: 'History', icon: 'time-outline', activeIcon: 'time' },
    { name: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 50 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {activeTab === 'Home' ? 'ResearchMind' : activeTab}
        </Text>
      </View>

      {/* Screen Content */}
      <View style={{ flex: 1 }}>
        {renderScreen()}
      </View>

      {/* Bottom Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.tabBar, borderTopColor: colors.border }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.name;
          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.name)}
            >
              <Ionicons
                name={(isActive ? tab.activeIcon : tab.icon) as any}
                size={24}
                color={isActive ? colors.brand : colors.textMuted}
              />
              <Text style={[styles.tabLabel, { color: isActive ? colors.brand : colors.textMuted }]}>
                {tab.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: 4,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
