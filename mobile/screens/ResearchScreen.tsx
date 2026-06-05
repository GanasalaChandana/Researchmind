import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

export default function ResearchScreen({ route, navigation }: any) {
  const { sessionId } = route.params || {};
  const [events, setEvents] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [status, setStatus] = useState('running');
  const [phase, setPhase] = useState('orchestrating');

  useEffect(() => {
    if (!sessionId) return;

    // Stream research updates
    const eventSource = new EventSource(
      `${BACKEND_URL}/research/${sessionId}/stream?topic=Research&depth=3`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'done' && data.report) {
          setReport(data.report);
          setStatus('completed');
        } else {
          setEvents((prev) => [...prev, data]);
          if (data.type === 'thinking') setPhase('orchestrating');
          else if (data.type === 'searching') setPhase('searching');
          else if (data.type === 'reading') setPhase('reading');
          else if (data.type === 'synthesizing') setPhase('synthesizing');
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (status !== 'completed') {
        setStatus('failed');
      }
    };

    return () => eventSource.close();
  }, [sessionId]);

  const phases = ['orchestrating', 'searching', 'reading', 'synthesizing'];
  const currentPhaseIndex = phases.indexOf(phase);
  const progress = ((currentPhaseIndex + 1) / phases.length) * 100;

  if (!sessionId) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No active research</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.phaseText}>Phase: {phase}</Text>
      </View>

      {/* Activity Feed */}
      <View style={styles.activitySection}>
        <Text style={styles.sectionTitle}>Agent Activity</Text>
        {events.length === 0 ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Starting research...</Text>
          </View>
        ) : (
          events.map((event, i) => (
            <View key={i} style={styles.eventItem}>
              <Ionicons
                name={event.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
                size={16}
                color={event.type === 'error' ? '#ef4444' : '#10b981'}
              />
              <View style={styles.eventContent}>
                <Text style={styles.eventAgent}>{event.agent}</Text>
                <Text style={styles.eventMessage}>{event.message}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Report Summary */}
      {report && (
        <View style={styles.reportSection}>
          <Text style={styles.sectionTitle}>Report</Text>
          <Text style={styles.reportTitle}>{report.topic}</Text>
          <Text style={styles.reportSummary}>{report.summary}</Text>
        </View>
      )}

      {/* Status */}
      <View style={styles.statusSection}>
        <Text
          style={[
            styles.statusText,
            status === 'completed' && styles.statusSuccess,
            status === 'failed' && styles.statusError,
          ]}
        >
          {status === 'running' ? '🔄 Running...' : status === 'completed' ? '✅ Complete' : '❌ Failed'}
        </Text>
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
  progressSection: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  phaseText: {
    color: '#cbd5e1',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  activitySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
  },
  eventItem: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventAgent: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  eventMessage: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 4,
  },
  reportSection: {
    marginBottom: 24,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  reportSummary: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 22,
  },
  statusSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  statusSuccess: {
    color: '#10b981',
  },
  statusError: {
    color: '#ef4444',
  },
});
