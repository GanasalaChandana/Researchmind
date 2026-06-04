import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import axios from 'axios';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

const EXAMPLE_TOPICS = [
  'Impact of AI on drug discovery',
  'How do large language models work?',
  'The future of quantum computing',
  'Climate change mitigation technologies',
  'History and evolution of the internet',
];

export default function HomeScreen({ navigation }: any) {
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState(3);
  const [loading, setLoading] = useState(false);

  const startResearch = async () => {
    if (!topic.trim()) {
      Alert.alert('Error', 'Please enter a research topic');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/research/start`, {
        topic: topic.trim(),
        depth,
      });

      const { session_id } = response.data;
      setTopic('');

      // Navigate to research screen
      navigation.navigate('Research', { sessionId: session_id });
    } catch (error) {
      Alert.alert('Error', 'Failed to start research. Please try again.');
      console.error('Research error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>ResearchMind</Text>
        <Text style={styles.subtitle}>AI-powered research in your pocket</Text>
      </View>

      {/* Search Box */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.input}
          placeholder="Enter your research topic..."
          placeholderTextColor="#94a3b8"
          value={topic}
          onChangeText={setTopic}
          editable={!loading}
        />
      </View>

      {/* Depth Slider */}
      <View style={styles.depthSection}>
        <Text style={styles.label}>Research Depth: {depth} questions</Text>
        <View style={styles.depthControls}>
          {[1, 2, 3, 4, 5].map((d) => (
            <TouchableOpacity
              key={d}
              style={[
                styles.depthButton,
                depth === d && styles.depthButtonActive,
              ]}
              onPress={() => setDepth(d)}
              disabled={loading}
            >
              <Text
                style={[
                  styles.depthButtonText,
                  depth === d && styles.depthButtonTextActive,
                ]}
              >
                {d}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Start Button */}
      <TouchableOpacity
        style={[styles.startButton, loading && styles.startButtonDisabled]}
        onPress={startResearch}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.startButtonText}>Start Research</Text>
        )}
      </TouchableOpacity>

      {/* Example Topics */}
      <View style={styles.examplesSection}>
        <Text style={styles.label}>Try an example:</Text>
        <View style={styles.examplesGrid}>
          {EXAMPLE_TOPICS.map((ex, i) => (
            <TouchableOpacity
              key={i}
              style={styles.exampleButton}
              onPress={() => setTopic(ex)}
              disabled={loading}
            >
              <Text style={styles.exampleText}>{ex}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  header: {
    marginBottom: 32,
    marginTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
  },
  searchSection: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    fontSize: 16,
    height: 48,
  },
  depthSection: {
    marginBottom: 24,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  depthControls: {
    flexDirection: 'row',
    gap: 8,
  },
  depthButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  depthButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  depthButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  depthButtonTextActive: {
    color: '#ffffff',
  },
  startButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  examplesSection: {
    marginBottom: 24,
  },
  examplesGrid: {
    gap: 12,
  },
  exampleButton: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  exampleText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
});
