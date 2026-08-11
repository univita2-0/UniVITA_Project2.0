// src/screens/CorrectionHistoryScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Calendar, Clock } from 'lucide-react-native';
import { fetchCorrectionHistory } from './api';

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

export default function CorrectionHistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await fetchCorrectionHistory();
    setHistory(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const getStatusColor = (status) => {
    const s = status?.toLowerCase();
    if (s === 'approved') return '#10B981';
    if (s === 'rejected') return '#EF4444';
    return '#F59E0B';
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
          <Text style={styles.headerTitle}>Correction History</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={history}
          keyExtractor={(item) => item.id?.toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.historyCard}>
              <View style={styles.cardHeader}>
                <Calendar size={16} color="#00897B" />
                <Text style={styles.date}>{item.attendance_date?.split('T')[0]}</Text>
              </View>

              <View style={styles.cardBody}>
                <Clock size={14} color="#64748B" />
                <Text style={styles.time}>
                  {item.requested_clock_in 
                    ? `Clock In: ${formatTo12Hour(item.requested_clock_in)}` 
                    : `Clock Out: ${formatTo12Hour(item.requested_clock_out)}`}
                </Text>
              </View>

              <Text style={styles.reason}>{item.reason}</Text>

              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}15` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                  {item.status?.toUpperCase() || 'PENDING'}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No correction requests found.</Text>}
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
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  time: { fontSize: 13, color: '#475569', fontWeight: '500' },
  reason: { fontSize: 13, color: '#475569', marginBottom: 10, marginTop: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 50 },
});