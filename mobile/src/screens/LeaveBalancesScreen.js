// src/screens/LeaveBalancesScreen.js
import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  RefreshControl, StatusBar, TouchableOpacity
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, TrendingUp } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { API_URL } from './api';

export default function LeaveBalancesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;

  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const currentYear = new Date().getFullYear();

  const loadBalances = useCallback(async (currentUserId) => {
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
      setBalances([
        { leave_type: 'Sick Leave', remaining_days: 15, annual_quota: 15 },
        { leave_type: 'Vacation Leave', remaining_days: 15, annual_quota: 15 },
        { leave_type: 'Emergency Leave', remaining_days: 5, annual_quota: 5 },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentYear]);

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
  }, [loadBalances]);

  const onRefresh = () => {
    if (userId) {
      setRefreshing(true);
      loadBalances(userId);
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
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.8}>
            <ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroHeader}>
            <View style={styles.iconWrapper}>
              <CalendarDays size={32} color={colors.primary} strokeWidth={1.5} />
            </View>
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
                    <View style={styles.trendIconWrapper}>
                      <TrendingUp size={22} color={colors.primary} />
                    </View>
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

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background },
  topHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backButton: { padding: 4 },
  scroll: { padding: 22, paddingBottom: 60 },
  
  heroHeader: { alignItems: 'center', marginBottom: 32, marginTop: 10 },
  iconWrapper: { width: 64, height: 64, borderRadius: 24, backgroundColor: isLight ? '#FFFFFF' : colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.15, shadowRadius: 8, elevation: 2, marginBottom: 16 },
  title: { fontFamily: 'Inter_18pt-Bold', fontSize: 26, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary, marginTop: 4 },
  
  balanceCard: {
    flexDirection: 'row',
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isLight ? 0.05 : 0.15,
    shadowRadius: 10,
    elevation: 2,
    alignItems: 'center'
  },
  cardLeft: { marginRight: 16, justifyContent: 'center' },
  trendIconWrapper: { width: 44, height: 44, borderRadius: 16, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  cardRight: { flex: 1 },
  leaveType: { fontFamily: 'Inter_18pt-Bold', fontSize: 17, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 4 },
  remaining: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: '#00897B', marginBottom: 2 },
  quota: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  
  emptyCard: { alignItems: 'center', padding: 40, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, marginTop: 20, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  emptyText: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#94A3B8' : colors.textSecondary },
  emptySubtext: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#94A3B8' : colors.textSecondary, marginTop: 6 },
  
  noteBox: { backgroundColor: isLight ? '#F0FDFA' : 'rgba(0, 137, 123, 0.1)', padding: 18, borderRadius: 20, marginTop: 20, borderWidth: 1, borderColor: isLight ? '#CCFBF1' : 'rgba(0, 137, 123, 0.3)' },
  noteText: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: '#0F766E', textAlign: 'center', lineHeight: 20 },
});