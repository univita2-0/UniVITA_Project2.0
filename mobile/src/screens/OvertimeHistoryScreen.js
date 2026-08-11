// src/screens/OvertimeHistoryScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, StatusBar, Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Calendar, Clock, FileText, AlertCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

export default function OvertimeHistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/overtime-requests`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Overtime History Error:", err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const s = status?.toLowerCase();
    if (s === 'approved') return '#10B981';
    if (s === 'rejected') return '#EF4444';
    return '#F59E0B';
  };

  const getScenarioLabel = (scenario) => {
    switch (scenario) {
      case 'future': return 'Future Date';
      case 'ongoing': return 'Ongoing Shift (extend)';
      case 'after_shift': return 'After Shift (extra)';
      default: return scenario || '—';
    }
  };

  const openAttachment = (url) => {
    if (url) Linking.openURL(url);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#00897B" />
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <X size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Overtime History</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={history}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const displayDate = item.date || item.request_date || '';
            return (
              <View style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <Calendar size={16} color="#00897B" />
                  <Text style={styles.date}>{displayDate.split('T')[0]}</Text>
                </View>

                <View style={styles.cardRow}>
                  <Clock size={14} color="#64748B" />
                  <Text style={styles.time}>
                    {formatTo12Hour(item.start_time)} – {formatTo12Hour(item.end_time)}
                  </Text>
                </View>

                <View style={styles.cardRow}>
                  <AlertCircle size={14} color="#64748B" />
                  <Text style={styles.scenario}>{getScenarioLabel(item.scenario_type)}</Text>
                </View>

                {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}

                <View style={styles.statusRow}>
                  <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}15` }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                      {item.status?.toUpperCase() || 'PENDING'}
                    </Text>
                  </View>
                  {item.processed === 1 && (
                    <View style={styles.processedBadge}>
                      <Text style={styles.processedText}>✓ Processed</Text>
                    </View>
                  )}
                </View>

                {item.attachment && (
                  <TouchableOpacity style={styles.attachmentButton} onPress={() => openAttachment(`${API_URL.replace('/api', '')}${item.attachment}`)}>
                    <FileText size={12} color="#00897B" />
                    <Text style={styles.attachmentText}>View Attachment</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No overtime requests found.</Text>}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  list: { padding: 16 },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  date: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  time: { fontSize: 13, color: '#475569' },
  scenario: { fontSize: 13, color: '#475569', fontStyle: 'italic' },
  reason: { fontSize: 13, color: '#475569', marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  processedBadge: { backgroundColor: '#E0F2F1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  processedText: { fontSize: 10, color: '#00897B', fontWeight: '600' },
  attachmentButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  attachmentText: { fontSize: 12, color: '#00897B', fontWeight: '500' },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 50 },
});