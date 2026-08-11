// src/screens/LeaveBalancesScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  RefreshControl, StatusBar, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, TrendingUp } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';

export default function LeaveBalancesScreen() {
  const insets = useSafeAreaInsets();
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const currentYear = new Date().getFullYear();

  const loadBalances = async (currentUserId) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/leave-balances/${currentUserId}?year=${currentYear}`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setBalances(data);
      } else {
        setBalances([
          { leave_type: 'Sick Leave', remaining_days: 15, annual_quota: 15 },
          { leave_type: 'Vacation Leave', remaining_days: 15, annual_quota: 15 },
          { leave_type: 'Emergency Leave', remaining_days: 5, annual_quota: 5 },
        ]);
      }
    } catch (error) {
      console.error('Failed to load leave balances:', error);
      setBalances([
        { leave_type: 'Sick Leave', remaining_days: 15, annual_quota: 15 },
        { leave_type: 'Vacation Leave', remaining_days: 15, annual_quota: 15 },
        { leave_type: 'Emergency Leave', remaining_days: 5, annual_quota: 5 },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const id = await AsyncStorage.getItem('user_id');
      if (id) {
        setUserId(id);
        loadBalances(id);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  const onRefresh = () => {
    if (userId) {
      setRefreshing(true);
      loadBalances(userId);
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
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00897B"]} />}
        >
          <View style={styles.header}>
            <CalendarDays size={32} color="#00897B" />
            <Text style={styles.title}>My Leave Balances</Text>
            <Text style={styles.subtitle}>Year {currentYear}</Text>
          </View>

          {balances.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No leave balances found.</Text>
              <Text style={styles.emptySubtext}>Please contact HR.</Text>
            </View>
          ) : (
            balances.map((item, idx) => {
              const remaining = item.remaining_days;
              const quota = item.annual_quota || (item.leave_type === 'Emergency Leave' ? 5 : 15);
              return (
                <View key={idx} style={styles.balanceCard}>
                  <View style={styles.cardLeft}>
                    <TrendingUp size={24} color="#00897B" />
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.leaveType}>{item.leave_type}</Text>
                    <Text style={styles.remaining}>
                      {remaining} / {quota} days remaining
                    </Text>
                    <Text style={styles.quota}>Annual quota: {quota} days</Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              📌 Leave requests automatically deduct from your balance upon approval.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 30, marginTop: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  balanceCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardLeft: { marginRight: 16, justifyContent: 'center' },
  cardRight: { flex: 1 },
  leaveType: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  remaining: { fontSize: 16, fontWeight: '700', color: '#00897B', marginTop: 4 },
  quota: { fontSize: 13, color: '#64748B', marginTop: 4 },
  emptyCard: { alignItems: 'center', padding: 40, backgroundColor: 'white', borderRadius: 20, marginTop: 20 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#94A3B8' },
  emptySubtext: { fontSize: 13, color: '#94A3B8', marginTop: 8 },
  noteBox: { backgroundColor: '#F0FDFA', padding: 16, borderRadius: 16, marginTop: 24, borderWidth: 1, borderColor: '#CCFBF1' },
  noteText: { fontSize: 13, color: '#0F766E', textAlign: 'center' },
});