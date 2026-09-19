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
  StatusBar,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, Clock, RefreshCw, CheckCheck, ShieldAlert } from 'lucide-react-native';
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

  const markAllAsRead = async () => {
    const unreadAlerts = alerts.filter(a => !a.read_at);
    if (unreadAlerts.length === 0) return;

    try {
      await Promise.all(
        unreadAlerts.map(a =>
          fetch(`${API_URL}/emergency-alerts/${a.id}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          })
        )
      );
      setAlerts(prev => prev.map(a => ({ ...a, read_at: a.read_at || new Date().toISOString() })));
    } catch (err) {
      Alert.alert('Error', 'Failed to mark all alerts as read.');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const getSeverityAccent = (severity) => {
    switch (severity) {
      case 'critical': return '#DC2626';
      case 'warning': return '#D97706';
      default: return '#0D9488';
    }
  };

  const unreadCount = alerts.filter(a => !a.read_at).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: 0 }]}>
        
        {unreadCount > 0 && (
          <View style={styles.subHeaderBar}>
            <Text style={styles.headerSubtitle}>
              {unreadCount} unread broadcast{unreadCount > 1 ? 's' : ''} requiring attention
            </Text>
            <TouchableOpacity style={styles.markAllBtn} onPress={markAllAsRead} activeOpacity={0.8}>
              <CheckCheck size={14} color="#0D9488" />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          </View>
        )}

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
                  <RefreshCw size={16} color="#0D9488" />
                  <Text style={styles.retryText}>Retry Connection</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !error && (
              <View style={styles.emptyContainer}>
                <ShieldAlert size={48} color={isLight ? "#CBD5E1" : colors.border} />
                <Text style={styles.emptyText}>No emergency broadcasts</Text>
                <Text style={styles.emptySubtext}>You are fully up to date with institutional announcements.</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const accentColor = getSeverityAccent(item.severity);
            const isUnread = !item.read_at;
            return (
              <TouchableOpacity
                style={[
                  styles.alertCard, 
                  { borderLeftColor: accentColor }, 
                  isUnread ? styles.unread : styles.readCard
                ]}
                onPress={() => isUnread && markAsRead(item.id)}
                activeOpacity={0.85}
              >
                <View style={styles.alertHeader}>
                  <View style={[styles.severityDot, { backgroundColor: accentColor }]} />
                  <Text style={styles.alertTitle}>{item.title}</Text>
                  {isUnread ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>PENDING</Text>
                    </View>
                  ) : (
                    <Text style={styles.readStatusText}>Acknowledged</Text>
                  )}
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
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background },
  
  subHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? '#E2E8F0' : colors.border,
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
  },
  headerSubtitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: isLight ? '#F0FDFA' : 'rgba(13, 148, 136, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isLight ? '#CCFBF1' : 'rgba(13, 148, 136, 0.3)'
  },
  markAllText: { fontFamily: 'Inter_18pt-Bold', fontSize: 11, color: '#0D9488' },

  list: { padding: 22, paddingBottom: 60 },
  
  alertCard: {
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isLight ? 0.03 : 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  unread: { 
    backgroundColor: isLight ? '#FFFBEB' : 'rgba(251, 191, 36, 0.06)',
    borderColor: isLight ? '#FDE68A' : 'rgba(251, 191, 36, 0.2)' 
  },
  readCard: { opacity: 0.8 },
  
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  alertTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, flex: 1 },
  
  unreadBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA' },
  unreadBadgeText: { fontFamily: 'Inter_18pt-Bold', color: '#DC2626', fontSize: 9, letterSpacing: 0.5 },
  readStatusText: { fontFamily: 'Inter_18pt-Medium', color: isLight ? '#94A3B8' : colors.textSecondary, fontSize: 11 },
  
  alertMessage: { fontFamily: 'Inter_18pt-Regular', fontSize: 13.5, color: isLight ? '#334155' : colors.textSecondary, marginBottom: 12, lineHeight: 20 },
  
  alertFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: isLight ? '#F1F5F9' : colors.border },
  alertDate: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: isLight ? '#94A3B8' : colors.textSecondary },
  
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 30 },
  emptyText: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#475569' : colors.textSecondary, marginTop: 14, marginBottom: 4 },
  emptySubtext: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: isLight ? '#94A3B8' : colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  
  errorCard: {
    backgroundColor: isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.1)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isLight ? '#FECACA' : 'rgba(239, 68, 68, 0.3)'
  },
  errorText: { fontFamily: 'Inter_18pt-Bold', color: '#DC2626', fontSize: 13, marginBottom: 8 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 8, borderWidth: 1, borderColor: isLight ? '#CBD5E1' : colors.border },
  retryText: { fontFamily: 'Inter_18pt-Bold', color: '#0D9488', fontSize: 12 },
});