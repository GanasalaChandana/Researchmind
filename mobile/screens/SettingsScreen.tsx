import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

export default function SettingsScreen() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [cacheEnabled, setCacheEnabled] = useState(true);

  const handleOpenLink = (url: string) => {
    Linking.openURL(url);
  };

  const handleAbout = () => {
    Alert.alert(
      'ResearchMind Mobile',
      'Version 1.0.0\n\nAI-powered research agent\n\nBuilt with React Native & Expo',
      [{ text: 'OK' }]
    );
  };

  const handleClearCache = () => {
    Alert.alert('Clear Cache?', 'This will remove all cached research data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          // In a real app, clear async storage here
          Alert.alert('Success', 'Cache cleared');
        },
      },
    ]);
  };

  const SettingRow = ({
    icon,
    title,
    subtitle,
    onPress,
    rightElement,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={!onPress && !rightElement}
    >
      <View style={styles.settingLeft}>
        <Ionicons name={icon as any} size={20} color="#3b82f6" />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={20} color="#475569" />}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      {/* General Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        <View style={styles.sectionContent}>
          <SettingRow
            icon="moon"
            title="Dark Mode"
            rightElement={
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: '#334155', true: '#3b82f6' }}
                thumbColor={darkMode ? '#ffffff' : '#cbd5e1'}
              />
            }
          />
          <SettingRow
            icon="notifications"
            title="Notifications"
            rightElement={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#334155', true: '#3b82f6' }}
                thumbColor={notifications ? '#ffffff' : '#cbd5e1'}
              />
            }
          />
          <SettingRow
            icon="layers"
            title="Cache Enabled"
            subtitle="Speeds up repeated searches"
            rightElement={
              <Switch
                value={cacheEnabled}
                onValueChange={setCacheEnabled}
                trackColor={{ false: '#334155', true: '#3b82f6' }}
                thumbColor={cacheEnabled ? '#ffffff' : '#cbd5e1'}
              />
            }
          />
        </View>
      </View>

      {/* Data Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <View style={styles.sectionContent}>
          <SettingRow
            icon="trash"
            title="Clear Cache"
            subtitle="Remove all cached research"
            onPress={handleClearCache}
          />
        </View>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.sectionContent}>
          <SettingRow
            icon="information-circle"
            title="About ResearchMind"
            onPress={handleAbout}
          />
          <SettingRow
            icon="globe"
            title="Visit Website"
            subtitle="researchmind-app.vercel.app"
            onPress={() =>
              handleOpenLink('https://researchmind-app.vercel.app')
            }
          />
          <SettingRow
            icon="logo-github"
            title="GitHub Repository"
            onPress={() =>
              handleOpenLink(
                'https://github.com/ganasalachandana/researchmind'
              )
            }
          />
          <SettingRow
            icon="mail"
            title="Feedback & Support"
            onPress={() => handleOpenLink('mailto:support@researchmind.ai')}
          />
        </View>
      </View>

      {/* API Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Status</Text>
        <View style={styles.sectionContent}>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <View>
              <Text style={styles.statusTitle}>Backend Server</Text>
              <Text style={styles.statusUrl}>{BACKEND_URL}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>ResearchMind Mobile v1.0.0</Text>
        <Text style={styles.footerSubtext}>© 2024 ResearchMind. All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  section: {
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },
  sectionContent: {
    borderTopColor: '#334155',
    borderTopWidth: 1,
    borderBottomColor: '#334155',
    borderBottomWidth: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: '#1e293b',
    borderBottomWidth: 1,
  },
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 4,
  },
  statusUrl: {
    fontSize: 11,
    color: '#64748b',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 32,
    alignItems: 'center',
    borderTopColor: '#334155',
    borderTopWidth: 1,
    marginTop: 16,
  },
  footerText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  footerSubtext: {
    color: '#64748b',
    fontSize: 11,
  },
});
