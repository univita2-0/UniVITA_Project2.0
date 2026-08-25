// src/screens/AlertsScreen.js
import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, AlertCircle, Clock, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { API_URL } from './api'; 

export default function AlertsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;

  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

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

  const fetchAlerts = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const url = `${API_URL}/emergency-alerts/active?userId=${userId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
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
  }, [userId]);

  useEffect(() => {
    if (userId) fetchAlerts();
  }, [userId, fetchAlerts]);

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

  const getSeverityAccent = (severity) => {
    switch (severity) {
      case 'critical': return '#DC2626';
      case 'warning': return '#F59E0B';
      default: return '#3B82F6';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        
        {/* Top Navbar */}
        

        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={fetchAlerts} activeOpacity={0.8}>
                  <RefreshCw size={16} color="#00897B" />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !error && <Text style={styles.emptyText}>No active alerts</Text>
          }
          renderItem={({ item }) => {
            const accentColor = getSeverityAccent(item.severity);
            return (
              <TouchableOpacity
                style={[styles.alertCard, { borderLeftColor: accentColor }, !item.read_at && styles.unread]}
                onPress={() => !item.read_at && markAsRead(item.id)}
                activeOpacity={0.8}
              >
                <View style={styles.alertHeader}>
                  <AlertCircle size={20} color={accentColor} />
                  <Text style={styles.alertTitle}>{item.title}</Text>
                  {!item.read_at && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.alertMessage}>{item.message}</Text>
                <View style={styles.alertFooter}>
                  <Clock size={12} color={isLight ? "#94A3B8" : colors.textSecondary} />
                  <Text style={styles.alertDate}>{new Date(item.sent_at).toLocaleString()}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background },
  
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: isLight ? '#E2E8F0' : colors.border, backgroundColor: isLight ? '#FFFFFF' : colors.surface },
  backButton: { padding: 4 },
  headerTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary },
  
  list: { padding: 22, paddingBottom: 60 },
  alertCard: {
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isLight ? 0.05 : 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  unread: { backgroundColor: isLight ? '#FFFBEB' : 'rgba(251, 191, 36, 0.08)' },
  
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  alertTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary, marginLeft: 10, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginLeft: 8 },
  
  alertMessage: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#334155' : colors.textSecondary, marginBottom: 14, lineHeight: 22 },
  
  alertFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: isLight ? '#F1F5F9' : colors.border },
  alertDate: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: isLight ? '#94A3B8' : colors.textSecondary },
  
  emptyText: { fontFamily: 'Inter_18pt-Medium', textAlign: 'center', color: isLight ? '#94A3B8' : colors.textSecondary, marginTop: 60, fontSize: 15 },
  
  errorCard: {
    backgroundColor: isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.1)',
    padding: 18,
    borderRadius: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isLight ? '#FECACA' : 'rgba(239, 68, 68, 0.3)'
  },
  errorText: { fontFamily: 'Inter_18pt-Bold', color: '#DC2626', fontSize: 14, marginBottom: 10 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 12 },
  retryText: { fontFamily: 'Inter_18pt-Bold', color: '#00897B', fontSize: 13 },
});