// src/screens/ScheduleScreen.js
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  ActivityIndicator, RefreshControl, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock, MapPin, BookOpen, ChevronLeft, ChevronRight, Calendar as CalIcon
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchUserSchedule } from './api';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  
  // Connect to global Theme
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  
  // Dynamically generate styles based on theme
  const styles = React.useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchSchedules = useCallback(async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        const data = await fetchUserSchedule(user.employee_id);
        setSchedules(data);
      }
    } catch (err) {
      console.error('Fetch schedule error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const changeWeek = (daysOffset) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + daysOffset);
    setCurrentDate(newDate);
  };

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const getWeekRange = () => {
    const start = getStartOfWeek(currentDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    
    // Formats strictly as "Aug 24 – Aug 30, 2026" to match reference
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const endDay = end.getDate();
    const year = start.getFullYear();

    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  };

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const onRefresh = () => {
    setRefreshing(true);
    fetchSchedules();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'IN PROGRESS':
        return { label: 'IN PROGRESS', color: isLight ? '#B45309' : '#FBBF24', bg: isLight ? '#FFFBEB' : 'rgba(251, 191, 36, 0.15)', border: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.3)' };
      case 'COMPLETED':
        return { label: 'COMPLETED', color: isLight ? '#047857' : '#34D399', bg: isLight ? '#ECFDF5' : 'rgba(52, 211, 153, 0.15)', border: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.3)' };
      default:
        return { label: 'SCHEDULED', color: isLight ? '#4B5563' : colors.textSecondary, bg: isLight ? '#F9FAFB' : colors.iconBg, border: isLight ? '#E5E7EB' : colors.border };
    }
  };

  if (loading) {
    return (
      <>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
        <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading schedule...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLight ? "#0F172A" : "#FFFFFF"} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <CalIcon size={26} color={isLight ? "#0F172A" : colors.textPrimary} strokeWidth={2} />
            <Text style={styles.title}>My Schedule</Text>
          </View>

          {/* Week Navigator */}
          <View style={styles.weekNavigator}>
            <TouchableOpacity onPress={() => changeWeek(-7)} style={styles.navButton} activeOpacity={0.7}>
              <ChevronLeft size={20} color={isLight ? "#0F172A" : colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.weekRangeContainer}>
              <Text style={styles.weekRangeText}>{getWeekRange()}</Text>
            </View>
            <TouchableOpacity onPress={() => changeWeek(7)} style={styles.navButton} activeOpacity={0.7}>
              <ChevronRight size={20} color={isLight ? "#0F172A" : colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Daily Cards */}
          {weekDays.map((dayName, index) => {
            const startOfWeek = getStartOfWeek(currentDate);
            const targetDate = new Date(startOfWeek);
            targetDate.setDate(startOfWeek.getDate() + index);
            const targetDateStr = targetDate.toLocaleDateString('en-CA');
            const daySchedule = schedules.find(s => s.date === targetDateStr);
            const status = daySchedule?.attendance_status || 'SCHEDULED';
            const badge = getStatusBadge(status);

            return (
              <View key={dayName} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{dayName.toUpperCase()}</Text>
                  <Text style={styles.dayDate}>{targetDate.getDate()}</Text>
                </View>
                <View style={styles.dayContent}>
                  {daySchedule ? (
                    <View style={styles.scheduleItem}>
                      <View style={styles.courseHeader}>
                        <BookOpen size={16} color={colors.primary} />
                        <Text style={styles.courseText}>{daySchedule.course}</Text>
                      </View>
                      <View style={styles.detailsGrid}>
                        <View style={styles.infoRow}>
                          <Clock size={14} color={isLight ? "#64748B" : colors.textSecondary} />
                          <Text style={styles.infoText}>
                            {daySchedule.start_time?.substring(0,5)} – {daySchedule.end_time?.substring(0,5)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MapPin size={14} color={isLight ? "#64748B" : colors.textSecondary} />
                          <Text style={styles.infoText}>{daySchedule.place || 'Main Campus'}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.noSchedule}>No classes scheduled</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

// DYNAMIC STYLESHEET GENERATOR
const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  scroll: { paddingHorizontal: 22, paddingBottom: 120, paddingTop: 10 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  loadingText: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary },
  
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 28 },
  title: { fontFamily: 'Inter_18pt-Bold', fontSize: 26, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: -0.5 },
  
  weekNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.2, shadowRadius: 10, elevation: 2
  },
  navButton: { padding: 4 },
  weekRangeContainer: { flex: 1, alignItems: 'center' },
  weekRangeText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  
  dayCard: {
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    overflow: 'hidden'
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? '#F1F5F9' : colors.border,
  },
  dayName: { fontFamily: 'Inter_18pt-Bold', fontSize: 11, color: isLight ? '#64748B' : colors.textSecondary, letterSpacing: 1.5 },
  dayDate: { fontFamily: 'Inter_18pt-Black', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  
  dayContent: { padding: 20 },
  noSchedule: { fontFamily: 'Inter_18pt-Medium', color: isLight ? '#64748B' : colors.textSecondary, fontSize: 14, textAlign: 'center', marginVertical: 6 },
  
  scheduleItem: { gap: 14 },
  courseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  courseText: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, flex: 1 },
  detailsGrid: { gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#475569' : colors.textPrimary },
  
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  statusText: { fontFamily: 'Inter_18pt-Bold', fontSize: 10, letterSpacing: 0.5 },
});