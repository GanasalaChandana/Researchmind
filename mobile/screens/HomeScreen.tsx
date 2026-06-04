import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

const EXAMPLE_TOPICS = [
  'Impact of AI on drug discovery',
  'How do large language models work?',
  'The future of quantum computing',
  'Climate change mitigation technologies',
  'History and evolution of the internet',
];

export default function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState(3);
  const [loading, setLoading] = useState(false);

  const startResearch = async () => {
    if (!topic.trim()) { Alert.alert('Error', 'Please enter a research topic'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/research/start`, { topic: topic.trim(), depth });
      setTopic('');
      navigation.navigate('Research', { sessionId: data.session_id });
    } catch {
      Alert.alert('Error', 'Failed to start research. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>ResearchMind</Text>
        <Text style={s.subtitle}>AI-powered research in your pocket</Text>
      </View>

      {/* Search Box */}
      <TextInput
        style={s.input}
        placeholder="Enter your research topic..."
        placeholderTextColor={colors.textMuted}
        value={topic}
        onChangeText={setTopic}
        editable={!loading}
      />

      {/* Depth */}
      <View style={s.depthSection}>
        <Text style={s.label}>Research Depth: {depth} questions</Text>
        <View style={s.depthRow}>
          {[1, 2, 3, 4, 5].map((d) => (
            <TouchableOpacity
              key={d}
              style={[s.depthBtn, depth === d && s.depthBtnActive]}
              onPress={() => setDepth(d)}
              disabled={loading}
            >
              <Text style={[s.depthBtnText, depth === d && s.depthBtnTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Start Button */}
      <TouchableOpacity
        style={[s.startBtn, loading && s.startBtnDisabled]}
        onPress={startResearch}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.startBtnText}>Start Research</Text>}
      </TouchableOpacity>

      {/* Examples */}
      <Text style={s.label}>Try an example:</Text>
      <View style={s.examplesGrid}>
        {EXAMPLE_TOPICS.map((ex) => (
          <TouchableOpacity key={ex} style={s.exampleBtn} onPress={() => setTopic(ex)} disabled={loading}>
            <Text style={s.exampleText}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 40 },
    header: { marginBottom: 28, marginTop: 8 },
    title: { fontSize: 30, fontWeight: 'bold', color: colors.text, marginBottom: 6 },
    subtitle: { fontSize: 15, color: colors.textSecondary },
    input: {
      backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1,
      borderRadius: 12, padding: 12, color: colors.text, fontSize: 16,
      height: 50, marginBottom: 20,
    },
    depthSection: { marginBottom: 20 },
    label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 10 },
    depthRow: { flexDirection: 'row', gap: 8 },
    depthBtn: {
      flex: 1, paddingVertical: 10, backgroundColor: colors.inputBg,
      borderColor: colors.border, borderWidth: 1, borderRadius: 8, alignItems: 'center',
    },
    depthBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    depthBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    depthBtnTextActive: { color: '#fff' },
    startBtn: {
      backgroundColor: colors.brand, paddingVertical: 14,
      borderRadius: 12, alignItems: 'center', marginBottom: 28,
    },
    startBtnDisabled: { opacity: 0.6 },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    examplesGrid: { gap: 10 },
    exampleBtn: {
      backgroundColor: colors.surface, borderColor: colors.border,
      borderWidth: 1, borderRadius: 8, padding: 12,
    },
    exampleText: { color: colors.textSecondary, fontSize: 13 },
  });
