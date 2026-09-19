// src/screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  Alert, RefreshControl, Modal, TextInput, Platform, StatusBar, AppState
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  clockIn, clockOut, fetchAttendanceHistory, fetchUserSchedule, setTrackingEnabled
} from './api';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 
import {
  Clock, MapPin, X, CheckCircle, XCircle, AlertCircle, TrendingUp, FileText, Calendar, ArrowUpRight, Eye, Filter
} from 'lucide-react-native';

const LOCATION_TASK_NAME = 'background-location-task';

const disableBatteryOptimization = async () => {
  if (Platform.OS === 'android') {
    try { await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS); } catch (err) {}
  }
};

const getTodayString = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

const getInitialMonthString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const parseDateOnly = (dateInput) => {
  if (!dateInput) return null;
  const dStr = String(dateInput).split('T')[0];
  const [y, m, d] = dStr.split('-').map(Number);
  if (!y || !m || !d) return new Date(dateInput);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setHours(0, 0, 0, 0);
  return dateObj;
};

const calculateStatsForMonth = (historyList, scheduleList, monthStr) => {
  let present = 0, late = 0, absent = 0, overtime = 0;
  const currentDateVal = new Date();
  currentDateVal.setHours(0, 0, 0, 0);

  const monthSchedules = (scheduleList || []).filter(s => {
    const sDateStr = String(s.date || '').split('T')[0];
    return monthStr ? sDateStr.startsWith(monthStr) : true;
  });

  const usedAttendanceIds = new Set();

  monthSchedules.forEach(s => {
    const sDateStr = String(s.date || '').split('T')[0];
    const schedDateVal = parseDateOnly(sDateStr);
    if (!schedDateVal) return;

    if (schedDateVal <= currentDateVal) {
      let record = (historyList || []).find(r => r.schedule_id === s.id && !usedAttendanceIds.has(r.id));
      if (!record) {
        record = (historyList || []).find(r => {
          const rDateStr = String(r.date || r.attendance_date || '').split('T')[0];
          return rDateStr === sDateStr && !usedAttendanceIds.has(r.id);
        });
      }

      if (record) {
        if (record.id) usedAttendanceIds.add(record.id);
        const status = (record.status || '').toLowerCase();
        
        if (status === 'late') late++;
        else if (status === 'present' || status === 'completed') present++;
        else if (['absent', 'missed schedule', 'did not attend', 'missed shift', 'did_not_attend', 'absent today'].includes(status)) absent++;
        else {
          if (record.time_in && record.time_in !== '--:--') present++;
          else absent++;
        }

        if (parseFloat(record.total_hours) > 8) overtime++;
      } else {
        absent++;
      }
    }
  });

  return { present, absent, late, overtime };
};

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = React.useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState({ id: null, name: "Employee", employeeId: "", full_name: "" });
  const [refreshing, setRefreshing] = useState(false);
  
  const [rawHistory, setRawHistory] = useState([]);
  const [rawSchedule, setRawSchedule] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(getInitialMonthString());

  const [allTodaySchedules, setAllTodaySchedules] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [attendanceStatus, setAttendanceStatus] = useState({ canClockIn: true, canClockOut: false, todayRecord: null });
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, overtime: 0 });
  
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [modalDateFilter, setModalDateFilter] = useState('');

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "GOOD MORNING";
    if (hour < 18) return "GOOD AFTERNOON";
    return "GOOD EVENING";
  };

  useEffect(() => {
    let isMounted = true;
    const initBackgroundTracking = async () => {
      try {
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        const { status: bg } = await Location.requestBackgroundPermissionsAsync();
        if (fg !== 'granted' || bg !== 'granted') return;
        if (Platform.OS === 'android') await disableBatteryOptimization();
      } catch (err) {}
    };
    initBackgroundTracking();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!todaySchedule) return;
    const checkAndEnableTracking = async (forceRestart = false) => {
      const now = new Date();
      const [startHour, startMin] = todaySchedule.start_time.split(':').map(Number);
      const [endHour, endMin] = todaySchedule.end_time.split(':').map(Number);
      const startTime = new Date(); startTime.setHours(startHour, startMin, 0);
      const endTime = new Date(); endTime.setHours(endHour, endMin, 0);
      const isActive = now >= startTime && now <= endTime;
      const willStartSoon = startTime - now > 0 && startTime - now < 30 * 60 * 1000;

      if (isActive) {
        try {
          const gpsOn = await Location.hasServicesEnabledAsync();
          if (gpsOn) {
            await setTrackingEnabled(true);
            const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
            if (forceRestart && isRegistered) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            
            if (!isRegistered || forceRestart) {
              try {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                  accuracy: Location.Accuracy.High, 
                  timeInterval: 20000, 
                  distanceInterval: 0,
                  deferredUpdatesInterval: 20000, 
                  showsBackgroundLocationIndicator: true,
                  foregroundService: { notificationTitle: "Tracking Active", notificationBody: "Monitoring location for active shift", notificationColor: colors.primary },
                });
              } catch (foregroundErr) {}
            }
          }
        } catch (e) {}
      } else if (willStartSoon) {
        const timer = setTimeout(() => checkAndEnableTracking(true), startTime - now);
        return () => clearTimeout(timer);
      }
    };
    checkAndEnableTracking();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') checkAndEnableTracking(true); });
    const interval = setInterval(() => checkAndEnableTracking(false), 30000); 
    return () => { subscription.remove(); clearInterval(interval); };
  }, [todaySchedule, colors.primary]);

  const captureSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission needed'); return null; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    return !result.canceled ? result.assets[0].uri : null;
  };

  const computeMonthlyStats = useCallback((historyList, scheduleList, monthStr) => {
    const result = calculateStatsForMonth(historyList, scheduleList, monthStr);
    setStats(result);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const rawUser = await AsyncStorage.getItem('user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        const empId = parsed.employee_id;
        setUser({ ...parsed, employeeId: empId });
        const schedule = await fetchUserSchedule(empId);
        const history = await fetchAttendanceHistory(empId);
        
        setRawHistory(history || []);
        setRawSchedule(schedule || []);
        computeMonthlyStats(history || [], schedule || [], selectedMonth);

        const todayStr = getTodayString();
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        const parseMins = (ts) => {
          if (!ts) return 0;
          let cs = String(ts).split('.')[0].replace(',', ':');
          const [h, m] = cs.split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };

        const todaySchedules = (schedule || [])
          .filter(s => String(s.date).startsWith(todayStr))
          .map(s => {
            const record = (history || []).find(r => r.schedule_id === s.id);
            const startMins = parseMins(s.start_time);
            const endMins = parseMins(s.end_time);
            const isPassed = currentMinutes > endMins;
            const isActive = currentMinutes >= (startMins - 30) && currentMinutes <= endMins;
            
            const hasClockIn = record && record.time_in && record.time_in !== '--:--' && record.time_in !== null;
            const hasClockOut = record && record.time_out && record.time_out !== '--:--' && record.time_out !== null;

            let computedStatus = 'SCHEDULED';
            
            if (hasClockOut) {
              const dbStatus = (record?.status || '').toLowerCase();
              if (dbStatus.includes('early') || dbStatus.includes('clock out') || dbStatus.includes('departure')) {
                computedStatus = 'COMPLETED - EARLY CLOCK OUT';
              } else {
                computedStatus = record?.status ? record.status.toUpperCase() : 'COMPLETED';
              }
            } else if (isPassed) {
              if (hasClockIn && !hasClockOut) {
                computedStatus = 'MISSING CLOCK-OUT';
              } else if (hasClockIn && hasClockOut) {
                computedStatus = record.status ? record.status.toUpperCase() : 'COMPLETED';
              } else {
                computedStatus = 'MISSED SCHEDULE';
              }
            } else if (isActive) {
              computedStatus = hasClockIn ? 'IN PROGRESS' : 'SCHEDULED';
            } else {
              computedStatus = 'SCHEDULED';
            }

            return {
              ...s,
              startMins,
              endMins,
              isClockedIn: hasClockIn,
              isClockedOut: hasClockOut,
              computedStatus,
              record,
            };
          })
          .sort((a, b) => a.startMins - b.startMins);

        setAllTodaySchedules(todaySchedules);

        let activeSchedule = todaySchedules.find(s => currentMinutes >= (s.startMins - 30) && currentMinutes <= s.endMins);
        if (!activeSchedule) activeSchedule = todaySchedules.find(s => s.startMins > currentMinutes);
        if (!activeSchedule && todaySchedules.length > 0) activeSchedule = todaySchedules[todaySchedules.length - 1];
        
        setTodaySchedule(activeSchedule || null);
        checkTodayStatus(history || [], activeSchedule);
      }
    } catch (error) { console.error("LoadData error:", error); }
  }, [selectedMonth, computeMonthlyStats]);

  useEffect(() => { computeMonthlyStats(rawHistory, rawSchedule, selectedMonth); }, [selectedMonth, rawHistory, rawSchedule, computeMonthlyStats]);

  const checkTodayStatus = (history, activeSchedule) => {
    if (!activeSchedule) { setAttendanceStatus({ canClockIn: false, canClockOut: false, todayRecord: null }); return; }
    const todayRecord = history.find(record => record.schedule_id === activeSchedule.id);
    if (todayRecord) {
      const isClockedIn = !!todayRecord.time_in;
      const isClockedOut = todayRecord.time_out && todayRecord.time_out !== '--:--';
      setAttendanceStatus({ canClockIn: false, canClockOut: isClockedIn && !isClockedOut, todayRecord: { ...todayRecord, time_in: todayRecord.time_in || '--:--', time_out: todayRecord.time_out || '--:--' } });
    } else setAttendanceStatus({ canClockIn: true, canClockOut: false, todayRecord: null });
  };

  const handleClockIn = async () => {
    if (!todaySchedule) return Alert.alert("Notice", "No schedule available for today.");
    const selfieUri = await captureSelfie();
    if (!selfieUri) return Alert.alert('Action Required', 'A selfie is mandatory for check-in.');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    
    try {
      const result = await clockIn({ employee_id: String(user.employeeId || ''), latitude: String(location.coords.latitude), longitude: String(location.coords.longitude), location_enabled: 'true', schedule_id: String(todaySchedule.id), selfie: selfieUri });
      if (result.success) { Alert.alert('Success', result.message); await loadData(); } else { Alert.alert('Check-In Error', result.message); }
    } catch (error) { Alert.alert('Network Error', 'Connection failed.'); }
  };

  const handleClockOut = async () => {
    if (!todaySchedule) return;
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 5); 
    const scheduledEndTime = todaySchedule.end_time; 
    
    if (currentTimeStr < scheduledEndTime.slice(0, 5)) {
      Alert.alert("Early Check-Out", `Your shift ends at ${formatTo12H(scheduledEndTime)}. Do you wish to request a correction for an early check-out?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Request", onPress: () => navigation.navigate("Requests", { prefillTab: "correction", prefillDate: getTodayString(), prefillType: "clock_out", prefillTime: currentTimeStr, prefillReason: "Early departure requested", prefillScheduleId: todaySchedule?.id }) }
      ]);
      return;
    }
    
    const selfieUri = await captureSelfie();
    if (!selfieUri) return Alert.alert('Action Required', 'A selfie is mandatory.');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    
    try {
      const result = await clockOut({ employee_id: String(user.employeeId || ''), latitude: String(location.coords.latitude), longitude: String(location.coords.longitude), location_enabled: 'false', schedule_id: String(todaySchedule.id), selfie: selfieUri });
      if (result.success) {
        Alert.alert('Success', result.message);
        try { const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME); if (isRegistered) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (e) {}
        await loadData();
      } else { Alert.alert('Check-Out Error', result.message); }
    } catch (error) { Alert.alert('Network Error', 'Connection failed.'); }
  };

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };
  
  const formattedDate = currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  const formatNameForDisplay = (name) => {
    if (!name) return "";
    const parts = name.split(" ");
    if (parts.length > 2) return `${parts.slice(0, parts.length - 1).join(" ")}\n${parts[parts.length - 1]}`;
    return name;
  };

  const formatTo12H = (timeStr) => {
    if (!timeStr || timeStr === '--:--' || timeStr === '00:00:00' || timeStr == null) return '—';
    const timePart = String(timeStr).includes('T') ? String(timeStr).split('T').split('Z')[0] : String(timeStr);
    const cleanTime = timePart.split('.')[0].replace(',', ':');
    const [rawH, rawM] = cleanTime.split(':');
    const h = parseInt(rawH, 10);
    const m = parseInt(rawM, 10) || 0;
    if (isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const formatMonthDisplay = (yyyyMm) => {
    if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm;
    const [y, m] = yyyyMm.split('-');
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const monthlySummaries = useMemo(() => {
    const map = {};
    const allMonths = new Set();
    rawSchedule.forEach(s => { if (s.date) allMonths.add(String(s.date).substring(0, 7)); });
    rawHistory.forEach(r => { const d = r.date || r.attendance_date; if (d) allMonths.add(String(d).substring(0, 7)); });

    Array.from(allMonths).forEach(mKey => { map[mKey] = { monthYear: mKey, ...calculateStatsForMonth(rawHistory, rawSchedule, mKey) }; });
    return Object.values(map).sort((a, b) => b.monthYear.localeCompare(a.monthYear));
  }, [rawSchedule, rawHistory]);

  const filteredMonthlySummaries = useMemo(() => {
    if (!modalDateFilter.trim()) return monthlySummaries;
    const query = modalDateFilter.trim().toLowerCase();
    return monthlySummaries.filter(item => {
      const fullDisplay = formatMonthDisplay(item.monthYear).toLowerCase();
      return item.monthYear.toLowerCase().includes(query) || fullDisplay.includes(query);
    });
  }, [monthlySummaries, modalDateFilter]);

  const getModalStatusStyle = (sched) => {
    const status = (sched.computedStatus || sched.attendance_status || '').toUpperCase();
    if (status.includes('MISSING CLOCK-OUT')) return { label: 'MISSING CLOCK-OUT', bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', text: isLight ? '#DC2626' : '#F87171' };
    else if (status.includes('MISSED SHIFT') || status.includes('ABSENT') || status.includes('DID NOT ATTEND')) return { label: 'MISSED SHIFT', bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', text: isLight ? '#DC2626' : '#F87171' };
    else if (status.includes('COMPLETED') || status.includes('PRESENT')) return { label: 'COMPLETED', bg: isLight ? '#F1F5F9' : '#334155', text: isLight ? '#64748B' : '#94A3B8' };
    else if (status.includes('IN PROGRESS') || status.includes('LATE')) return { label: status, bg: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)', text: isLight ? '#D97706' : '#FBBF24' };
    else return { label: 'SCHEDULED', bg: isLight ? '#EFF6FF' : 'rgba(37, 99, 235, 0.15)', text: isLight ? '#2563EB' : '#60A5FA' };
  };

  const finalCanClockIn = todaySchedule !== null && attendanceStatus.canClockIn;
  const finalCanClockOut = todaySchedule !== null && attendanceStatus.canClockOut;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLight ? "#0F172A" : "#FFFFFF"} />} showsVerticalScrollIndicator={false}>
          
          <View style={styles.heroHeaderRow}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <View style={styles.liveBadgeContainer}><View style={styles.liveDot} /><Text style={styles.liveBadgeText}>ONLINE</Text></View>
          </View>
          <Text style={styles.userName}>{formatNameForDisplay(user.full_name || user.name)}</Text>

          <View style={styles.glassBanner}>
            <View style={styles.bannerContentLeft}>
              <View style={styles.calendarIconWrapper}><Calendar size={22} color={isLight ? "#0F172A" : colors.textPrimary} strokeWidth={1.5} /></View>
              <View><Text style={styles.bannerLabel}>TODAY'S SCHEDULE</Text><Text style={styles.bannerDateText}>{formattedDate}</Text></View>
            </View>
            <Text style={styles.bannerTimeText}>{formattedTime}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.cardTitle}>ACTIVE SHIFT ASSIGNMENT</Text>
                {allTodaySchedules.length > 1 && <View style={styles.shiftBadge}><Text style={styles.shiftBadgeText}>{allTodaySchedules.length}</Text></View>}
              </View>
              {allTodaySchedules.length > 1 && <TouchableOpacity onPress={() => setShowScheduleModal(true)}><Text style={styles.seeAllText}>See more</Text></TouchableOpacity>}
            </View>
            {todaySchedule ? (
              <View style={styles.scheduleBody}>
                {(() => {
                  let shiftStatus = todaySchedule.computedStatus ? todaySchedule.computedStatus.toUpperCase() : 'SCHEDULED';
                  let statusBadgeStyle = styles.statusScheduled;
                  let statusBadgeTextColor = isLight ? '#475569' : '#CBD5E1';

                  if (shiftStatus.includes('MISS') || shiftStatus.includes('ABSENT') || shiftStatus.includes('DID NOT ATTEND')) {
                    statusBadgeStyle = { backgroundColor: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)' };
                    statusBadgeTextColor = isLight ? '#DC2626' : '#F87171';
                  } else if (shiftStatus.includes('IN PROGRESS') || shiftStatus.includes('LATE')) {
                    statusBadgeStyle = styles.statusInProgress;
                    statusBadgeTextColor = isLight ? '#059669' : '#34D399';
                  } else if (shiftStatus.includes('COMPLETED') || shiftStatus.includes('PRESENT') || shiftStatus.includes('EARLY') || shiftStatus.includes('CLOCK OUT')) {
                    statusBadgeStyle = styles.statusMissed;
                    statusBadgeTextColor = isLight ? '#64748B' : '#94A3B8';
                  } else { shiftStatus = 'SCHEDULED'; }

                  return (
                    <>
                      <View style={styles.scheduleRow}>
                        <View style={styles.iconBox}><Clock size={16} color={isLight ? "#64748B" : colors.textSecondary} /></View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <Text style={styles.scheduleSubLabel}>Time Window</Text>
                            <View style={[styles.statusBadge, statusBadgeStyle]}>
                              <Text style={[styles.statusBadgeText, { color: statusBadgeTextColor }]}>{shiftStatus}</Text>
                            </View>
                          </View>
                          <Text style={styles.scheduleDataText}>{formatTo12H(todaySchedule.start_time)} – {formatTo12H(todaySchedule.end_time)}</Text>
                        </View>
                      </View>
                      <View style={styles.scheduleRow}>
                        <View style={styles.iconBox}><MapPin size={16} color={isLight ? "#64748B" : colors.textSecondary} /></View>
                        <View><Text style={styles.scheduleSubLabel}>Location / Room</Text><Text style={styles.scheduleDataText}>{todaySchedule.place}</Text></View>
                      </View>
                      <View style={styles.scheduleRow}>
                        <View style={styles.iconBox}><FileText size={16} color={isLight ? "#64748B" : colors.textSecondary} /></View>
                        <View><Text style={styles.scheduleSubLabel}>Course / Department</Text><Text style={styles.scheduleDataText}>{todaySchedule.course || "General Assignment"}</Text></View>
                      </View>
                    </>
                  );
                })()}
              </View>
            ) : <View style={styles.emptyState}><Text style={styles.emptyStateText}>No active schedule assigned for today.</Text></View>}
          </View>

          <View style={styles.actionContainer}>
            <TouchableOpacity style={[styles.btnPillPrimary, !finalCanClockIn && styles.btnDisabled]} onPress={handleClockIn} disabled={!finalCanClockIn} activeOpacity={0.85}>
              <Clock size={18} color={!finalCanClockIn ? (isLight ? "#94A3B8" : colors.textSecondary) : (isLight ? "#FFFFFF" : colors.buttonText)} strokeWidth={2} />
              <Text style={[styles.btnPillPrimaryText, !finalCanClockIn && styles.btnDisabledText]}>CHECK-IN</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnPillOutline, !finalCanClockOut && styles.btnDisabledOutline]} onPress={handleClockOut} disabled={!finalCanClockOut} activeOpacity={0.85}>
              <Clock size={18} color={!finalCanClockOut ? (isLight ? "#94A3B8" : colors.textSecondary) : (isLight ? "#0F172A" : colors.textPrimary)} strokeWidth={2} />
              <Text style={[styles.btnPillOutlineText, !finalCanClockOut && styles.btnDisabledText]}>CHECK-OUT</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.sectionTitle}>Performance Overview</Text>
              <TouchableOpacity onPress={() => setShowMonthlyModal(true)} style={styles.eyeIconBtn} activeOpacity={0.7}><Eye size={18} color={isLight ? "#0D9488" : colors.primary} /></TouchableOpacity>
            </View>
            <TextInput style={styles.monthCycleInput} value={selectedMonth} onChangeText={setSelectedMonth} placeholder="YYYY-MM" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} maxLength={7} />
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll} contentContainerStyle={{ gap: 12 }}>
            <View style={styles.statCard}><View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.15)' }]}><CheckCircle size={24} color={isLight ? "#059669" : "#34D399"} strokeWidth={2} /></View><Text style={styles.statValue}>{stats.present}</Text><Text style={styles.statLabel}>PRESENT</Text></View>
            <View style={styles.statCard}><View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)' }]}><XCircle size={24} color={isLight ? "#DC2626" : "#F87171"} strokeWidth={2} /></View><Text style={styles.statValue}>{stats.absent}</Text><Text style={styles.statLabel}>ABSENT</Text></View>
            <View style={styles.statCard}><View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)' }]}><AlertCircle size={24} color={isLight ? "#D97706" : "#FBBF24"} strokeWidth={2} /></View><Text style={styles.statValue}>{stats.late}</Text><Text style={styles.statLabel}>LATE</Text></View>
            <View style={styles.statCard}><View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#DBEAFE' : 'rgba(96, 165, 250, 0.15)' }]}><TrendingUp size={24} color={isLight ? "#2563EB" : "#60A5FA"} strokeWidth={2} /></View><Text style={styles.statValue}>{stats.overtime}</Text><Text style={styles.statLabel}>OVERTIME</Text></View>
          </ScrollView>

          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Quick Modules</Text></View>
          <View style={styles.modulesGrid}>
            <TouchableOpacity style={styles.moduleCard} onPress={() => navigation.navigate('Requests')} activeOpacity={0.8}>
              <View style={styles.moduleTopRow}><View style={styles.moduleIconWrapper}><FileText size={22} color={isLight ? "#334155" : colors.textPrimary} strokeWidth={1.5} /></View><ArrowUpRight size={18} color={isLight ? "#94A3B8" : colors.textSecondary} /></View>
              <Text style={styles.moduleText}>System{'\n'}Requests</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moduleCard} onPress={() => navigation.navigate('MyPayroll')} activeOpacity={0.8}>
              <View style={styles.moduleTopRow}><View style={styles.moduleIconWrapper}><TrendingUp size={22} color={isLight ? "#334155" : colors.textPrimary} strokeWidth={1.5} /></View><ArrowUpRight size={18} color={isLight ? "#94A3B8" : colors.textSecondary} /></View>
              <Text style={styles.moduleText}>Payroll{'\n'}Details</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Modal visible={showMonthlyModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.schedModal}>
              <View style={styles.schedModalHeader}>
                <Text style={styles.schedModalTitle}>Monthly Performance History</Text>
                <TouchableOpacity onPress={() => setShowMonthlyModal(false)}><X size={22} color={colors.textSecondary} /></TouchableOpacity>
              </View>

              <View style={styles.modalFilterRow}>
                <Filter size={16} color={isLight ? "#64748B" : colors.textSecondary} />
                <TextInput style={styles.modalDateFilterInput} placeholder="Filter by Year or Month" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} value={modalDateFilter} onChangeText={setModalDateFilter} />
                {modalDateFilter ? <TouchableOpacity onPress={() => setModalDateFilter('')}><X size={16} color={isLight ? "#64748B" : colors.textSecondary} /></TouchableOpacity> : null}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 10 }}>
                {filteredMonthlySummaries.length === 0 ? <Text style={styles.emptyStateText}>No monthly history found.</Text> : filteredMonthlySummaries.map((item) => (
                  <TouchableOpacity key={item.monthYear} style={[styles.monthlySummaryCard, selectedMonth === item.monthYear && styles.monthlySummaryCardActive]} onPress={() => { setSelectedMonth(item.monthYear); setShowMonthlyModal(false); }} activeOpacity={0.8}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><Text style={styles.monthlySummaryTitle}>{formatMonthDisplay(item.monthYear)}</Text><Text style={styles.selectMonthHintText}>{selectedMonth === item.monthYear ? 'Active Cycle' : 'Tap to View'}</Text></View>
                    <View style={styles.monthlySummaryGrid}>
                      <Text style={styles.monthlySummaryStat}>Present: <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#059669' }}>{item.present}</Text></Text>
                      <Text style={styles.monthlySummaryStat}>Absent: <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#DC2626' }}>{item.absent}</Text></Text>
                      <Text style={styles.monthlySummaryStat}>Late: <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#D97706' }}>{item.late}</Text></Text>
                      <Text style={styles.monthlySummaryStat}>Overtime: <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#2563EB' }}>{item.overtime}</Text></Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.btnCloseModal} onPress={() => setShowMonthlyModal(false)}><Text style={{ fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary, fontSize: 13 }}>Close</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showScheduleModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.schedModal}>
              <View style={styles.schedModalHeader}>
                <Text style={styles.schedModalTitle}>Daily Schedule Overview</Text>
                <TouchableOpacity onPress={() => setShowScheduleModal(false)}><X size={22} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {allTodaySchedules.map((sched, index) => {
                  const statusData = getModalStatusStyle(sched);
                  return (
                    <View key={index} style={styles.schedItem}>
                      <View style={styles.schedItemTop}>
                        <Text style={styles.schedItemTitle}>{sched.course || "General Assignment"}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusData.bg }]}><Text style={[styles.statusBadgeText, { color: statusData.text }]}>{statusData.label}</Text></View>
                      </View>
                      <View style={styles.schedItemBottom}>
                        <View style={styles.schedItemDetail}><Clock size={12} color={isLight ? "#64748B" : colors.textSecondary} /><Text style={styles.schedItemText}>{formatTo12H(sched.start_time)} – {formatTo12H(sched.end_time)}</Text></View>
                        <View style={styles.schedItemDetail}><MapPin size={12} color={isLight ? "#64748B" : colors.textSecondary} /><Text style={styles.schedItemText}>{sched.place}</Text></View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={styles.btnCloseModal} onPress={() => setShowScheduleModal(false)}><Text style={{ fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary, fontSize: 13 }}>Close</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 120, paddingTop: 10 },
  heroHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  greeting: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, letterSpacing: 1.2 },
  userName: { fontFamily: 'Inter_18pt-Bold', fontSize: 28, color: isLight ? '#0F172A' : colors.textPrimary, lineHeight: 34, marginBottom: 28 },
  liveBadgeContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: isLight ? '#059669' : '#34D399' },
  liveBadgeText: { fontFamily: 'Inter_18pt-Bold', fontSize: 10, color: isLight ? '#059669' : '#34D399', letterSpacing: 0.5 },
  glassBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 20, borderWidth: isLight ? 1 : 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.2, shadowRadius: 10, elevation: 2 },
  bannerContentLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  calendarIconWrapper: { width: 44, height: 44, borderRadius: 22, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  bannerLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: isLight ? '#64748B' : colors.textSecondary, letterSpacing: 0.5, marginBottom: 2 },
  bannerDateText: { fontFamily: 'Inter_18pt-Medium', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary },
  bannerTimeText: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary },
  card: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginBottom: 24, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border, alignItems: 'center' },
  cardTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: 0.8 },
  shiftBadge: { backgroundColor: '#0D9488', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  shiftBadgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_18pt-Bold' },
  seeAllText: { color: '#0D9488', fontSize: 12, fontFamily: 'Inter_18pt-Bold' },
  scheduleBody: { padding: 20, gap: 18 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  scheduleSubLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: isLight ? '#64748B' : colors.textSecondary, textTransform: 'uppercase' },
  scheduleDataText: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, marginTop: 1 },
  emptyState: { paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center' },
  emptyStateText: { fontFamily: 'Inter_18pt-Medium', color: isLight ? '#64748B' : colors.textSecondary, fontSize: 14 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontFamily: 'Inter_18pt-Bold', fontSize: 9, letterSpacing: 0.3, textAlign: 'right' },
  statusScheduled: { backgroundColor: isLight ? '#F1F5F9' : '#334155' },
  statusInProgress: { backgroundColor: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.2)' },
  statusMissed: { backgroundColor: isLight ? '#F1F5F9' : 'rgba(100, 116, 139, 0.2)' },
  actionContainer: { flexDirection: 'row', gap: 14, marginBottom: 32 },
  btnPillPrimary: { flex: 1, flexDirection: 'row', backgroundColor: isLight ? '#0F172A' : colors.buttonBg, paddingVertical: 18, borderRadius: 30, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPillPrimaryText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText, fontSize: 14, letterSpacing: 0.5 },
  btnPillOutline: { flex: 1, flexDirection: 'row', backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, paddingVertical: 18, borderRadius: 30, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPillOutlineText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary, fontSize: 14, letterSpacing: 0.5 },
  btnDisabled: { backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, elevation: 0, shadowOpacity: 0 },
  btnDisabledOutline: { borderColor: isLight ? '#F1F5F9' : colors.border, backgroundColor: isLight ? '#F8FAFC' : colors.background, elevation: 0, shadowOpacity: 0 },
  btnDisabledText: { color: isLight ? '#94A3B8' : colors.textSecondary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  eyeIconBtn: { padding: 4, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, borderRadius: 8, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  monthCycleInput: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#CBD5E1' : colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, width: 105, textAlign: 'center' },
  statsScroll: { flexDirection: 'row', marginBottom: 32 },
  statCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 16, width: 110, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, alignItems: 'center' },
  statIconWrapper: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statValue: { fontFamily: 'Inter_18pt-Bold', fontSize: 24, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 4 },
  statLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 10, color: isLight ? '#64748B' : colors.textSecondary, letterSpacing: 1 },
  modulesGrid: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  moduleCard: { flex: 1, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, height: 130, justifyContent: 'space-between' },
  moduleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  moduleIconWrapper: { width: 44, height: 44, borderRadius: 22, backgroundColor: isLight ? '#F8FAFC' : colors.iconBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  moduleText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  schedModal: { width: '100%', borderRadius: 24, padding: 24, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, maxHeight: '80%' },
  schedModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  schedModalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },
  modalFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isLight ? '#F8FAFC' : colors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginBottom: 14 },
  modalDateFilterInput: { flex: 1, fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary },
  monthlySummaryCard: { backgroundColor: isLight ? '#F8FAFC' : colors.background, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  monthlySummaryCardActive: { borderColor: '#0D9488', backgroundColor: isLight ? '#F0FDFA' : 'rgba(13, 148, 136, 0.1)' },
  monthlySummaryTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary },
  selectMonthHintText: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: '#0D9488' },
  monthlySummaryGrid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  monthlySummaryStat: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#475569' : colors.textSecondary },
  schedItem: { borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border, paddingVertical: 16 },
  schedItemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  schedItemTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  schedItemBottom: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  schedItemDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  schedItemText: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: isLight ? '#64748B' : colors.textSecondary },
  btnCloseModal: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginTop: 20 },
});