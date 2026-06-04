import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

export default function HistoryScreen({ navigation }: any) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState('all');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (daysFilter !== 'all') params.days = parseInt(daysFilter);
      if (searchQuery) params.search = searchQuery;

      const response = await axios.get(
        `${BACKEND_URL}/research/sessions/list`,
        { params }
      );

      setSessions(response.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch history');
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [statusFilter, daysFilter]);

  const handleSessionSelect = (sessionId: string) => {
    navigation.navigate('Research', { sessionId });
  };

  const handleDelete = (sessionId: string) => {
    Alert.alert('Delete Research?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${BACKEND_URL}/research/${sessionId}`);
            setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          } catch (error) {
            Alert.alert('Error', 'Failed to delete research');
          }
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      default:
        return '#f59e0b';
    }
  };

  const renderSession = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.sessionItem}
      onPress={() => handleSessionSelect(item.id)}
    >
      <View style={styles.sessionContent}>
        <Text style={styles.sessionTitle} numberOfLines={2}>
          {item.topic}
        </Text>
        <View style={styles.sessionMeta}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
          <Text style={styles.timestamp}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => handleDelete(item.id)}
        style={styles.deleteButton}
      >
        <Ionicons name="trash-outline" size={18} color="#ef4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScrollView}
      >
        <View style={styles.filters}>
          {/* Status Filter */}
          {['all', 'completed', 'failed'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterButton,
                statusFilter === status && styles.filterButtonActive,
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  statusFilter === status && styles.filterButtonTextActive,
                ]}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Days Filter */}
          {['all', '7', '30', '90'].map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.filterButton,
                daysFilter === days && styles.filterButtonActive,
              ]}
              onPress={() => setDaysFilter(days)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  daysFilter === days && styles.filterButtonTextActive,
                ]}
              >
                {days === 'all' ? 'All Time' : `Last ${days}d`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Search */}
      <View style={styles.searchSection}>
        <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search history..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={fetchSessions}
        />
      </View>

      {/* Sessions List */}
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="documents-outline" size={48} color="#475569" />
          <Text style={styles.emptyText}>No research found</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  filtersScrollView: {
    marginBottom: 12,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 20,
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  searchSection: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: '#ffffff',
  },
  listContent: {
    gap: 12,
  },
  sessionItem: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionContent: {
    flex: 1,
    marginRight: 12,
  },
  sessionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  sessionMeta: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timestamp: {
    color: '#94a3b8',
    fontSize: 11,
  },
  deleteButton: {
    padding: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
});
