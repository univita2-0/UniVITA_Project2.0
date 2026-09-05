// src/screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  Alert, RefreshControl, Modal, TextInput, Image, Dimensions, Platform, StatusBar, AppState
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import axios from 'axios';

import {
  clockIn, clockOut, fetchAttendanceHistory, fetchUserSchedule,
  syncOfflineQueue, fetchEmergencyAlerts, markAlertAsRead, requestAttendanceCorrection,
  setTrackingEnabled, API_URL
} from './api';
import ChatScreen from './ChatScreen';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 

import {
  Clock, MapPin, X, MessageCircle, CheckCircle, XCircle,
  AlertCircle, TrendingUp, FileText, Camera, Calendar, Sparkles, ArrowUpRight
} from 'lucide-react-native';

const LOCATION_TASK_NAME = 'background-location-task';

const disableBatteryOptimization = async () => {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    } catch (err) {}
  }
};

const getTodayString = () => new Date().toISOString().split('T')[0];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  
  // Connect to global Theme
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = React.useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState({ id: null, name: "Employee", employeeId: "", full_name: "" });
  const [refreshing, setRefreshing] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [attendanceStatus, setAttendanceStatus] = useState({ canClockIn: true, canClockOut: false, todayRecord: null });
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, overtime: 0 });
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionDate, setCorrectionDate] = useState('');
  const [correctionType, setCorrectionType] = useState('clock_in');
  const [correctionTime, setCorrectionTime] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSelfie, setCorrectionSelfie] = useState(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  
  const hasSynced = useRef(false);
  const alertSound = useRef(null); 
  const activeAlertId = useRef(null);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "GOOD MORNING";
    if (hour < 18) return "GOOD AFTERNOON";
    return "GOOD EVENING";
  };

  useEffect(() => {
    return () => { if (alertSound.current) alertSound.current.unloadAsync(); };
  }, []);

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
              await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                accuracy: Location.Accuracy.High, timeInterval: 20000, distanceInterval: 0,
                deferredUpdatesInterval: 20000, showsBackgroundLocationIndicator: true,
                foregroundService: { notificationTitle: "Tracking Active", notificationBody: "Monitoring location", notificationColor: colors.primary },
              });
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

  const loadData = useCallback(async () => {
    try {
      const rawUser = await AsyncStorage.getItem('user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        const empId = parsed.employee_id;
        setUser({ ...parsed, employeeId: empId });
        const schedule = await fetchUserSchedule(empId);
        const todayStr = new Date().toLocaleDateString('en-CA');
        const now = new Date();
        const currentTimeStr = now.toTimeString().split(' ')[0];
        const todaySchedules = schedule.filter(s => s.date === todayStr);
        let activeSchedule = todaySchedules.find(s => currentTimeStr >= s.start_time && currentTimeStr <= s.end_time);
        if (!activeSchedule) activeSchedule = todaySchedules.find(s => s.start_time > currentTimeStr) || todaySchedules[todaySchedules.length - 1];
        setTodaySchedule(activeSchedule || null);
        const history = await fetchAttendanceHistory(empId);
        calculateStats(history);
        checkTodayStatus(history, activeSchedule);
      }
    } catch (error) {}
  }, []);

  const checkTodayStatus = (history, activeSchedule) => {
    if (!activeSchedule) { setAttendanceStatus({ canClockIn: false, canClockOut: false, todayRecord: null }); return; }
    const todayRecord = history.find(record => record.schedule_id === activeSchedule.id);
    if (todayRecord) {
      const isClockedIn = !!todayRecord.time_in;
      const isClockedOut = todayRecord.time_out && todayRecord.time_out !== '--:--';
      setAttendanceStatus({ canClockIn: false, canClockOut: isClockedIn && !isClockedOut, todayRecord: { ...todayRecord, time_in: todayRecord.time_in || '--:--', time_out: todayRecord.time_out || '--:--' } });
    } else setAttendanceStatus({ canClockIn: true, canClockOut: false, todayRecord: null });
  };

  const calculateStats = (history) => {
    let counts = { present: 0, absent: 0, late: 0, overtime: 0 };
    history.forEach(r => {
      if (r.status === 'present') counts.present++;
      else if (r.status === 'late') counts.late++;
      else if (r.status === 'absent') counts.absent++;
      if (parseFloat(r.total_hours) > 8) counts.overtime++;
    });
    setStats(counts);
  };

  const handleClockIn = async () => {
    if (!todaySchedule) return Alert.alert("Notice", "No schedule available for today.");
    const selfieUri = await captureSelfie();
    if (!selfieUri) return Alert.alert('Action Required', 'A selfie is mandatory for check-in.');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    try {
      const formData = new FormData();
      formData.append('employee_id', user.employeeId);
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());
      formData.append('location_enabled', 'true');
      formData.append('schedule_id', todaySchedule.id);
      formData.append('selfie', { uri: selfieUri, name: 'selfie.jpg', type: 'image/jpeg' });
      const result = await clockIn(formData);
      if (result.success) { Alert.alert('Success', result.message); await loadData(); }
      else Alert.alert('Check-In Error', result.message);
    } catch (error) { Alert.alert('Network Error', 'Connection failed.'); }
  };

  const handleClockOut = async () => {
    if (!todaySchedule) return;
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 5); 
    const scheduledEndTime = todaySchedule.end_time; 
    if (currentTimeStr < scheduledEndTime.slice(0, 5)) {
      Alert.alert("Early Check-Out", `Your shift ends at ${scheduledEndTime.slice(0,5)}. Do you wish to request a correction for an early check-out?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Request", onPress: () => navigation.navigate("Requests", { prefillTab: "correction", prefillDate: getTodayString(), prefillType: "clock_out", prefillTime: currentTimeStr, prefillReason: "Early departure requested" }) }
      ]);
      return;
    }
    const selfieUri = await captureSelfie();
    if (!selfieUri) return Alert.alert('Action Required', 'A selfie is mandatory.');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    try {
      const formData = new FormData();
      formData.append('employee_id', user.employeeId);
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());
      formData.append('location_enabled', 'false');
      formData.append('schedule_id', todaySchedule.id);
      formData.append('selfie', { uri: selfieUri, name: 'out.jpg', type: 'image/jpeg' });
      const result = await clockOut(formData);
      if (result.success) {
        Alert.alert('Success', result.message);
        try { const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME); if (isRegistered) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (e) {}
        await loadData();
      } else Alert.alert('Check-Out Error', result.message);
    } catch (error) { Alert.alert('Network Error', 'Connection failed.'); }
  };

  const submitCorrection = async () => {
    if (!correctionDate || !correctionTime || !correctionReason.trim()) return Alert.alert('Required', 'Please fill all mandatory fields.');
    const selfieUri = correctionSelfie || await captureSelfie();
    if (!selfieUri) return Alert.alert('Selfie Required', 'A selfie is mandatory for this request.');
    setSubmittingCorrection(true);
    try {
      const formData = new FormData();
      formData.append('employee_id', user.employeeId);
      formData.append('date', correctionDate);
      formData.append('type', correctionType);
      formData.append('time', correctionTime);
      formData.append('reason', correctionReason.trim());
      formData.append('selfie', { uri: selfieUri, name: 'correction.jpg', type: 'image/jpeg' });
      const result = await requestAttendanceCorrection(formData);
      if (result.success) {
        Alert.alert('Submitted', 'Your request has been forwarded to HR.');
        setShowCorrectionModal(false);
        setCorrectionDate(''); setCorrectionTime(''); setCorrectionReason(''); setCorrectionSelfie(null);
      } else {
        Alert.alert('Submission Error', result.message);
      }
    } catch (err) { Alert.alert('Network Error', 'Connection failed.'); }
    finally { setSubmittingCorrection(false); }
  };

  useEffect(() => {
    const loadAlerts = async () => {
      if (!user.id) return;
      try {
        const alerts = await fetchEmergencyAlerts(user.id);
        const unreadAlerts = alerts.filter(a => !a.read_at);
        if (unreadAlerts.length > 0 && activeAlertId.current !== unreadAlerts[0].id) {
          setAlertQueue(unreadAlerts);
          showNextAlert(unreadAlerts[0]);
        }
      } catch (err) {}
    };
    loadAlerts(); 
    const intervalId = setInterval(loadAlerts, 10000);
    return () => clearInterval(intervalId);
  }, [user.id]);

  const showNextAlert = async (alert) => {
    activeAlertId.current = alert.id; 
    setCurrentAlert(alert);
    setShowAlertModal(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      if (alertSound.current) { await alertSound.current.stopAsync(); await alertSound.current.unloadAsync(); }
      const soundSource = alert.severity === 'critical' ? require('../../assets/critical.mp3') : require('../../assets/info.mp3'); 
      const { sound } = await Audio.Sound.createAsync(soundSource);
      alertSound.current = sound;
      await sound.setIsLoopingAsync(true);
      await sound.playAsync();
    } catch (error) {}
  };

  const dismissAlert = async () => {
    if (alertSound.current) { try { await alertSound.current.stopAsync(); await alertSound.current.unloadAsync(); alertSound.current = null; } catch (error) {} }
    if (currentAlert) {
      await markAlertAsRead(currentAlert.id, user.id);
      const newQueue = alertQueue.filter(a => a.id !== currentAlert.id);
      setAlertQueue(newQueue);
      setShowAlertModal(false);
      if (newQueue.length > 0) showNextAlert(newQueue[0]); else activeAlertId.current = null;
    } else { setShowAlertModal(false); activeAlertId.current = null; }
  };

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };
  
  const formattedDate = currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  const formatNameForDisplay = (name) => {
    if (!name) return "";
    const parts = name.split(" ");
    if (parts.length > 2) {
      return `${parts.slice(0, parts.length - 1).join(" ")}\n${parts[parts.length - 1]}`;
    }
    return name;
  };

  // Logic bounds for checking if active buttons should be disabled.
  const finalCanClockIn = todaySchedule !== null && attendanceStatus.canClockIn;
  const finalCanClockOut = todaySchedule !== null && attendanceStatus.canClockOut;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLight ? "#0F172A" : "#FFFFFF"} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Hero Header */}
          <View style={styles.heroHeaderRow}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <View style={styles.liveBadgeContainer}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>ONLINE</Text>
            </View>
          </View>
          <Text style={styles.userName}>{formatNameForDisplay(user.full_name || user.name)}</Text>

          {/* Time & Date Banner */}
          <View style={styles.glassBanner}>
            <View style={styles.bannerContentLeft}>
              <View style={styles.calendarIconWrapper}>
                <Calendar size={22} color={isLight ? "#0F172A" : colors.textPrimary} strokeWidth={1.5} />
              </View>
              <View>
                <Text style={styles.bannerLabel}>TODAY'S SCHEDULE</Text>
                <Text style={styles.bannerDateText}>{formattedDate}</Text>
              </View>
            </View>
            <Text style={styles.bannerTimeText}>{formattedTime}</Text>
          </View>

          {/* Shift Details Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              
              <Text style={styles.cardTitle}> ACTIVE SHIFT ASSIGNMENT</Text>
            </View>
            {todaySchedule ? (
              <View style={styles.scheduleBody}>
                <View style={styles.scheduleRow}>
                  <View style={styles.iconBox}><Clock size={16} color={isLight ? "#64748B" : colors.textSecondary} /></View>
                  <View>
                    <Text style={styles.scheduleSubLabel}>Time Window</Text>
                    <Text style={styles.scheduleDataText}>{todaySchedule.start_time?.substring(0,5)} – {todaySchedule.end_time?.substring(0,5)}</Text>
                  </View>
                </View>
                <View style={styles.scheduleRow}>
                  <View style={styles.iconBox}><MapPin size={16} color={isLight ? "#64748B" : colors.textSecondary} /></View>
                  <View>
                    <Text style={styles.scheduleSubLabel}>Location / Room</Text>
                    <Text style={styles.scheduleDataText}>{todaySchedule.place}</Text>
                  </View>
                </View>
                <View style={styles.scheduleRow}>
                  <View style={styles.iconBox}><FileText size={16} color={isLight ? "#64748B" : colors.textSecondary} /></View>
                  <View>
                    <Text style={styles.scheduleSubLabel}>Course / Department</Text>
                    <Text style={styles.scheduleDataText}>{todaySchedule.course || "General Assignment"}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No active schedule assigned for today.</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionContainer}>
            <TouchableOpacity 
              style={[styles.btnPillPrimary, !finalCanClockIn && styles.btnDisabled]} 
              onPress={handleClockIn} 
              disabled={!finalCanClockIn} 
              activeOpacity={0.85}
            >
              <Clock size={18} color={!finalCanClockIn ? (isLight ? "#94A3B8" : colors.textSecondary) : (isLight ? "#FFFFFF" : colors.buttonText)} strokeWidth={2} />
              <Text style={[styles.btnPillPrimaryText, !finalCanClockIn && styles.btnDisabledText]}>CHECK-IN</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btnPillOutline, !finalCanClockOut && styles.btnDisabledOutline]} 
              onPress={handleClockOut} 
              disabled={!finalCanClockOut} 
              activeOpacity={0.85}
            >
              <Clock size={18} color={!finalCanClockOut ? (isLight ? "#94A3B8" : colors.textSecondary) : (isLight ? "#0F172A" : colors.textPrimary)} strokeWidth={2} />
              <Text style={[styles.btnPillOutlineText, !finalCanClockOut && styles.btnDisabledText]}>CHECK-OUT</Text>
            </TouchableOpacity>
          </View>

          {/* Performance Overview */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Performance Overview</Text>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll} contentContainerStyle={{ gap: 12 }}>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.15)' }]}>
                <CheckCircle size={24} color={isLight ? "#059669" : "#34D399"} strokeWidth={2} />
              </View>
              <Text style={styles.statValue}>{stats.present}</Text>
              <Text style={styles.statLabel}>PRESENT</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)' }]}>
                <XCircle size={24} color={isLight ? "#DC2626" : "#F87171"} strokeWidth={2} />
              </View>
              <Text style={styles.statValue}>{stats.absent}</Text>
              <Text style={styles.statLabel}>ABSENT</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)' }]}>
                <AlertCircle size={24} color={isLight ? "#D97706" : "#FBBF24"} strokeWidth={2} />
              </View>
              <Text style={styles.statValue}>{stats.late}</Text>
              <Text style={styles.statLabel}>LATE</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrapper, { backgroundColor: isLight ? '#DBEAFE' : 'rgba(96, 165, 250, 0.15)' }]}>
                <TrendingUp size={24} color={isLight ? "#2563EB" : "#60A5FA"} strokeWidth={2} />
              </View>
              <Text style={styles.statValue}>{stats.overtime}</Text>
              <Text style={styles.statLabel}>OVERTIME</Text>
            </View>
          </ScrollView>

          {/* Quick Modules */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Modules</Text>
          </View>
          <View style={styles.modulesGrid}>
            <TouchableOpacity style={styles.moduleCard} onPress={() => navigation.navigate('Requests')} activeOpacity={0.8}>
              <View style={styles.moduleTopRow}>
                <View style={styles.moduleIconWrapper}>
                  <FileText size={22} color={isLight ? "#334155" : colors.textPrimary} strokeWidth={1.5} />
                </View>
                <ArrowUpRight size={18} color={isLight ? "#94A3B8" : colors.textSecondary} />
              </View>
              <Text style={styles.moduleText}>System{'\n'}Requests</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moduleCard} onPress={() => navigation.navigate('MyPayroll')} activeOpacity={0.8}>
              <View style={styles.moduleTopRow}>
                <View style={styles.moduleIconWrapper}>
                  <TrendingUp size={22} color={isLight ? "#334155" : colors.textPrimary} strokeWidth={1.5} />
                </View>
                <ArrowUpRight size={18} color={isLight ? "#94A3B8" : colors.textSecondary} />
              </View>
              <Text style={styles.moduleText}>Payroll{'\n'}Details</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Floating Chat */}
        <TouchableOpacity style={styles.fab} onPress={() => setShowChat(true)} activeOpacity={0.85}>
          <MessageCircle size={24} color={isLight ? "#FFFFFF" : colors.background} />
          {unreadCount > 0 && <View style={styles.fabBadge}><Text style={styles.fabBadgeText}>{unreadCount}</Text></View>}
        </TouchableOpacity>

        {/* Alert Modal */}
        <Modal visible={showAlertModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.alertModal, currentAlert?.severity === 'critical' ? styles.alertCritical : styles.alertInfo]}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}><AlertCircle size={48} color={currentAlert?.severity === 'critical' ? colors.danger : colors.info} /></View>
              <Text style={styles.alertHeader}>{currentAlert?.severity === 'critical' ? 'CRITICAL ALERT' : 'SYSTEM INFO'}</Text>
              <Text style={styles.alertTitle}>{currentAlert?.title}</Text>
              <Text style={styles.alertBody}>{currentAlert?.message}</Text>
              <TouchableOpacity style={styles.btnAlertDismiss} onPress={dismissAlert}><Text style={styles.btnAlertText}>Acknowledge</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Chat Modal */}
        <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowChat(false)}>
          <SafeAreaView style={styles.chatContainer}>
            <View style={styles.chatNavbar}>
              <TouchableOpacity onPress={() => setShowChat(false)} style={styles.closeBtn}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.chatNavbarTitle}>Communications</Text>
              <View style={{ width: 40 }} />
            </View>
            <ChatScreen />
          </SafeAreaView>
        </Modal>

      </SafeAreaView>
    </>
  );
}

// DYNAMIC STYLESHEET GENERATOR
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
  cardHeader: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border, alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: 0.8 },
  scheduleBody: { padding: 20, gap: 18 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  scheduleSubLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: isLight ? '#64748B' : colors.textSecondary, textTransform: 'uppercase' },
  scheduleDataText: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, marginTop: 1 },
  emptyState: { paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center' },
  emptyStateText: { fontFamily: 'Inter_18pt-Medium', color: isLight ? '#64748B' : colors.textSecondary, fontSize: 14 },
  
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
  sectionActionText: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },
  
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
  
  fab: { position: 'absolute', bottom: 24, right: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: isLight ? '#0F172A' : '#FFFFFF', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
  fabBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: isLight ? '#EF4444' : colors.danger, borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: isLight ? '#F8FAFC' : colors.background },
  fabBadgeText: { fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF', fontSize: 10 },
  
  chatContainer: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  chatNavbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderBottomWidth: 1, borderBottomColor: isLight ? '#E2E8F0' : colors.border },
  closeBtn: { padding: 4 },
  chatNavbarTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },
  
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertModal: { width: '100%', borderRadius: 24, padding: 24, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  alertCritical: { borderColor: colors.danger },
  alertInfo: { borderColor: colors.info },
  alertHeader: { fontFamily: 'Inter_18pt-Bold', textAlign: 'center', fontSize: 12, color: colors.textSecondary, marginBottom: 12, letterSpacing: 1 },
  alertTitle: { fontFamily: 'Inter_18pt-Bold', textAlign: 'center', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 12 },
  alertBody: { fontFamily: 'Inter_18pt-Regular', textAlign: 'center', color: isLight ? '#475569' : colors.textPrimary, lineHeight: 22, marginBottom: 24 },
  btnAlertDismiss: { backgroundColor: isLight ? '#0F172A' : colors.buttonBg, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnAlertText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText, fontSize: 15 },
});