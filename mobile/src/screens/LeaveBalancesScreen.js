// src/screens/LeaveBalancesScreen.js
import React, { useState, useEffect, useContext, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
  RefreshControl, StatusBar, TouchableOpacity
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, TrendingUp, Award, AlertCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { API_URL } from './api';

/* ---------------- Fix #9 helpers ---------------- */
const safeNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isCtoType = (type) => {
  const t = String(type || '').toLowerCase();
  return t.includes('compensatory') || t.includes('cto');
};

const isAbortError = (err, controller) =>
  controller?.signal?.aborted || err?.name === 'AbortError';

export default function LeaveBalancesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;

  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const abortRef = useRef(null);

  const loadBalances = useCallback(async (currentUserId) => {
    // Cancel any in-flight request to avoid stale overwrite
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!currentUserId) {
      setBalances([]);
      setError('Employee session not found. Please sign in again.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError('');
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const res = await fetch(
        `${API_URL}/leave-balances/${currentUserId}?year=${currentYear}`,
        { headers: { Authorization: `Bearer ${token || ''}` }, signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (controller.signal.aborted) return;

      // Fix: no fabricated fallback — trust the server's payload
      setBalances(Array.isArray(data) ? data : []);
    } catch (err) {
      if (isAbortError(err, controller)) return;
      console.error('Failed to load leave balances:', err);
      setBalances([]);
      setError('Unable to load leave balances. Please try again.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentYear]);

  useEffect(() => {
    const init = async () => {
      try {
        // Prefer employee_id (consistent with other screens), fall back to user_id
        const empId = await AsyncStorage.getItem('employee_id');
        const uid = empId || await AsyncStorage.getItem('user_id');
        setUserId(uid);
        if (uid) {
          await loadBalances(uid);
        } else {
          setError('Employee session not found. Please sign in again.');
          setLoading(false);
        }
      } catch (e) {
        console.error('Session lookup failed:', e);
        setError('Unable to read session. Please sign in again.');
        setLoading(false);
      }
    };
    init();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [loadBalances, reloadKey]);

  const onRefresh = () => {
    if (!userId) return;
    setRefreshing(true);
    loadBalances(userId);
  };

  const retry = () => {
    setLoading(true);
    setError('');
    setReloadKey(k => k + 1);
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>

        <View style={styles.topHeader}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={isLight ? '#0F172A' : colors.textPrimary} />
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
            <Text style={styles.title}>My Leave Balances & CTO</Text>
            <Text style={styles.subtitle}>Fiscal Year {currentYear}</Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <AlertCircle size={28} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
              {userId ? (
                <TouchableOpacity
                  onPress={retry}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading leave balances"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : balances.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No leave balances configured for {currentYear}.</Text>
              <Text style={styles.emptySubtext}>Please contact HR.</Text>
            </View>
          ) : (
            balances.map((item, idx) => {
              const isCto = isCtoType(item.leave_type);
              const remainingNum = safeNumber(item.remaining_days);
              const quotaNum = isCto ? null : (safeNumber(item.annual_quota) ?? 15);

              const remainingText = remainingNum != null
                ? isCto
                  ? `${remainingNum} days earned`
                  : `${remainingNum}/${quotaNum} days remaining`
                : isCto
                  ? '— days earned'
                  : `—/${quotaNum} days remaining`;

              const quotaText = isCto
                ? 'Converted from approved overtime hours (8 hrs = 1 day)'
                : `Annual quota: ${quotaNum} days`;

              const displayType = item.leave_type || 'Leave';

              return (
                <View
                  key={`${item.leave_type || 'leave'}-${idx}`}
                  style={[styles.balanceCard, isCto && styles.ctoCardHighlight]}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.trendIconWrapper}>
                      {isCto ? <Award size={22} color="#D97706" /> : <TrendingUp size={22} color={colors.primary} />}
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.leaveType}>{displayType}</Text>
                    <Text style={[styles.remaining, isCto && { color: '#D97706' }]}>
                      {remainingText}
                    </Text>
                    <Text style={styles.quota}>{quotaText}</Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              📌 Approved overtime under Compensatory Time Off (CTO) automatically converts into your leave credits. Leave requests deduct upon admin approval.
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
  title: { fontFamily: 'Inter_18pt-Bold', fontSize: 24, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: -0.5 },
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
  ctoCardHighlight: {
    borderColor: isLight ? '#FDE68A' : 'rgba(217, 119, 6, 0.4)',
    backgroundColor: isLight ? '#FFFBEB' : 'rgba(217, 119, 6, 0.05)'
  },
  cardLeft: { marginRight: 16, justifyContent: 'center' },
  trendIconWrapper: { width: 44, height: 44, borderRadius: 16, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  cardRight: { flex: 1 },
  leaveType: { fontFamily: 'Inter_18pt-Bold', fontSize: 17, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 4 },
  remaining: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: '#00897B', marginBottom: 2 },
  quota: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },

  emptyCard: { alignItems: 'center', padding: 40, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, marginTop: 20, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  emptyText: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#94A3B8' : colors.textSecondary, textAlign: 'center' },
  emptySubtext: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#94A3B8' : colors.textSecondary, marginTop: 6, textAlign: 'center' },

  errorCard: { alignItems: 'center', padding: 32, backgroundColor: isLight ? '#FEF2F2' : 'rgba(220, 38, 38, 0.1)', borderRadius: 24, marginTop: 20, borderWidth: 1, borderColor: isLight ? '#FECACA' : 'rgba(220, 38, 38, 0.3)' },
  errorText: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: '#DC2626', textAlign: 'center', marginTop: 12, lineHeight: 20 },
  retryButton: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#DC2626', borderRadius: 12 },
  retryText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: '#FFFFFF' },

  noteBox: { backgroundColor: isLight ? '#F0FDFA' : 'rgba(0, 137, 123, 0.1)', padding: 18, borderRadius: 20, marginTop: 20, borderWidth: 1, borderColor: isLight ? '#CCFBF1' : 'rgba(0, 137, 123, 0.3)' },
  noteText: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: '#0F766E', textAlign: 'center', lineHeight: 20 },
});