import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Switch, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [cacheEnabled, setCacheEnabled] = useState(true);

  const s = makeStyles(colors);

  const handleClearCache = () => {
    Alert.alert('Clear Cache?', 'This will remove all cached research data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => Alert.alert('Success', 'Cache cleared') },
    ]);
  };

  const SettingRow = ({
    icon, title, subtitle, onPress, rightElement,
  }: {
    icon: string; title: string; subtitle?: string;
    onPress?: () => void; rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity style={s.settingRow} onPress={onPress} disabled={!onPress && !rightElement}>
      <View style={s.settingLeft}>
        <Ionicons name={icon as any} size={20} color={colors.brand} />
        <View style={s.settingText}>
          <Text style={s.settingTitle}>{title}</Text>
          {subtitle && <Text style={s.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement ?? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={s.container}>

      {/* ── Appearance ── */}
      <Text style={s.sectionTitle}>Appearance</Text>
      <View style={s.sectionContent}>
        <SettingRow
          icon={isDark ? 'moon' : 'sunny'}
          title="Dark Mode"
          subtitle={isDark ? 'Currently dark' : 'Currently light'}
          rightElement={
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor="#ffffff"
            />
          }
        />
      </View>

      {/* ── General ── */}
      <Text style={s.sectionTitle}>General</Text>
      <View style={s.sectionContent}>
        <SettingRow
          icon="notifications"
          title="Notifications"
          subtitle="Research complete alerts"
          rightElement={
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor="#ffffff"
            />
          }
        />
        <SettingRow
          icon="layers"
          title="Cache Results"
          subtitle="Speeds up repeated searches"
          rightElement={
            <Switch
              value={cacheEnabled}
              onValueChange={setCacheEnabled}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor="#ffffff"
            />
          }
        />
      </View>

      {/* ── Data ── */}
      <Text style={s.sectionTitle}>Data</Text>
      <View style={s.sectionContent}>
        <SettingRow icon="trash" title="Clear Cache" subtitle="Remove all cached research" onPress={handleClearCache} />
      </View>

      {/* ── About ── */}
      <Text style={s.sectionTitle}>About</Text>
      <View style={s.sectionContent}>
        <SettingRow
          icon="information-circle"
          title="About ResearchMind"
          onPress={() => Alert.alert('ResearchMind Mobile', 'Version 1.0.0\nAI-powered research agent\nBuilt with React Native & Expo', [{ text: 'OK' }])}
        />
        <SettingRow
          icon="globe"
          title="Visit Website"
          subtitle="researchmind-app.vercel.app"
          onPress={() => Linking.openURL('https://researchmind-app.vercel.app')}
        />
        <SettingRow
          icon="logo-github"
          title="GitHub Repository"
          onPress={() => Linking.openURL('https://github.com/GanasalaChandana/Researchmind')}
        />
      </View>

      {/* ── API Status ── */}
      <Text style={s.sectionTitle}>API Status</Text>
      <View style={s.sectionContent}>
        <View style={s.statusRow}>
          <View style={[s.statusDot, { backgroundColor: colors.success }]} />
          <View>
            <Text style={s.statusTitle}>Backend Online</Text>
            <Text style={s.statusUrl}>{BACKEND_URL}</Text>
          </View>
        </View>
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>ResearchMind Mobile v1.0.0</Text>
        <Text style={s.footerSub}>© 2024 ResearchMind</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: colors.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.6,
      paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
    },
    sectionContent: { borderTopColor: colors.border, borderTopWidth: 1, borderBottomColor: colors.border, borderBottomWidth: 1 },
    settingRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 13,
      backgroundColor: colors.surface,
      borderBottomColor: colors.border, borderBottomWidth: 1,
    },
    settingLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    settingText: { flex: 1 },
    settingTitle: { fontSize: 15, fontWeight: '500', color: colors.text },
    settingSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    statusRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 13,
      backgroundColor: colors.surface,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusTitle: { fontSize: 14, fontWeight: '500', color: colors.text },
    statusUrl: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    footer: { paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center', marginTop: 16 },
    footerText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
    footerSub: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  });
