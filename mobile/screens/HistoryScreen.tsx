import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';

const BACKEND_URL = 'https://researchmind-production-b6ca.up.railway.app';

export default function HistoryScreen({ navigation }: any) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
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
      const { data } = await axios.get(`${BACKEND_URL}/research/sessions/list`, { params });
      setSessions(data);
    } catch {
      Alert.alert('Error', 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, [statusFilter, daysFilter]);

  const statusColor = (s: string) =>
    s === 'completed' ? colors.success : s === 'failed' ? colors.error : colors.warning;

  const renderSession = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={s.sessionItem}
      onPress={() => navigation.navigate('Research', { sessionId: item.id })}
    >
      <View style={s.sessionContent}>
        <Text style={s.sessionTopic} numberOfLines={2}>{item.topic}</Text>
        <View style={s.sessionMeta}>
          <View style={[s.statusBadge, { backgroundColor: statusColor(item.status) }]}>
            <Text style={s.statusText}>{item.status}</Text>
          </View>
          <Text style={s.timestamp}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() =>
          Alert.alert('Delete?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete', style: 'destructive',
              onPress: async () => {
                await axios.delete(`${BACKEND_URL}/research/${item.id}`);
                setSessions((p) => p.filter((x) => x.id !== item.id));
              },
            },
          ])
        }
        style={s.deleteBtn}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
        {['all', 'completed', 'failed'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.chip, statusFilter === f && s.chipActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[s.chipText, statusFilter === f && s.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        {['all', '7', '30', '90'].map((d) => (
          <TouchableOpacity
            key={d}
            style={[s.chip, daysFilter === d && s.chipActive]}
            onPress={() => setDaysFilter(d)}
          >
            <Text style={[s.chipText, daysFilter === d && s.chipTextActive]}>
              {d === 'all' ? 'All Time' : `${d}d`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={s.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search history..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={fetchSessions}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : sessions.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="documents-outline" size={48} color={colors.textMuted} />
          <Text style={s.emptyText}>No research found</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 10, padding: 16 }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    filterScroll: { maxHeight: 50, marginTop: 12 },
    filterRow: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center' },
    chip: {
      paddingHorizontal: 14, paddingVertical: 6,
      backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20,
    },
    chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
    chipTextActive: { color: '#fff' },
    searchRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1,
      borderRadius: 8, paddingHorizontal: 12, marginHorizontal: 16, marginVertical: 10,
    },
    searchInput: { flex: 1, paddingVertical: 9, color: colors.text, fontSize: 14 },
    sessionItem: {
      backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
      borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center',
    },
    sessionContent: { flex: 1, marginRight: 12 },
    sessionTopic: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
    sessionMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
    statusText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    timestamp: { color: colors.textMuted, fontSize: 11 },
    deleteBtn: { padding: 8 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: colors.textSecondary, marginTop: 12, fontSize: 14 },
  });
