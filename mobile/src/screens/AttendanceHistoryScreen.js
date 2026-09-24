// src/screens/AttendanceHistoryScreen.js
import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, StatusBar, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Clock, MapPin, BookOpen, AlertCircle, CheckCircle, XCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { fetchUserSchedule, fetchAttendanceHistory } from './api';

const formatTime = (timeStr) => {
  if (!timeStr || timeStr === '--:--' || String(timeStr).includes('null')) return '--:--';
  const clean = String(timeStr).includes('T') ? String(timeStr).split('T')[1].split('Z')[0] : String(timeStr);
  const parts = clean.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  if (isNaN(hours)) return '--:--';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const clean = String(dateStr).split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return clean;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' });
};

export default function AttendanceHistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = getStyles(colors, isLight);

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const loadHistory = async () => {
        setLoading(true);
        try {
          let employeeId = await AsyncStorage.getItem('employee_id');
          const rawUser = await AsyncStorage.getItem('user');
          
          if (rawUser) {
            try {
              const parsed = JSON.parse(rawUser);
              if (!employeeId) {
                employeeId = parsed.employee_id || parsed.employeeId || parsed.id;
              }
            } catch (e) {}
          }

          if (!employeeId) {
            setHistory([]);
            return;
          }

          // Use the exact API helper functions that power HomeScreen
          const [schedulesData, attendanceData] = await Promise.all([
            fetchUserSchedule(employeeId).catch(() => []),
            fetchAttendanceHistory(employeeId).catch(() => [])
          ]);

          const rawSchedules = Array.isArray(schedulesData) ? schedulesData : [];
          const rawAttendance = Array.isArray(attendanceData) ? attendanceData : [];

          const now = new Date();

          const computedShifts = rawSchedules.map((sched) => {
            const schedDateStr = String(sched.date || '').split('T')[0];
            
            // Match attendance by schedule_id first, then by date
            let record = rawAttendance.find(a => a.schedule_id && a.schedule_id === sched.id);
            if (!record) {
              record = rawAttendance.find(a => {
                const aDateStr = String(a.date || a.attendance_date || '').split('T')[0];
                return aDateStr === schedDateStr;
              });
            }

            const timeIn = record?.time_in || sched.time_in || null;
            const timeOut = record?.time_out || sched.time_out || null;
            const hasValidTimeIn = timeIn && timeIn !== '--:--' && !String(timeIn).includes('null');
            const hasValidTimeOut = timeOut && timeOut !== '--:--' && !String(timeOut).includes('null');

            // Shift end comparison
            const [endH, endM] = (sched.end_time || '23:59:00').substring(0, 5).split(':').map(Number);
            const [sY, sM, sD] = schedDateStr.split('-').map(Number);
            const shiftEndDateTime = new Date(sY, sM - 1, sD, endH || 23, endM || 59, 0);
            const isPastShift = now > shiftEndDateTime;

            const dbStatus = String(record?.status || sched.attendance_record_status || sched.status || '').toLowerCase();

            let computedStatus = 'SCHEDULED';

            if (dbStatus.includes('leave') || (sched.course && sched.course.toLowerCase().includes('leave'))) {
              computedStatus = 'ON LEAVE';
            } else if (hasValidTimeIn && hasValidTimeOut) {
              if (dbStatus.includes('early') || dbStatus.includes('departure')) {
                computedStatus = 'EARLY CLOCK-OUT';
              } else if (dbStatus.includes('late')) {
                computedStatus = 'LATE';
              } else {
                computedStatus = 'COMPLETED';
              }
            } else if (hasValidTimeIn && !hasValidTimeOut) {
              if (isPastShift) {
                computedStatus = 'MISSED CLOCK OUT';
              } else {
                computedStatus = 'IN PROGRESS';
              }
            } else {
              if (isPastShift) {
                computedStatus = 'MISSED SCHEDULE';
              } else {
                computedStatus = 'SCHEDULED';
              }
            }

            return {
              ...sched,
              time_in: timeIn,
              time_out: timeOut,
              hasValidTimeIn,
              hasValidTimeOut,
              computedStatus
            };
          });

          computedShifts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          setHistory(computedShifts);
        } catch (error) {
          console.error("Failed to load attendance history", error);
        } finally {
          setLoading(false);
        }
      };

      loadHistory();
    }, [])
  );

  const renderStatusBadge = (status) => {
    const s = String(status || '').toUpperCase();
    if (s.includes('COMPLETED')) {
      return <View style={[styles.badge, styles.badgeSuccess]}><CheckCircle size={12} color="#059669" /><Text style={styles.badgeTextSuccess}>Completed</Text></View>;
    }
    if (s.includes('LATE')) {
      return <View style={[styles.badge, styles.badgeWarning]}><AlertCircle size={12} color="#D97706" /><Text style={styles.badgeTextWarning}>Late</Text></View>;
    }
    if (s.includes('EARLY')) {
      return <View style={[styles.badge, styles.badgeWarning]}><AlertCircle size={12} color="#D97706" /><Text style={styles.badgeTextWarning}>Early Clock-Out</Text></View>;
    }
    if (s.includes('MISSED CLOCK OUT')) {
      return <View style={[styles.badge, styles.badgeDanger]}><XCircle size={12} color="#DC2626" /><Text style={styles.badgeTextDanger}>MISSED CLOCK OUT</Text></View>;
    }
    if (s.includes('MISSED') || s.includes('ABSENT') || s.includes('DID NOT ATTEND')) {
      return <View style={[styles.badge, styles.badgeDanger]}><XCircle size={12} color="#DC2626" /><Text style={styles.badgeTextDanger}>MISSED SCHEDULE</Text></View>;
    }
    if (s.includes('LEAVE')) {
      return <View style={[styles.badge, styles.badgeInfo]}><CalendarDays size={12} color="#2563EB" /><Text style={styles.badgeTextInfo}>On Leave</Text></View>;
    }
    if (s.includes('PROGRESS')) {
      return <View style={[styles.badge, styles.badgeWarning]}><Clock size={12} color="#D97706" /><Text style={styles.badgeTextWarning}>In Progress</Text></View>;
    }
    return <View style={[styles.badge, styles.badgeNeutral]}><Clock size={12} color="#64748B" /><Text style={styles.badgeTextNeutral}>Scheduled</Text></View>;
  };

  const renderActualLog = (item) => {
    if (item.computedStatus === 'ON LEAVE') {
      return <Text style={styles.timeVal}>On Approved Leave</Text>;
    }
    if (item.hasValidTimeIn) {
      const clockIn = formatTime(item.time_in);
      if (item.hasValidTimeOut) {
        return <Text style={styles.timeVal}>{clockIn} – {formatTime(item.time_out)}</Text>;
      }
      // Clocked in but missed clock-out: Displays "5:30 PM - ---"
      return <Text style={[styles.timeVal, { color: '#DC2626' }]}>{clockIn} – ---</Text>;
    }
    return <Text style={[styles.timeVal, { color: colors.textSecondary }]}>No logs recorded</Text>;
  };

  const topInsetPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0
  );

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: topInsetPadding }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={isLight ? '#F8FAFC' : colors.background}
        translucent={Platform.OS === 'android'}
      />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance Summary</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#0D9488" style={{ marginTop: 40 }} />
        ) : history.length === 0 ? (
          <View style={styles.emptyState}>
            <CalendarDays size={48} color={colors.textSecondary} opacity={0.5} />
            <Text style={styles.emptyTitle}>No Shift History</Text>
            <Text style={styles.emptySub}>You have no recorded shift assignments yet.</Text>
          </View>
        ) : (
          history.map((item, index) => (
            <View key={item.id || index} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.dateWrap}>
                  <CalendarDays size={16} color={colors.primary} />
                  <Text style={styles.dateText}>{formatDate(item.date)}</Text>
                </View>
                {renderStatusBadge(item.computedStatus)}
              </View>

              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <BookOpen size={16} color={colors.textSecondary} />
                  <Text style={styles.infoText}>{item.course || 'General Shift'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <MapPin size={16} color={colors.textSecondary} />
                  <Text style={styles.infoText}>{item.place || 'Campus'}</Text>
                </View>
              </View>

              <View style={styles.timeSection}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeLabel}>SCHEDULED TIME</Text>
                  <Text style={styles.timeVal}>{formatTime(item.start_time)} – {formatTime(item.end_time)}</Text>
                </View>
                <View style={styles.timeDivider} />
                <View style={styles.timeCol}>
                  <Text style={styles.timeLabel}>ACTUAL LOG</Text>
                  {renderActualLog(item)}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingTop: 12, 
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? '#E2E8F0' : colors.border
  },
  backBtn: { padding: 6 },
  headerTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: colors.textPrimary },
  headerSpacer: { width: 36 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },
  
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border },
  dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: colors.textPrimary },
  
  cardBody: { gap: 10, marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: colors.textSecondary },

  timeSection: { flexDirection: 'row', backgroundColor: isLight ? '#F8FAFC' : colors.background, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  timeCol: { flex: 1 },
  timeDivider: { width: 1, backgroundColor: isLight ? '#E2E8F0' : colors.border, marginHorizontal: 12 },
  timeLabel: { fontFamily: 'Inter_18pt-Bold', fontSize: 10, color: colors.textSecondary, marginBottom: 4, letterSpacing: 0.5 },
  timeVal: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: colors.textPrimary },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeSuccess: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  badgeTextSuccess: { color: '#059669', fontSize: 11, fontFamily: 'Inter_18pt-Bold' },
  badgeWarning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  badgeTextWarning: { color: '#D97706', fontSize: 11, fontFamily: 'Inter_18pt-Bold' },
  badgeDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  badgeTextDanger: { color: '#DC2626', fontSize: 11, fontFamily: 'Inter_18pt-Bold' },
  badgeInfo: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  badgeTextInfo: { color: '#2563EB', fontSize: 11, fontFamily: 'Inter_18pt-Bold' },
  badgeNeutral: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  badgeTextNeutral: { color: '#64748B', fontSize: 11, fontFamily: 'Inter_18pt-Bold' },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: colors.textPrimary, marginTop: 16 },
  emptySub: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }
});