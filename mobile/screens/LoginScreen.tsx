import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LoginScreen() {
  const { login, register, continueAsGuest } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register(email.trim().toLowerCase(), password, name.trim());
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoSection}>
          <View style={s.logoIcon}>
            <Ionicons name="sparkles" size={32} color={colors.brand} />
          </View>
          <Text style={s.appName}>ResearchMind</Text>
          <Text style={s.tagline}>AI-powered research in your pocket</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </Text>
          <Text style={s.cardSubtitle}>
            {mode === 'login'
              ? 'Sign in to access your research history'
              : 'Start researching with AI agents'}
          </Text>

          {mode === 'register' && (
            <View style={s.inputGroup}>
              <Text style={s.label}>Full Name</Text>
              <View style={s.inputRow}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={s.inputGroup}>
            <Text style={s.label}>Email</Text>
            <View style={s.inputRow}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Password</Text>
            <View style={s.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Min. 8 characters"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[s.submitBtn, loading && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
            }
          </TouchableOpacity>

          <View style={s.switchRow}>
            <Text style={s.switchText}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </Text>
            <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
              <Text style={s.switchLink}>{mode === 'login' ? 'Sign up' : 'Sign in'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity onPress={continueAsGuest} style={s.skipBtn}>
          <Text style={s.skipText}>Continue without account →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  logoSection: { alignItems: 'center', marginBottom: 32 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: colors.brand + '22',
    borderWidth: 1, borderColor: colors.brand + '44',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  appName: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  tagline: { fontSize: 14, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRadius: 16, padding: 24,
  },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderColor: colors.border,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: 14 },
  eyeBtn: { padding: 4 },
  submitBtn: {
    backgroundColor: colors.brand, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  switchText: { color: colors.textSecondary, fontSize: 13 },
  switchLink: { color: colors.brand, fontSize: 13, fontWeight: '600' },
  skipBtn: { alignItems: 'center', marginTop: 20 },
  skipText: { color: colors.textMuted, fontSize: 13 },
});
