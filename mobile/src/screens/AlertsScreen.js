import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert
} from 'react-native';
import { AlertCircle, Clock, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api'; 

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const getUserId = async () => {
      const id = await AsyncStorage.getItem('user_id');
      if (id) setUserId(id);
      else setLoading(false);
    };
    getUserId();
  }, []);

  useEffect(() => {
    if (userId) fetchAlerts();
  }, [userId]);

  const fetchAlerts = async () => {
    if (!userId) return;
    setError(null);
    try {
      const url = `${API_URL}/emergency-alerts/active?userId=${userId}`;
      console.log('Fetching alerts from:', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
      Alert.alert(
        'Connection Error',
        `Cannot reach server at ${API_URL}. Please check your connection.`,
        [{ text: 'OK' }]
      );
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markAsRead = async (alertId) => {
    try {
      const res = await fetch(`${API_URL}/emergency-alerts/${alertId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        setAlerts(prev =>
          prev.map(a => (a.id === alertId ? { ...a, read_at: new Date().toISOString() } : a))
        );
      }
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const severityStyle = (severity) => {
    switch (severity) {
      case 'critical': return styles.critical;
      case 'warning': return styles.warning;
      default: return styles.info;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#00897B" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00897B"]} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchAlerts}>
                <RefreshCw size={16} color="#00897B" />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !error && <Text style={styles.emptyText}>No active alerts</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.alertCard, severityStyle(item.severity), !item.read_at && styles.unread]}
            onPress={() => !item.read_at && markAsRead(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.alertHeader}>
              <AlertCircle size={20} color={item.severity === 'critical' ? '#DC2626' : (item.severity === 'warning' ? '#F59E0B' : '#3B82F6')} />
              <Text style={styles.alertTitle}>{item.title}</Text>
              {!item.read_at && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.alertMessage}>{item.message}</Text>
            <View style={styles.alertFooter}>
              <Clock size={12} color="#94A3B8" />
              <Text style={styles.alertDate}>{new Date(item.sent_at).toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  alertCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  unread: { backgroundColor: '#FFF9E6' },
  critical: { borderLeftColor: '#DC2626' },
  warning: { borderLeftColor: '#F59E0B' },
  info: { borderLeftColor: '#3B82F6' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  alertTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginLeft: 10, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginLeft: 8 },
  alertMessage: { fontSize: 14, color: '#334155', marginBottom: 12, lineHeight: 20 },
  alertFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertDate: { fontSize: 11, color: '#94A3B8' },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 50 },
  errorCard: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  errorText: { color: '#DC2626', fontSize: 14, marginBottom: 10 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  retryText: { color: '#00897B', fontWeight: '600' },
});