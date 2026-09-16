// src/screens/ScheduleScreen.js
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  ActivityIndicator, RefreshControl, StatusBar, Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock, MapPin, BookOpen, ChevronLeft, ChevronRight, Calendar as CalIcon, X
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchUserSchedule } from './api';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 

// Helper function to format time in 12-hour AM/PM format
const formatTo12H = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

// Helper to get accurate Philippine date string (YYYY-MM-DD)
const getPHDateString = (date = new Date()) => {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};

// Helper to parse time string into minutes from midnight
const parseMins = (ts) => {
  if (!ts) return 0;
  let cs = String(ts).split('.')[0].replace(',', ':');
  const [h, m] = cs.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  
  const styles = React.useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal states for multiple schedules on a single day
  const [modalVisible, setModalVisible] = useState(false);
  const [activeDaySchedules, setActiveDaySchedules] = useState([]);
  const [activeDayTitle, setActiveDayTitle] = useState('');

  const fetchSchedules = useCallback(async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        const data = await fetchUserSchedule(user.employee_id);
        setSchedules(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Fetch schedule error:', err);
      setSchedules([]);
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
    
    const startMonth = start.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Manila' });
    const startDay = start.getDate();
    const endMonth = end.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Manila' });
    const endDay = end.getDate();
    const year = start.getFullYear();

    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  };

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const onRefresh = () => {
    setRefreshing(true);
    fetchSchedules();
  };

  // Robust status evaluation matching web dashboard logic
  const evaluateScheduleStatus = (schedule, targetDateStr) => {
    if (schedule.course === 'On Leave' || schedule.attendance_status === 'on leave') {
      return 'ON LEAVE';
    }

    const nowPH = new Date();
    const todayStr = getPHDateString(nowPH);
    const phTimeStr = nowPH.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false });
    const [currH, currM] = phTimeStr.split(':').map(Number);
    const currentMinutes = currH * 60 + currM;

    const startMins = parseMins(schedule.start_time);
    const endMins = parseMins(schedule.end_time);

    const hasClockIn = schedule.time_in && schedule.time_in !== '--:--' && schedule.time_in !== null;
    const hasClockOut = schedule.time_out && schedule.time_out !== '--:--' && schedule.time_out !== null;

    const isPassed = (targetDateStr < todayStr) || (targetDateStr === todayStr && currentMinutes > endMins);
    const isActive = (targetDateStr === todayStr) && (currentMinutes >= (startMins - 30) && currentMinutes <= endMins);

    if (isPassed) {
      if (hasClockIn && !hasClockOut) {
        return 'MISSING CLOCK-OUT';
      } else if (hasClockIn && hasClockOut) {
        return 'COMPLETED';
      } else {
        return 'MISSED SCHEDULE';
      }
    }

    if (isActive) {
      return hasClockIn ? 'IN PROGRESS' : 'SCHEDULED';
    }

    return 'SCHEDULED';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ON LEAVE':
        return { label: 'ON LEAVE', color: isLight ? '#4F46E5' : '#818CF8', bg: isLight ? '#EEF2FF' : 'rgba(99, 102, 241, 0.15)', border: isLight ? '#E0E7FF' : 'rgba(99, 102, 241, 0.3)' };
      case 'IN PROGRESS':
        return { label: 'IN PROGRESS', color: isLight ? '#059669' : '#34D399', bg: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.15)', border: isLight ? '#A7F3D0' : 'rgba(52, 211, 153, 0.3)' };
      case 'COMPLETED':
        return { label: 'COMPLETED', color: isLight ? '#2563EB' : '#60A5FA', bg: isLight ? '#DBEAFE' : 'rgba(96, 165, 250, 0.15)', border: isLight ? '#BFDBFE' : 'rgba(96, 165, 250, 0.3)' };
      case 'MISSING CLOCK-OUT':
        return { label: 'MISSING CLOCK-OUT', color: isLight ? '#DC2626' : '#F87171', bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', border: isLight ? '#FECACA' : 'rgba(248, 113, 113, 0.3)' };
      case 'MISSED SCHEDULE':
        return { label: 'MISSED SCHEDULE', color: isLight ? '#DC2626' : '#F87171', bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', border: isLight ? '#FECACA' : 'rgba(248, 113, 113, 0.3)' };
      default:
        return { label: 'SCHEDULED', color: isLight ? '#475569' : colors.textSecondary, bg: isLight ? '#F1F5F9' : colors.iconBg, border: isLight ? '#E2E8F0' : colors.border };
    }
  };

  const openDayModal = (dayName, dateStr, daySchedulesList) => {
    setActiveDayTitle(`${dayName.toUpperCase()} (${dateStr})`);
    setActiveDaySchedules(daySchedulesList);
    setModalVisible(true);
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
            const targetDateStr = getPHDateString(targetDate);
            
            const daySchedules = schedules.filter(s => String(s.date).startsWith(targetDateStr));
            const primarySchedule = daySchedules.length > 0 ? daySchedules[0] : null;
            
            const evaluatedStatus = primarySchedule ? evaluateScheduleStatus(primarySchedule, targetDateStr) : 'SCHEDULED';
            const badge = getStatusBadge(evaluatedStatus);

            return (
              <View key={dayName} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{dayName.toUpperCase()}</Text>
                  <Text style={styles.dayDate}>{targetDate.getDate()}</Text>
                </View>
                <View style={styles.dayContent}>
                  {primarySchedule ? (
                    <View style={styles.scheduleItem}>
                      <View style={styles.courseHeader}>
                        <BookOpen size={16} color={colors.primary} />
                        <Text style={styles.courseText}>{primarySchedule.course}</Text>
                      </View>
                      <View style={styles.detailsGrid}>
                        <View style={styles.infoRow}>
                          <Clock size={14} color={isLight ? "#64748B" : colors.textSecondary} />
                          <Text style={styles.infoText}>
                            {formatTo12H(primarySchedule.start_time)} – {formatTo12H(primarySchedule.end_time)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MapPin size={14} color={isLight ? "#64748B" : colors.textSecondary} />
                          <Text style={styles.infoText}>{primarySchedule.place || 'Main Campus'}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
                      </View>

                      {/* See More Button if 2 or more schedules exist on the same day */}
                      {daySchedules.length > 1 && (
                        <TouchableOpacity 
                          style={styles.seeMoreButton} 
                          onPress={() => openDayModal(dayName, targetDateStr, daySchedules)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.seeMoreText}>See More (+{daySchedules.length - 1} more session{daySchedules.length > 2 ? 's' : ''})</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.noSchedule}>No classes scheduled</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Modal for Multiple Schedules on Same Day */}
        <Modal visible={modalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderTitle}>{activeDayTitle}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                  <X size={20} color={isLight ? "#0F172A" : colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
                {activeDaySchedules.map((item, idx) => {
                  const itemStatus = evaluateScheduleStatus(item, item.date);
                  const badge = getStatusBadge(itemStatus);
                  return (
                    <View key={item.id || idx} style={styles.modalScheduleItem}>
                      <View style={styles.courseHeader}>
                        <BookOpen size={16} color={colors.primary} />
                        <Text style={styles.courseText}>{item.course}</Text>
                      </View>
                      <View style={styles.detailsGrid}>
                        <View style={styles.infoRow}>
                          <Clock size={14} color={isLight ? "#64748B" : colors.textSecondary} />
                          <Text style={styles.infoText}>
                            {formatTo12H(item.start_time)} – {formatTo12H(item.end_time)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MapPin size={14} color={isLight ? "#64748B" : colors.textSecondary} />
                          <Text style={styles.infoText}>{item.place || 'Main Campus'}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <TouchableOpacity style={styles.modalCloseBottomBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCloseBottomText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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

  // See More Button
  seeMoreButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: isLight ? '#F1F5F9' : colors.iconBg,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border
  },
  seeMoreText: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 12,
    color: '#00897B',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    overflow: 'hidden',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? '#F1F5F9' : colors.border,
  },
  modalHeaderTitle: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 16,
    color: isLight ? '#0F172A' : colors.textPrimary,
  },
  modalCloseBtn: { padding: 4 },
  modalScrollBody: {
    paddingVertical: 16,
    gap: 20,
  },
  modalScheduleItem: {
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? '#F1F5F9' : colors.border,
  },
  modalCloseBottomBtn: {
    marginTop: 10,
    backgroundColor: '#00897B',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalCloseBottomText: {
    fontFamily: 'Inter_18pt-Bold',
    color: '#FFFFFF',
    fontSize: 14,
  },
});