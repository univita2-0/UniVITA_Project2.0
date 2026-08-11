import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  Alert, RefreshControl, Modal, TextInput, Image, Dimensions, Platform, StatusBar, AppState
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';

import {
  clockIn, clockOut, fetchAttendanceHistory, fetchUserSchedule,
  syncOfflineQueue, fetchEmergencyAlerts, markAlertAsRead, requestAttendanceCorrection,
  setTrackingEnabled
} from './api';
import ChatScreen from './ChatScreen';
import { API_URL } from './api';

import {
  Bell, Clock, MapPin, X, MessageCircle, CheckCircle, XCircle,
  AlertCircle, TrendingUp, FileText, User, Camera, CalendarDays
} from 'lucide-react-native';

const LOCATION_TASK_NAME = 'background-location-task';

const disableBatteryOptimization = async () => {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
    } catch (err) {
      console.log("Couldn't open battery settings", err);
    }
  }
};

const { width } = Dimensions.get('window');
const getTodayString = () => new Date().toISOString().split('T')[0];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState({ id: null, name: "Employee", employeeId: "", full_name: "" });
  const [refreshing, setRefreshing] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [attendanceStatus, setAttendanceStatus] = useState({
    canClockIn: true, canClockOut: false, todayRecord: null
  });
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
  const activeAlertId = useRef(null); // Prevents the interval from endlessly triggering the same alert

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  // Cleanup sound if component unmounts
  useEffect(() => {
    return () => {
      if (alertSound.current) {
        alertSound.current.unloadAsync();
      }
    };
  }, []);

  // ---------- INITIAL PERMISSIONS ----------
  useEffect(() => {
    let isMounted = true;
    const initBackgroundTracking = async () => {
      try {
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        const { status: bg } = await Location.requestBackgroundPermissionsAsync();
        if (fg !== 'granted' || bg !== 'granted') {
          console.warn("Location permissions not fully granted");
          return;
        }
        const { status: notif } = await Notifications.requestPermissionsAsync();
        if (notif !== 'granted') {
          console.warn("Notification permission not granted.");
        }
        if (Platform.OS === 'android') {
          await disableBatteryOptimization();
        }
      } catch (err) {
        console.error("Failed to start background tracking:", err);
      }
    };
    initBackgroundTracking();
    return () => { isMounted = false; };
  }, []);

  // 🛡️ BULLETPROOF WATCHDOG
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
            
            if (forceRestart && isRegistered) {
              await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            }
            
            if (!isRegistered || forceRestart) {
              await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                accuracy: Location.Accuracy.High,
                timeInterval: 20000,
                distanceInterval: 0,
                deferredUpdatesInterval: 20000,
                showsBackgroundLocationIndicator: true,
                foregroundService: {
                  notificationTitle: "UniVITA Tracking Active",
                  notificationBody: "Monitoring location for shift compliance.",
                  notificationColor: "#0D9488",
                },
              });
            }
          }
        } catch (e) {
          console.warn("Watchdog tracking error:", e);
        }
      } else if (willStartSoon) {
        const timer = setTimeout(() => checkAndEnableTracking(true), startTime - now);
        return () => clearTimeout(timer);
      }
    };

    checkAndEnableTracking();

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        checkAndEnableTracking(true);
      }
    });

    const interval = setInterval(() => {
      checkAndEnableTracking(false);
    }, 30000); 

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [todaySchedule]);

  // 🚀 FOREGROUND PINGER
  useEffect(() => {
    if (!todaySchedule) return;

    const [startHour, startMin] = todaySchedule.start_time.split(':').map(Number);
    const [endHour, endMin] = todaySchedule.end_time.split(':').map(Number);

    let isPinging = false;

    const pingServer = async () => {
      if (isPinging) return;
      
      const now = new Date();
      const startTime = new Date(); startTime.setHours(startHour, startMin, 0);
      const endTime = new Date(); endTime.setHours(endHour, endMin, 0);

      if (now >= startTime && now <= endTime) {
        isPinging = true;
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          const gpsOn = await Location.hasServicesEnabledAsync();
          
          let lat = 0;
          let lon = 0;
          let isLocEnabled = false;

          if (status === 'granted' && gpsOn && AppState.currentState === 'active') {
            try {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
              lat = loc.coords.latitude;
              lon = loc.coords.longitude;
              isLocEnabled = true;
            } catch (e) {
              isLocEnabled = false; 
            }
          }

          const token = await AsyncStorage.getItem('auth_token');
          if (token) {
            await axios.post(`${API_URL}/instructor/location`, {
              latitude: lat,
              longitude: lon,
              location_enabled: isLocEnabled 
            }, {
              headers: { Authorization: `Bearer ${token}` }
            });
          }
        } catch (err) {
          console.warn("Foreground ping error:", err.message);
        } finally {
          isPinging = false;
        }
      }
    };

    pingServer();
    const intervalId = setInterval(pingServer, 20000);

    return () => clearInterval(intervalId);
  }, [todaySchedule]);

  // ✅ AUTO-STOP BACKGROUND TRACKING WHEN SHIFT ENDS
  useEffect(() => {
    if (!todaySchedule) return;

    const checkShiftEnd = async () => {
      const now = new Date();
      const [endHour, endMinute] = todaySchedule.end_time.split(':').map(Number);
      const endTime = new Date();
      endTime.setHours(endHour, endMinute, 0);

      if (now >= endTime) {
        try {
          const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
          if (isRegistered) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          }
        } catch (err) {
          console.warn("Error stopping tracking:", err);
        }
      }
    };

    const interval = setInterval(checkShiftEnd, 60000);
    return () => clearInterval(interval);
  }, [todaySchedule]);

  // ---------- Helper functions ----------
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
        if (!activeSchedule) {
          activeSchedule = todaySchedules.find(s => s.start_time > currentTimeStr) || todaySchedules[todaySchedules.length - 1];
        }
        setTodaySchedule(activeSchedule || null);
        await AsyncStorage.setItem('today_schedule', JSON.stringify(activeSchedule || null));
        const history = await fetchAttendanceHistory(empId);
        calculateStats(history);
        checkTodayStatus(history, activeSchedule);
      }
    } catch (error) {
      console.error("Error loading home data:", error);
    }
  }, []);

  const checkTodayStatus = (history, activeSchedule) => {
    if (!activeSchedule) {
      setAttendanceStatus({ canClockIn: false, canClockOut: false, todayRecord: null });
      return;
    }
    const todayRecord = history.find(record => record.schedule_id === activeSchedule.id);
    if (todayRecord) {
      const isClockedIn = !!todayRecord.time_in;
      const isClockedOut = todayRecord.time_out && todayRecord.time_out !== '--:--';
      setAttendanceStatus({
        canClockIn: false,
        canClockOut: isClockedIn && !isClockedOut,
        todayRecord: { ...todayRecord, time_in: todayRecord.time_in || '--:--', time_out: todayRecord.time_out || '--:--' }
      });
    } else {
      setAttendanceStatus({ canClockIn: true, canClockOut: false, todayRecord: null });
    }
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
      const filename = selfieUri.split('/').pop();
      formData.append('selfie', { uri: selfieUri, name: filename, type: 'image/jpeg' });
      const result = await clockIn(formData);
      if (result.success) {
        Alert.alert('Success', result.message);
        await loadData();
      } else {
        Alert.alert('Check-In Error', result.message);
      }
    } catch (error) { Alert.alert('Network Error', 'Connection failed. Please check your internet.'); }
  };

  const handleClockOut = async () => {
    if (!todaySchedule) {
      Alert.alert("Notice", "No schedule available for today.");
      return;
    }

    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 5); 
    const scheduledEndTime = todaySchedule.end_time; 

    if (currentTimeStr < scheduledEndTime.slice(0, 5)) {
      Alert.alert(
        "Early Check-Out",
        `Your shift ends at ${scheduledEndTime.slice(0,5)}. Do you wish to request a correction for an early check-out?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Request",
            onPress: () => {
              navigation.navigate("Requests", {
                prefillTab: "correction",
                prefillDate: getTodayString(),
                prefillType: "clock_out",
                prefillTime: currentTimeStr,
                prefillReason: "Early departure requested"
              });
            }
          }
        ]
      );
      return;
    }

    const selfieUri = await captureSelfie();
    if (!selfieUri) return Alert.alert('Action Required', 'A selfie is mandatory for check-out.');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    try {
      const formData = new FormData();
      formData.append('employee_id', user.employeeId);
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());
      formData.append('location_enabled', 'false');
      formData.append('schedule_id', todaySchedule.id);
      const filename = selfieUri.split('/').pop();
      formData.append('selfie', { uri: selfieUri, name: filename, type: 'image/jpeg' });
      const result = await clockOut(formData);
      if (result.success) {
        Alert.alert('Success', result.message);
        
        try {
          const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
          if (isRegistered) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          }
        } catch (e) {
          console.warn("Error stopping tracking:", e);
        }

        await loadData();
      } else {
        Alert.alert('Check-Out Error', result.message);
      }
    } catch (error) { Alert.alert('Network Error', 'Connection failed. Please check your internet.'); }
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

  // --- IMPROVED ALERT POLLING --- //
  useEffect(() => {
    const loadAlerts = async () => {
      if (!user.id) return;
      try {
        const alerts = await fetchEmergencyAlerts(user.id);
        const unreadAlerts = alerts.filter(a => !a.read_at);
        
        if (unreadAlerts.length > 0) {
          // Check if we are already displaying this exact alert to prevent infinite loops
          if (activeAlertId.current !== unreadAlerts[0].id) {
            setAlertQueue(unreadAlerts);
            showNextAlert(unreadAlerts[0]);
          }
        }
      } catch (err) { console.error('Failed to fetch alerts', err); }
    };

    loadAlerts(); // Load immediately on mount

    // Poll for new alerts every 10 seconds while the app is active
    const intervalId = setInterval(loadAlerts, 10000);
    
    return () => clearInterval(intervalId);
  }, [user.id]);

  const showNextAlert = async (alert) => {
    activeAlertId.current = alert.id; // Lock this alert ID
    setCurrentAlert(alert);
    setShowAlertModal(true);

    // Provide Haptic Feedback
    if (alert.severity === 'critical') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else if (alert.severity === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Play Continuous Alert Sound Based on Severity
    try {
      if (alertSound.current) {
        await alertSound.current.stopAsync();
        await alertSound.current.unloadAsync();
        alertSound.current = null;
      }

      let soundSource;
      if (alert.severity === 'critical') {
        soundSource = require('../../assets/critical.mp3'); 
      } else if (alert.severity === 'warning') {
        soundSource = require('../../assets/warning.mp3'); 
      } else {
        soundSource = require('../../assets/info.mp3'); 
      }
      
      const { sound } = await Audio.Sound.createAsync(soundSource);
      alertSound.current = sound;
      
      await sound.setIsLoopingAsync(true);
      await sound.playAsync();

    } catch (error) {
      console.log("Error playing alert sound:", error);
    }
  };

  const dismissAlert = async () => {
    // Stop the continuous sound immediately
    if (alertSound.current) {
      try {
        await alertSound.current.stopAsync();
        await alertSound.current.unloadAsync();
        alertSound.current = null;
      } catch (error) {
        console.log("Error stopping alert sound:", error);
      }
    }

    if (currentAlert) {
      await markAlertAsRead(currentAlert.id, user.id);
      const newQueue = alertQueue.filter(a => a.id !== currentAlert.id);
      setAlertQueue(newQueue);
      setShowAlertModal(false);
      
      if (newQueue.length > 0) {
        showNextAlert(newQueue[0]);
      } else {
        activeAlertId.current = null; // Release the lock
      }
    } else {
      setShowAlertModal(false);
      activeAlertId.current = null;
    }
  };

  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;
    syncOfflineQueue().then(count => { if (count > 0) Alert.alert("Sync", `${count} records synced.`); });
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) syncOfflineQueue().then(count => { if (count > 0) Alert.alert("Sync", `${count} records synced.`); });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchUnread = async () => {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/chat/unread-counts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const sum = data.reduce((acc, r) => acc + (r.unread || 0), 0);
        setUnreadCount(sum);
      } catch (e) {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };
  const formattedDate = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const finalCanClockIn = todaySchedule !== null && attendanceStatus.canClockIn;
  const finalCanClockOut = todaySchedule !== null && attendanceStatus.canClockOut;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0D9488"]} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>{user.full_name || user.name}</Text>
            </View>
          </View>

          {/* Date & Time Widget */}
          <View style={styles.dateWidget}>
            <View style={styles.dateInfo}>
              <CalendarDays size={18} color="#0D9488" />
              <Text style={styles.dateText}>{formattedDate}</Text>
            </View>
            <Text style={styles.timeText}>{formattedTime}</Text>
          </View>

          {/* Schedule Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Current Shift</Text>
            </View>
            {todaySchedule ? (
              <View style={styles.scheduleBody}>
                <View style={styles.scheduleRow}>
                  <Clock size={16} color="#6B7280" />
                  <Text style={styles.scheduleDataText}>
                    {todaySchedule.start_time?.substring(0,5)} – {todaySchedule.end_time?.substring(0,5)}
                  </Text>
                </View>
                <View style={styles.scheduleRow}>
                  <MapPin size={16} color="#6B7280" />
                  <Text style={styles.scheduleDataText}>{todaySchedule.place}</Text>
                </View>
                <View style={styles.scheduleRow}>
                  <FileText size={16} color="#6B7280" />
                  <Text style={styles.scheduleDataText}>{todaySchedule.course || "General Assignment"}</Text>
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
              style={[styles.btnPrimary, !finalCanClockIn && styles.btnDisabled]}
              onPress={handleClockIn}
              disabled={!finalCanClockIn}
            >
              <Clock size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Check-In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnOutline, !finalCanClockOut && styles.btnDisabled]}
              onPress={handleClockOut}
              disabled={!finalCanClockOut}
            >
              <Clock size={18} color="#0D9488" />
              <Text style={styles.btnOutlineText}>Check-Out</Text>
            </TouchableOpacity>
          </View>

          {/* Status Indicator */}
          {attendanceStatus.todayRecord && (
            <View style={styles.statusIndicator}>
              <CheckCircle size={16} color="#059669" />
              <Text style={styles.statusText}>
                {(!attendanceStatus.todayRecord.time_out || attendanceStatus.todayRecord.time_out === '--:--')
                  ? `Active session started at ${attendanceStatus.todayRecord.time_in}`
                  : `Session finalized at ${attendanceStatus.todayRecord.time_out}`
                }
              </Text>
            </View>
          )}

          {/* Performance Overview */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Performance Overview</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
            <StatCard icon={<CheckCircle size={20} color="#0D9488" />} label="Present" value={stats.present} />
            <StatCard icon={<XCircle size={20} color="#DC2626" />} label="Absent" value={stats.absent} />
            <StatCard icon={<AlertCircle size={20} color="#F59E0B" />} label="Late" value={stats.late} />
            <StatCard icon={<TrendingUp size={20} color="#2563EB" />} label="Overtime" value={stats.overtime} />
          </ScrollView>

          {/* Direct Modules */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Modules</Text>
          </View>
          <View style={styles.modulesGrid}>
            <TouchableOpacity style={styles.moduleCard} onPress={() => navigation.navigate('Requests')}>
              <View style={styles.moduleIconWrapper}>
                <FileText size={20} color="#0D9488" />
              </View>
              <Text style={styles.moduleText}>System Requests</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moduleCard} onPress={() => navigation.navigate('MyPayroll')}>
              <View style={styles.moduleIconWrapper}>
                <TrendingUp size={20} color="#0D9488" />
              </View>
              <Text style={styles.moduleText}>Payroll Details</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Floating Chat Button */}
        <TouchableOpacity style={styles.fab} onPress={() => setShowChat(true)}>
          <MessageCircle size={24} color="#FFFFFF" />
          {unreadCount > 0 && (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* --- IMPROVED EMERGENCY ALERT MODAL --- */}
        <Modal visible={showAlertModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.alertModal, currentAlert?.severity === 'critical' ? styles.alertCritical : currentAlert?.severity === 'warning' ? styles.alertWarning : styles.alertInfo]}>
              
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <AlertCircle size={48} color={currentAlert?.severity === 'critical' ? '#DC2626' : currentAlert?.severity === 'warning' ? '#F59E0B' : '#3B82F6'} />
              </View>

              <Text style={[styles.alertHeader, { textAlign: 'center', fontSize: 14 }]}>
                {currentAlert?.severity === 'critical' ? 'CRITICAL ALERT' : currentAlert?.severity === 'warning' ? 'WARNING' : 'SYSTEM INFO'}
              </Text>
              
              <Text style={[styles.alertTitle, { textAlign: 'center', fontSize: 20 }]}>{currentAlert?.title}</Text>
              <Text style={[styles.alertBody, { textAlign: 'center', marginTop: 8 }]}>{currentAlert?.message}</Text>
              
              <View style={[styles.alertActions, { marginTop: 24, alignItems: 'stretch' }]}>
                <TouchableOpacity 
                  style={[styles.btnAlertDismiss, { alignItems: 'center', paddingVertical: 12 }]} 
                  onPress={dismissAlert}
                >
                  <Text style={[styles.btnAlertText, { fontSize: 15 }]}>Acknowledge</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </Modal>

        {/* Chat Modal */}
        <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowChat(false)}>
          <SafeAreaView style={styles.chatContainer}>
            <View style={styles.chatNavbar}>
              <TouchableOpacity onPress={() => setShowChat(false)} style={styles.closeBtn}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.chatNavbarTitle}>Communications</Text>
              <View style={{ width: 40 }} />
            </View>
            <ChatScreen />
          </SafeAreaView>
        </Modal>

        {/* Correction Modal */}
        <Modal visible={showCorrectionModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.formalModal}>
              <View style={styles.formalModalHeader}>
                <Text style={styles.formalModalTitle}>Attendance Correction</Text>
                <TouchableOpacity onPress={() => setShowCorrectionModal(false)}><X size={20} color="#6B7280" /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Date</Text>
                  <TextInput style={[styles.input, styles.inputDisabled]} value={correctionDate} editable={false} />
                </View>
                
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Correction Type</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity style={[styles.chip, correctionType === 'clock_in' && styles.chipActive]} onPress={() => setCorrectionType('clock_in')}>
                      <Text style={[styles.chipText, correctionType === 'clock_in' && styles.chipTextActive]}>Check-In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, correctionType === 'clock_out' && styles.chipActive]} onPress={() => setCorrectionType('clock_out')}>
                      <Text style={[styles.chipText, correctionType === 'clock_out' && styles.chipTextActive]}>Check-Out</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Time (HH:MM)</Text>
                  <TextInput style={styles.input} placeholder="09:00" value={correctionTime} onChangeText={setCorrectionTime} keyboardType="numeric" />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Reason</Text>
                  <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Provide details..." value={correctionReason} onChangeText={setCorrectionReason} />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Verification Image</Text>
                  <TouchableOpacity style={styles.uploadBox} onPress={async () => { const uri = await captureSelfie(); if (uri) setCorrectionSelfie(uri); }}>
                    <Camera size={20} color="#6B7280" />
                    <Text style={styles.uploadText}>{correctionSelfie ? 'Tap to Retake' : 'Capture Selfie'}</Text>
                  </TouchableOpacity>
                  {correctionSelfie && <Image source={{ uri: correctionSelfie }} style={styles.previewImg} />}
                </View>

                <TouchableOpacity style={styles.btnPrimaryFull} onPress={submitCorrection} disabled={submittingCorrection}>
                  <Text style={styles.btnPrimaryText}>{submittingCorrection ? 'Processing...' : 'Submit Request'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const StatCard = ({ icon, label, value }) => (
  <View style={styles.statCard}>
    <View style={styles.statIcon}>{icon}</View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' },
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 20 },
  greeting: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  userName: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 2 },

  dateWidget: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, paddingHorizontal: 4 },
  dateInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  timeText: { fontSize: 24, fontWeight: '800', color: '#111827' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20, overflow: 'hidden' },
  cardHeader: { backgroundColor: '#FAFAFA', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#111827', textTransform: 'uppercase', letterSpacing: 0.5 },
  scheduleBody: { padding: 16, gap: 12 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleDataText: { fontSize: 15, fontWeight: '500', color: '#374151' },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyStateText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },

  actionContainer: { flexDirection: 'row', gap: 12, marginBottom: 16, paddingHorizontal: 16, paddingBottom: 16 },
  btnPrimary: { flex: 1, flexDirection: 'row', backgroundColor: '#0D9488', paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnOutline: { flex: 1, flexDirection: 'row', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#0D9488', paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  btnOutlineText: { color: '#0D9488', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },

  statusIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ECFDF5', paddingVertical: 10, borderRadius: 8, marginBottom: 24, borderWidth: 1, borderColor: '#D1FAE5' },
  statusText: { fontSize: 13, color: '#047857', fontWeight: '600' },

  sectionHeader: { marginBottom: 12, marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  
  statsScroll: { flexDirection: 'row', marginBottom: 24 },
  statCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginRight: 12, width: 110, borderWidth: 1, borderColor: '#E5E7EB' },
  statIcon: { marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: '500', color: '#6B7280', textTransform: 'uppercase' },

  modulesGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  moduleCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', gap: 10 },
  moduleIconWrapper: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#F0FDFA', justifyContent: 'center', alignItems: 'center' },
  moduleText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0D9488', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6 },
  fabBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#DC2626', borderRadius: 12, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#FAFAFA' },
  fabBadgeText: { color: 'white', fontSize: 10, fontWeight: '800' },

  chatContainer: { flex: 1, backgroundColor: '#FAFAFA' },
  chatNavbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  closeBtn: { padding: 4 },
  chatNavbarTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  
  alertModal: { width: '100%', borderRadius: 16, padding: 24, backgroundColor: '#FFFFFF', borderWidth: 2 },
  alertCritical: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  alertWarning: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  alertInfo: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  alertHeader: { fontWeight: '800', marginBottom: 12, color: '#111827', letterSpacing: 1 },
  alertTitle: { fontWeight: '800', color: '#111827', marginBottom: 12 },
  alertBody: { color: '#374151', lineHeight: 22, marginBottom: 20 },
  alertActions: { width: '100%', marginTop: 10 },
  btnAlertDismiss: { backgroundColor: '#111827', borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnAlertText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  formalModal: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 12, maxHeight: '85%', padding: 20 },
  formalModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  formalModalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#4B5563', textTransform: 'uppercase', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 14, color: '#111827', backgroundColor: '#FFFFFF' },
  inputDisabled: { backgroundColor: '#F3F4F6', color: '#6B7280' },
  textArea: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, alignItems: 'center' },
  chipActive: { backgroundColor: '#0D9488', borderColor: '#0D9488' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  chipTextActive: { color: '#FFFFFF' },
  uploadBox: { borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 8, padding: 20, alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB' },
  uploadText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  previewImg: { width: '100%', height: 160, borderRadius: 8, marginTop: 12 },
  btnPrimaryFull: { backgroundColor: '#0D9488', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
});