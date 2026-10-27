// src/screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  Alert, RefreshControl, Modal, TextInput, Platform, StatusBar, AppState, ActivityIndicator
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import axios from 'axios';
import {
  clockIn, clockOut, fetchAttendanceHistory, fetchUserSchedule, setTrackingEnabled, checkLocationServicesEnabled, sendLocationPing, API_URL, OFFLINE_QUEUE_KEY
} from './api';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 
import {
  Clock, MapPin, X, CheckCircle, XCircle, AlertCircle, TrendingUp, FileText, Calendar, ArrowUpRight, Eye, Filter, Bell, Inbox
} from 'lucide-react-native';

import { isMockingLocation } from 'react-native-turbo-mock-location-detector';





const startBackgroundTracking = async (primaryColor) => {
  try {
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
    if (fgStatus !== 'granted' || bgStatus !== 'granted') return false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) return true;

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15000,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Tracking Active",
        notificationBody: "Monitoring location for active shift",
        notificationColor: primaryColor, 
      },
    });
    return true;
  } catch (e) {
    console.warn('startBackgroundTracking failed:', e);
    return false;
  }
};

const LOCATION_TASK_NAME = 'background-location-task';

const getTodayString = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const EARLY_GRACE_MINUTES = 5;
const LATE_GRACE_MINUTES  = 15; 

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

const formatNotificationDate = (dateStr) => {
  if (!dateStr) return '';
  const raw = String(dateStr).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const dObj = new Date(y, m - 1, d, 12, 0, 0); 
    return dObj.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
    });
  }

  const iso = raw.replace(' ', 'T');
  const hasTZ = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTZ ? iso : `${iso}+08:00`);
  if (isNaN(d.getTime())) return raw.split('T')[0];
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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
        else if (status === 'present' || status === 'completed' || status === 'auto clock-out (geofence)') present++;
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

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, overtime: 0 });
  
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [modalDateFilter, setModalDateFilter] = useState('');

  const [notifications, setNotifications] = useState([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  

  const promptBatteryOptimizationOnce = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const hasPrompted = await AsyncStorage.getItem('@has_prompted_battery');
      if (hasPrompted === 'true') return;
      await AsyncStorage.setItem('@has_prompted_battery', 'true');
      Alert.alert(
        "Background Location Tracking",
        "To keep your location tracking active during work shifts while your screen is locked, please set UniVITA's battery usage to 'Unrestricted'.",
        [
          { text: "Dismiss", style: "cancel" },
          {
            text: "Open Settings",
            onPress: async () => {
              try {
                await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
              } catch (err) {
                console.warn("Failed to open battery optimization settings:", err);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error("Battery prompt error:", error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initBackgroundTracking = async () => {
      try {
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        const { status: bg } = await Location.requestBackgroundPermissionsAsync();
        if (fg !== 'granted' || bg !== 'granted') return;
        if (Platform.OS === 'android') await promptBatteryOptimizationOnce();
      } catch (err) {}
    };
    initBackgroundTracking();
    return () => { isMounted = false; };
  }, []);

  const { currentMinutes, currentTimeStrPHT } = useMemo(() => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(currentTime);

  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);

  return {
    currentMinutes: h * 60 + m,
    currentTimeStrPHT: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  };
}, [currentTime]);

const greeting = useMemo(() => {
  const h = parseInt(currentTimeStrPHT.split(':')[0], 10);
  if (h < 12) return "GOOD MORNING";
  if (h < 18) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}, [currentTimeStrPHT]);

  const todayStr = getTodayString();

  const allTodaySchedules = useMemo(() => {
  const parseMins = (ts) => {
    if (!ts) return 0;
    let cs = String(ts).split('.')[0].replace(',', ':');
    const [h, m] = cs.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  return (rawSchedule || [])
    .filter(s => String(s.date).startsWith(todayStr))
    .map(s => {
      const record = (rawHistory || []).find(r => r.schedule_id === s.id);
      const startMins = parseMins(s.start_time);
      const endMins = parseMins(s.end_time);
      // Shift is past its clock-out grace window entirely
      const isPastGrace = currentMinutes > (endMins + LATE_GRACE_MINUTES);
      // Active window includes the grace period so status stays "IN PROGRESS" / "SCHEDULED" until grace expires
      const isActive = currentMinutes >= (startMins - 30) &&
                       currentMinutes <= (endMins + LATE_GRACE_MINUTES);
      const isPassed = currentMinutes > endMins; 

      const hasClockIn  = record && record.time_in  && record.time_in  !== '--:--' && record.time_in  !== null;
      const hasClockOut = record && record.time_out && record.time_out !== '--:--' && record.time_out !== null;

      let computedStatus = 'SCHEDULED';

      if (hasClockOut) {
        const outMins = parseMins(record.time_out);
        const isEarlyByTime = endMins > 0 && outMins > 0 && outMins < endMins - 5;
        computedStatus = isEarlyByTime ? 'COMPLETED - EARLY CLOCK OUT' : 'COMPLETED';
      } else if (isPastGrace) {
        
        if (hasClockIn && !hasClockOut) {
          computedStatus = 'MISSING CLOCK-OUT';
        } else if (!hasClockIn) {
          computedStatus = 'MISSED SCHEDULE';
        } else {
          computedStatus = 'COMPLETED';
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
        isPassed,
        isPastGrace,
      };
    })
    .sort((a, b) => a.startMins - b.startMins);
}, [rawSchedule, rawHistory, todayStr, currentMinutes]);

  const todaySchedule = useMemo(() => {
  if (!allTodaySchedules.length) return null;

  // 1. Prefer the shift the user is actively clocked into (regardless of window)
  const activeClockIn = allTodaySchedules.find(s => s.isClockedIn && !s.isClockedOut);
  if (activeClockIn) return activeClockIn;

  // 2. Otherwise, the shift currently in its active or grace window
  //    (start − 30 min  →  end + LATE_GRACE_MINUTES)
  const inActiveWindow = allTodaySchedules.find(s =>
    currentMinutes >= (s.startMins - 30) &&
    currentMinutes <= (s.endMins + LATE_GRACE_MINUTES)
  );
  if (inActiveWindow) return inActiveWindow;

  // 3. Next upcoming shift
  const nextUpcoming = allTodaySchedules.find(s => s.startMins > currentMinutes);
  if (nextUpcoming) return nextUpcoming;

  // 4. Fallback: last shift of the day
  return allTodaySchedules[allTodaySchedules.length - 1] ?? null;
}, [allTodaySchedules, currentMinutes]);

  const attendanceStatus = useMemo(() => {
  if (!todaySchedule) {
    return {
      canClockIn: false,
      canClockOut: false,
      clockOutReason: 'no-schedule',
      graceEndStr: null,
      earlyOpenStr: null,        // NEW
      todayRecord: null,
    };
  }

  const endMins         = todaySchedule.endMins;
  const isPassed        = currentMinutes > endMins;
  const earlyWindowFrom = endMins - EARLY_GRACE_MINUTES;
  const lateWindowTo    = endMins + LATE_GRACE_MINUTES;

  // Late grace boundary (shift end + 15 min) as "HH:MM"
  const graceEndH   = Math.floor(lateWindowTo / 60) % 24;
  const graceEndM   = lateWindowTo % 60;
  const graceEndStr = `${String(graceEndH).padStart(2, '0')}:${String(graceEndM).padStart(2, '0')}`;

  // NEW: Early-open boundary (shift end − 5 min) as "HH:MM"
  const earlyOpenH   = Math.floor(earlyWindowFrom / 60) % 24;
  const earlyOpenM   = earlyWindowFrom % 60;
  const earlyOpenStr = `${String(earlyOpenH).padStart(2, '0')}:${String(earlyOpenM).padStart(2, '0')}`;

  let clockOutReason = null;
  if (currentMinutes < earlyWindowFrom) clockOutReason = 'too-early';
  else if (currentMinutes > lateWindowTo) clockOutReason = 'grace-expired';

  const withinWindow = clockOutReason === null;

  const todayRecord = (rawHistory || []).find(r => r.schedule_id === todaySchedule.id);

  if (todayRecord) {
    const isClockedIn  = !!todayRecord.time_in  && todayRecord.time_in  !== '--:--';
    const isClockedOut = !!todayRecord.time_out && todayRecord.time_out !== '--:--';

  
    let reason;
    if (isClockedOut)         reason = 'already-clocked-out';
    else if (!isClockedIn)    reason = 'not-clocked-in';
    else                      reason = clockOutReason;  

    return {
      canClockIn: false,
      canClockOut: isClockedIn && !isClockedOut && withinWindow,
      clockOutReason: reason,
      graceEndStr,
      earlyOpenStr,
      todayRecord: {
        ...todayRecord,
        time_in:  todayRecord.time_in  || '--:--',
        time_out: todayRecord.time_out || '--:--',
      },
    };
  }

  return {
    canClockIn: !isPassed,
    canClockOut: false,
    clockOutReason: 'not-clocked-in',
    graceEndStr,
    earlyOpenStr,
    todayRecord: null,
  };
}, [todaySchedule, rawHistory, currentMinutes]);

  
  const trackingRef = useRef({ allTodaySchedules, todaySchedule, currentMinutes });

  const loadDataRef = useRef(null); 
  useEffect(() => {
    trackingRef.current = { allTodaySchedules, todaySchedule, currentMinutes };
  }, [allTodaySchedules, todaySchedule, currentMinutes]);

  
  useEffect(() => {
  let isCancelled = false;

  const checkAndManageTracking = async (forceRestart = false) => {
    const { allTodaySchedules, todaySchedule, currentMinutes } = trackingRef.current;
    try {
      const hasActiveOrUpcomingShift = allTodaySchedules.some(shift => {
        const startMinutes = shift.startMins;
        const endMinutes = shift.endMins;
        const isClockedIn = shift.isClockedIn && !shift.isClockedOut;
        const isShiftTimeValid = currentMinutes <= endMinutes;

        return (isClockedIn && isShiftTimeValid) || (currentMinutes >= (startMinutes - 30) && currentMinutes <= endMinutes);
      });

      if (hasActiveOrUpcomingShift) {
        let isGpsFullyActive = false;
        try {
          const gpsHardwareOn = await Location.hasServicesEnabledAsync();
          const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
          isGpsFullyActive = gpsHardwareOn && fgStatus === 'granted';
        } catch (permErr) {
          isGpsFullyActive = false;
        }

        if (!isGpsFullyActive) {
          await setTrackingEnabled(false);
          await sendLocationPing(0, 0, false, 'GPS Disabled');
          const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
          if (isRegistered) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          return;
        }

        await setTrackingEnabled(true);
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

        if (!isCancelled && loc && loc.coords) {
          await sendLocationPing(
            loc.coords.latitude,
            loc.coords.longitude,
            true,
            todaySchedule?.place || 'Campus'
          );
        }

        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (forceRestart && isRegistered) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);

        if (!isRegistered || forceRestart) {
          const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
          if (bgStatus === 'granted') {
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
              accuracy: Location.Accuracy.High,
              timeInterval: 15000,
              distanceInterval: 0,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: "Tracking Active",
                notificationBody: "Monitoring location for active shift",
                notificationColor: colors.primary
              },
            });
          }
        }
      } else {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (isRegistered) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        }
        await setTrackingEnabled(false);
        await sendLocationPing(0, 0, false, 'Shift Ended');
      }
    } catch (err) {
      try {
        await setTrackingEnabled(false);
        await sendLocationPing(0, 0, false, 'GPS Disabled');
      } catch (e) {}
    }
  };

  checkAndManageTracking();

  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') {
      checkAndManageTracking(true);
      loadDataRef.current?.();  
    }
  });

  const interval = setInterval(() => checkAndManageTracking(false), 15000);

  return () => {
    isCancelled = true;
    subscription.remove();
    clearInterval(interval);
  };
}, [colors.primary]);

  const captureSelfie = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Camera permission needed', 'Please allow camera access to clock in.');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.45,        
    cameraType: 'front',
    allowsEditing: false,
    exif: false,          
  });

  if (result.canceled || !result.assets || !result.assets[0]) return null;

  let asset = result.assets[0];
  const MAX_BYTES = 4 * 1024 * 1024; 

  
  if (asset.fileSize && asset.fileSize > MAX_BYTES) {
    try {
      const { manipulateAsync, SaveFormat } = require('expo-image-manipulator');
      const resized = await manipulateAsync(
        asset.uri,
        [{ resize: { width: 1080 } }],    
        { compress: 0.55, format: SaveFormat.JPEG }
      );
      return resized.uri;
    } catch (err) {
      console.error('Selfie compression failed:', err);
      Alert.alert(
        'Photo Too Large',
        'Your photo could not be compressed. In your phone\'s Camera settings, please reduce the photo resolution, or step back so the subject is smaller in the frame.'
      );
      return null;
    }
  }

  return asset.uri;
};

  const computeMonthlyStats = useCallback((historyList, scheduleList, monthStr) => {
    const result = calculateStatsForMonth(historyList, scheduleList, monthStr);
    setStats(result);
  }, []);

  const fetchNotifications = async (empId, token) => {
    if (!empId || !token) return;
    setLoadingNotifications(true);
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [leavesRes, overtimeRes, correctionsRes, appealsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/leave-requests/history/${empId}`, config),
        axios.get(`${API_URL}/overtime-requests`, config),
        axios.get(`${API_URL}/attendance/corrections/user/${empId}`, config),
        axios.get(`${API_URL}/attendance-appeals/user/${empId}`, config),
      ]);

      let aggregated = [];
      const processItems = (res, type, titleField, dateField) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value.data)) {
          res.value.data.forEach(item => {
            const status = (item.status || '').toLowerCase();
            if (status === 'approved' || status === 'rejected') {
              aggregated.push({
                id: `${type}_${item.id}`,
                type: type,
                title: `${type} Request: ${item[titleField] || ''}`,
                status: status,
                date: item.reviewed_at || item[dateField] || item.updated_at || item.created_at,
                remarks: item.admin_remarks || (status === 'approved' ? 'Your request has been approved.' : 'Your request was not approved.')
              });
            }
          });
        }
      };

      processItems(leavesRes, 'Leave', 'type', 'request_date');
      processItems(overtimeRes, 'Overtime', 'date', 'created_at');
      processItems(correctionsRes, 'Correction', 'attendance_date', 'attendance_date');
      processItems(appealsRes, 'Appeal', 'date', 'submitted_at');

      aggregated.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setNotifications(aggregated);
    } catch (err) {
      console.error('Failed to fetch request notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const rawUser = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('auth_token');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        const empId = parsed.employee_id;
        setUser({ ...parsed, employeeId: empId });
        const schedule = await fetchUserSchedule(empId);
        const history = await fetchAttendanceHistory(empId);
        
        setRawHistory(history || []);
        setRawSchedule(schedule || []);
        computeMonthlyStats(history || [], schedule || [], selectedMonth);
        await fetchNotifications(empId, token);
      }
    } catch (error) { console.error("LoadData error:", error); }
  }, [selectedMonth, computeMonthlyStats]);

  useEffect(() => { computeMonthlyStats(rawHistory, rawSchedule, selectedMonth); }, [selectedMonth, rawHistory, rawSchedule, computeMonthlyStats]);

  useEffect(() => {
  loadDataRef.current = loadData;
}, [loadData]);

  const handleClockIn = async () => {
  if (!todaySchedule) return Alert.alert("Notice", "No schedule available for today.");

  // 🚨 NEW: offline-queue guard (mirror of clock-out)
  try {
    const rawQueue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (rawQueue) {
      const queued = JSON.parse(rawQueue) || [];
      const alreadyQueued = queued.some(
        q =>
          q.action === 'clock-in' &&
          String(q.payload?.schedule_id) === String(todaySchedule.id)
      );
      if (alreadyQueued) {
        Alert.alert(
          'Clock-In Already Saved',
          'A clock-in for this shift is already saved and will sync automatically ' +
          'when connection returns. Please wait for it to sync before tapping again.',
          [{ text: 'OK' }]
        );
        return;
      }
    }
  } catch (e) {
    console.warn('Queue read failed in clock-in guard:', e);
  }

  // Mock location check (defensive strict equality)
  try {
    const { isLocationMocked } = await isMockingLocation();
    if (isLocationMocked === true) {
      Alert.alert(
        'Security Alert',
        'Mock location detected. Please disable any fake GPS apps or developer "Allow mock locations" settings to clock in.'
      );
      return;
    }
  } catch (e) {
    console.warn('Mock location check failed (non-blocking):', e?.message || e);
  }

  const isGpsReady = await checkLocationServicesEnabled();
  if (!isGpsReady) return;

  const selfieUri = await captureSelfie();
  if (!selfieUri) return Alert.alert('Action Required', 'A selfie is mandatory for clock-in.');

  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

  try {
    const result = await clockIn({
      employee_id: String(user.employeeId || ''),
      latitude: String(location.coords.latitude),
      longitude: String(location.coords.longitude),
      location_enabled: 'true',
      schedule_id: String(todaySchedule.id),
      selfie: selfieUri,
    });

    if (result.success) {
      Alert.alert('Success', result.message);
      try { await setTrackingEnabled(true); } catch (e) {}
      await startBackgroundTracking(colors.primary);
      await loadData();
    } else if (result.queued) {
      Alert.alert('Saved Offline', result.message);
      try { await setTrackingEnabled(true); } catch (e) {}
      await startBackgroundTracking(colors.primary);
      await loadData();
    } else {
      Alert.alert('Clock-In Error', result.message);
    }
  } catch (error) {
    // 🚨 Was silent — now logged so failures are diagnosable
    console.warn('Clock-in request threw unexpectedly:', error?.message || error);
    Alert.alert('Network Error', 'Connection failed.');
  }
};

  const handleClockOut = async () => {
  if (!todaySchedule) return;

  try {
    const { isLocationMocked } = await isMockingLocation();
    if (isLocationMocked === true) {
      Alert.alert(
        'Security Alert',
        'Mock location detected. Please disable any fake GPS apps or developer "Allow mock locations" settings to clock out.'
      );
      return;
    }
  } catch (e) {
    console.warn('Mock location check failed (non-blocking):', e?.message || e);
  }

 
try {
  const rawQueue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);  
  if (rawQueue) {
    const queued = JSON.parse(rawQueue) || [];
    const alreadyQueued = queued.some(
      q =>
        q.action === 'clock-out' &&
        String(q.payload?.schedule_id) === String(todaySchedule.id)
    );
    if (alreadyQueued) {
      Alert.alert(
        'Clock-Out Already Saved',
        'A clock-out for this shift is already saved and will sync automatically ' +
        'when connection returns. Please wait for it to sync before tapping again.',
        [{ text: 'OK' }]
      );
      return;
    }
  }
} catch (e) {
  console.warn('Queue read failed in clock-out guard:', e);
}

  const endMins         = todaySchedule.endMins;
  const earlyWindowFrom = endMins - EARLY_GRACE_MINUTES;
  const lateWindowTo    = endMins + LATE_GRACE_MINUTES;

  if (currentMinutes < earlyWindowFrom) {
    Alert.alert(
      "Early Clock-Out",
      `Clock-out opens ${EARLY_GRACE_MINUTES} minutes before your shift ends at ` +
      `${formatTo12H(todaySchedule.end_time)}. Do you wish to request a correction ` +
      `for an early departure?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request",
          onPress: () => navigation.navigate("Requests", {
            prefillTab: "correction",
            prefillDate: getTodayString(),
            prefillType: "clock_out",
            prefillTime: currentTimeStrPHT,
            prefillReason: "Early departure requested",
            prefillScheduleId: todaySchedule?.id,
          }),
        },
      ]
    );
    return;
  }

  if (currentMinutes > lateWindowTo) {
    Alert.alert(
      "Grace Period Expired",
      `The ${LATE_GRACE_MINUTES}-minute clock-out grace period ended at ` +
      `${formatTo12H(attendanceStatus.graceEndStr)}. Please file an Overtime request ` +
      `or an Attendance Correction for this shift.`,
      [{ text: "OK" }]
    );
    return;
  }

  const selfieUri = await captureSelfie();
  if (!selfieUri) return Alert.alert('Action Required', 'A selfie is mandatory.');
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

  try {
    const result = await clockOut({
      employee_id: String(user.employeeId || ''),
      latitude: String(location.coords.latitude),
      longitude: String(location.coords.longitude),
      location_enabled: 'false',
      schedule_id: String(todaySchedule.id),
      selfie: selfieUri,
    });

    if (result.success) {
      Alert.alert('Success', result.message);
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (isRegistered) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (e) {}
      await loadData();
    } else if (result.queued) {
      Alert.alert('Saved Offline', result.message);
      await loadData();
    } else {
      Alert.alert('Clock-Out Error', result.message);
    }
  } catch (error) {
    Alert.alert('Network Error', 'Connection failed.');
  }
};

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };
  
  const formattedDate = currentTime.toLocaleDateString('en-US', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
  
  const formatNameForDisplay = (name) => {
    if (!name) return "";
    const parts = name.split(" ");
    if (parts.length > 2) return `${parts.slice(0, parts.length - 1).join(" ")}\n${parts[parts.length - 1]}`;
    return name;
  };

  const formatTo12H = (timeStr) => {
    if (!timeStr || timeStr === '--:--' || timeStr === '00:00:00' || timeStr == null) return '—';
    const timePart = String(timeStr).includes('T') ? String(timeStr).split('T')[1].split('Z')[0] : String(timeStr);
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

  if (status.includes('MISSING CLOCK-OUT')) {
    return { label: 'MISSING CLOCK-OUT', bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', text: isLight ? '#DC2626' : '#F87171' };
  }
  else if (status.includes('MISSED SHIFT') || status.includes('ABSENT') || status.includes('DID NOT ATTEND') || status.includes('MISSED SCHEDULE')) {
    return { label: 'MISSED SCHEDULE', bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', text: isLight ? '#DC2626' : '#F87171' };
  }
  else if (status.includes('EARLY') || status.includes('CLOCK OUT') || status.includes('DEPARTURE')) {
    
    return { label: 'EARLY CLOCK-OUT', bg: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)', text: isLight ? '#B45309' : '#FBBF24' };
  }
  else if (status.includes('COMPLETED') || status.includes('PRESENT')) {
    return { label: 'COMPLETED', bg: isLight ? '#ECFDF5' : 'rgba(52, 211, 153, 0.15)', text: isLight ? '#059669' : '#34D399' };
  }
  else if (status.includes('IN PROGRESS') || status.includes('LATE')) {
    return { label: status, bg: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)', text: isLight ? '#D97706' : '#FBBF24' };
  }
  else {
    return { label: 'SCHEDULED', bg: isLight ? '#EFF6FF' : 'rgba(37, 99, 235, 0.15)', text: isLight ? '#2563EB' : '#60A5FA' };
  }
};

  const finalCanClockIn = todaySchedule !== null && attendanceStatus.canClockIn;
  const finalCanClockOut = todaySchedule !== null && attendanceStatus.canClockOut;

    const hasClockedInToday =
  !!attendanceStatus.todayRecord?.time_in &&
  attendanceStatus.todayRecord.time_in !== '--:--';

const isPendingCorrection = attendanceStatus.todayRecord?.correction_status === 'pending';

const isLeavePending =
  todaySchedule?.attendance_record_status === 'Pending Leave' &&
  !isPendingCorrection &&
  !hasClockedInToday;

const isAppealPending =
  todaySchedule?.attendance_record_status === 'Pending Appeal' &&
  !hasClockedInToday;

const canClockOutNow =
  finalCanClockOut && !isPendingCorrection && !isLeavePending && !isAppealPending;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLight ? "#0F172A" : "#FFFFFF"} />} showsVerticalScrollIndicator={false}>
          
          <View style={styles.heroHeaderRow}>
            <Text style={styles.greeting}>{greeting}</Text>
            <View style={styles.liveBadgeContainer}><View style={styles.liveDot} /><Text style={styles.liveBadgeText}>ONLINE</Text></View>
          </View>

          <View style={styles.userHeaderRow}>
            <Text style={styles.userName}>{formatNameForDisplay(user.full_name || user.name)}</Text>
            <TouchableOpacity 
              style={styles.notificationBtn} 
              onPress={() => navigation.navigate('Notifications')} 
              activeOpacity={0.7}
            >
              <Bell size={22} color={isLight ? "#0F172A" : colors.textPrimary} strokeWidth={1.8} />
              {notifications.length > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{notifications.length > 9 ? '9+' : notifications.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

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
} else if (shiftStatus.includes('EARLY') || shiftStatus.includes('CLOCK OUT') || shiftStatus.includes('DEPARTURE')) {
 
  shiftStatus = 'EARLY CLOCK-OUT';
  statusBadgeStyle = { backgroundColor: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)' };
  statusBadgeTextColor = isLight ? '#B45309' : '#FBBF24';
} else if (shiftStatus.includes('COMPLETED') || shiftStatus.includes('PRESENT')) {
  shiftStatus = 'COMPLETED';
  statusBadgeStyle = { backgroundColor: isLight ? '#ECFDF5' : 'rgba(52, 211, 153, 0.15)' };
  statusBadgeTextColor = isLight ? '#059669' : '#34D399';
} else { 
  shiftStatus = 'SCHEDULED'; 
}

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
            <TouchableOpacity
  style={[styles.btnPillPrimary, !finalCanClockIn && styles.btnDisabled]}
  onPress={() => {
    if (!finalCanClockIn) {
      if (!todaySchedule) return Alert.alert('No Schedule', 'No active shift was found for today.');
      if (attendanceStatus.todayRecord?.time_in && attendanceStatus.todayRecord.time_in !== '--:--') {
        return Alert.alert('Already Clocked In', 'You have already clocked in for this shift.');
      }
      return Alert.alert('Clock-In Unavailable', 'This shift is no longer open for clock-in.');
    }
    handleClockIn();
  }}
  activeOpacity={0.85}
>
              <Clock size={18} color={!finalCanClockIn ? (isLight ? "#94A3B8" : colors.textSecondary) : (isLight ? "#FFFFFF" : colors.buttonText)} strokeWidth={2} />
              <Text style={[styles.btnPillPrimaryText, !finalCanClockIn && styles.btnDisabledText]}>CLOCK-IN</Text>
            </TouchableOpacity>

            <TouchableOpacity
  style={[styles.btnPillOutline, !canClockOutNow && styles.btnDisabledOutline]}
  onPress={() => {
    if (!canClockOutNow) {
      if (isPendingCorrection) return Alert.alert('Pending Review', 'Your correction request is being reviewed by HR.');
      if (isLeavePending)      return Alert.alert('Leave Pending', 'Your leave request for today is still pending.');
      if (isAppealPending)     return Alert.alert('Appeal Pending', 'Your attendance appeal is being reviewed.');

      switch (attendanceStatus.clockOutReason) {
        case 'too-early':
          return Alert.alert(
            'Too Early',
            `Clock-out opens at ${formatTo12H(attendanceStatus.earlyOpenStr)} ` +
            `(${EARLY_GRACE_MINUTES} minutes before your shift ends at ${formatTo12H(todaySchedule.end_time)}).`
          );
        case 'grace-expired':
          return Alert.alert(
            'Grace Expired',
            `The ${LATE_GRACE_MINUTES}-minute grace window ended at ${formatTo12H(attendanceStatus.graceEndStr)}. ` +
            `Please file an Attendance Correction for this shift.`
          );
        case 'not-clocked-in':
          return Alert.alert('Not Clocked In', 'You have not clocked in yet for this shift. Please clock in first.');
        case 'already-clocked-out':
          return Alert.alert('Already Clocked Out', 'Your clock-out has already been recorded for this shift.');
        case 'no-schedule':
          return Alert.alert('No Schedule', 'No active shift was found for today.');
        default:
          return;
      }
    }
    handleClockOut();
  }}
  activeOpacity={0.85}
>
  <Clock
    size={18}
    color={!canClockOutNow ? (isLight ? "#94A3B8" : colors.textSecondary) : (isLight ? "#0F172A" : colors.textPrimary)}
    strokeWidth={2}
  />
  <Text style={[styles.btnPillOutlineText, !canClockOutNow && styles.btnDisabledText]}>
    {isPendingCorrection
      ? 'PENDING REVIEW'
      : isLeavePending
        ? 'LEAVE PENDING'
        : isAppealPending
          ? 'APPEAL PENDING'
          : attendanceStatus.clockOutReason === 'grace-expired'
            ? 'GRACE EXPIRED'
            : attendanceStatus.clockOutReason === 'already-clocked-out'
              ? 'CLOCKED OUT'
              : 'CLOCK-OUT'}
  </Text>
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

          <TouchableOpacity 
            style={styles.attendanceHistoryCard} 
            onPress={() => navigation.navigate('AttendanceHistory')} 
            activeOpacity={0.8}
          >
            <View style={styles.attendanceHistoryLeft}>
              <View style={[styles.moduleIconWrapper, { backgroundColor: isLight ? '#F0FDFA' : colors.iconBg, borderColor: isLight ? '#CCFBF1' : colors.border }]}>
                <Clock size={20} color={isLight ? "#0D9488" : colors.primary} strokeWidth={2} />
              </View>
              <View>
                <Text style={styles.attendanceHistoryTitle}>Attendance History</Text>
              </View>
            </View>
            <ArrowUpRight size={18} color={isLight ? "#94A3B8" : colors.textSecondary} />
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={showNotificationsModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.notifModal}>
              <View style={styles.schedModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Bell size={18} color={isLight ? "#0D9488" : colors.primary} />
                  <Text style={styles.schedModalTitle}>Request Notifications</Text>
                </View>
                <TouchableOpacity onPress={() => setShowNotificationsModal(false)}><X size={22} color={colors.textSecondary} /></TouchableOpacity>
              </View>

              {loadingNotifications ? (
                <ActivityIndicator size="small" color="#0D9488" style={{ paddingVertical: 20 }} />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 8, maxHeight: 380 }}>
                  {notifications.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                      <Inbox size={36} color={colors.textSecondary} opacity={0.5} />
                      <Text style={styles.emptyStateText}>No request updates found.</Text>
                    </View>
                  ) : (
                    notifications.map(item => (
                      <View key={item.id} style={styles.notifCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <Text style={styles.notifTitle}>{item.title}</Text>
                          <View style={item.status === 'approved' ? styles.badgeSuccess : styles.badgeDanger}>
                            <Text style={item.status === 'approved' ? styles.badgeTextSuccess : styles.badgeTextDanger}>
                              {item.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.notifRemarks}>{item.remarks}</Text>
                        <Text style={styles.notifDate}>{formatNotificationDate(item.date)}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}

              <TouchableOpacity style={styles.btnCloseModal} onPress={() => setShowNotificationsModal(false)}>
                <Text style={{ fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary, fontSize: 13 }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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
  
  userHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  userName: { fontFamily: 'Inter_18pt-Bold', fontSize: 26, color: isLight ? '#0F172A' : colors.textPrimary, lineHeight: 32, flex: 1, marginRight: 10 },
  notificationBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: isLight ? '#FFFFFF' : colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, position: 'relative' },
  notificationBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter_18pt-Bold' },

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
  statusMissed: { backgroundColor: isLight ? '#ECFDF5' : 'rgba(52, 211, 153, 0.15)' },
  actionContainer: { flexDirection: 'row', gap: 14, marginBottom: 32 },
  btnPillPrimary: { flex: 1, flexDirection: 'row', backgroundColor: isLight ? '#0F172A' : colors.buttonBg, paddingVertical: 18, borderRadius: 30, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPillPrimaryText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText, fontSize: 14, letterSpacing: 0.5 },
  btnPillOutline: { flex: 1, flexDirection: 'row', backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, paddingVertical: 18, borderRadius: 30, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPillOutlineText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary, fontSize: 14, letterSpacing: 0.5 },
  btnDisabled: { backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, elevation: 0, shadowOpacity: 0 },
  btnDisabledOutline: { borderColor: isLight ? '#F1F5F9' : colors.border, backgroundColor: isLight ? '#F8FAFC' : colors.background, elevation: 0, shadowOpacity: 0 },
  btnDisabledText: { color: isLight ? '#94A3B8' : colors.textSecondary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  sectionTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary, flexShrink: 1 },
  eyeIconBtn: { padding: 4, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, borderRadius: 8, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  monthCycleInput: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#CBD5E1' : colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 120, textAlign: 'center' },
  statsScroll: { flexDirection: 'row', marginBottom: 32 },
  statCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 16, width: 110, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, alignItems: 'center' },
  statIconWrapper: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statValue: { fontFamily: 'Inter_18pt-Bold', fontSize: 24, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 4 },
  statLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 10, color: isLight ? '#64748B' : colors.textSecondary, letterSpacing: 1 },
  
  modulesGrid: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  moduleCard: { flex: 1, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, height: 130, justifyContent: 'space-between' },
  moduleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  moduleIconWrapper: { width: 44, height: 44, borderRadius: 22, backgroundColor: isLight ? '#F8FAFC' : colors.iconBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  moduleText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary, lineHeight: 20 },
  
  attendanceHistoryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginBottom: 24 },
  attendanceHistoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  attendanceHistoryTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 2 },
  attendanceHistorySubtitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },

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

  notifModal: { width: '100%', borderRadius: 24, padding: 22, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  notifCard: { backgroundColor: isLight ? '#F8FAFC' : colors.background, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  notifTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary, flex: 1, marginRight: 8 },
  notifRemarks: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#475569' : colors.textSecondary, marginBottom: 6 },
  notifDate: { fontFamily: 'Inter_18pt-Medium', fontSize: 10, color: isLight ? '#94A3B8' : colors.textSecondary },
  badgeSuccess: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeTextSuccess: { color: '#059669', fontSize: 9, fontFamily: 'Inter_18pt-Bold' },
  badgeDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeTextDanger: { color: '#DC2626', fontSize: 9, fontFamily: 'Inter_18pt-Bold' }
});