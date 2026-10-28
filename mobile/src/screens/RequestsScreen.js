// src/screens/RequestsScreen.js
import React, { useState, useContext, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image, Modal as RNModal, StatusBar, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { API_URL } from './api';
import { Upload, X, Calendar as CalendarIcon, Clock, ArrowLeft } from 'lucide-react-native';

let FileSystem;
try {
  FileSystem = require('expo-file-system/legacy');
} catch (e) {
  FileSystem = require('expo-file-system');
}

const uploadRequestWithFile = async (url, token, fieldName, fileObj, parameters = {}) => {
  if (!fileObj) throw new Error('Please attach a file before submitting this request.');

  const resolvedFile = typeof fileObj === 'string' ? { uri: fileObj, name: 'attachment.jpg' } : fileObj;
  const fileUri = resolvedFile?.uri;
  if (!fileUri) {
    throw new Error('The selected file is no longer available. Please attach it again.');
  }

  const filename = resolvedFile?.name || fileUri.split('/').pop() || 'attachment.jpg';
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const mimeType = resolvedFile?.mimeType || {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }[ext] || 'application/octet-stream';

  const normalizedParams = Object.entries(parameters || {})
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .reduce((acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    }, {});

  const uploadResult = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName,
    mimeType,
    headers: {
      Authorization: `Bearer ${token || ''}`,
      Accept: 'application/json',
    },
    parameters: normalizedParams,
  });

  let result;
  try {
    result = JSON.parse(uploadResult?.body || '{}');
  } catch {
    result = { success: false, message: uploadResult?.body || 'Server upload error.' };
  }

  return {
    ...result,
    ok: uploadResult && uploadResult.status >= 200 && uploadResult.status < 300,
  };
};

const formatTo12Hour = (timeStr) => {
  if (!timeStr || timeStr === '--:--' || timeStr === '00:00:00' || timeStr === 'null' || timeStr == null) return '';
  let cleanStr = String(timeStr).trim();
  if (cleanStr.includes('T')) {
    const tParts = cleanStr.split('T');
    cleanStr = tParts.length > 1 ? tParts[1] : tParts[0];
    cleanStr = cleanStr.split('Z')[0].split('+')[0];
  }
  const clean = cleanStr.split('.')[0].replace(',', ':');
  const parts = clean.split(':');
  if (parts.length < 2) return timeStr;

  let hours = parseInt(parts[0], 10);
  let minutes = parseInt(parts[1], 10);
  if (isNaN(hours)) return timeStr;
  if (isNaN(minutes)) minutes = 0;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const formatTimeForDB = (timeStr) => {
  if (!timeStr) return null;
  let cleanStr = String(timeStr).trim();
  if (cleanStr.includes('T')) {
    const tParts = cleanStr.split('T');
    cleanStr = tParts.length > 1 ? tParts[1] : tParts[0];
    cleanStr = cleanStr.split('Z')[0].split('+')[0];
  }
  const cleaned = cleanStr.split('.')[0];
  const parts = cleaned.split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].substring(0, 2).padStart(2, '0');
    return `${h}:${m}:00`;
  }
  return timeStr;
};

const getCorrectionWindow = (type, start, end) => {
  const toMin = (t) => {
    if (!t) return null;
    const [h, m] = String(t).substring(0, 5).split(':').map(Number);
    return isNaN(h) || isNaN(m) ? null : h * 60 + m;
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return null;
  if (type === 'clock_in')  return { min: s - 120, max: e,        label: '2h before shift start up to shift end' };
  if (type === 'clock_out') return { min: s,       max: e + 240,  label: 'shift start up to 4h after shift end' };
  if (type === 'early_out') return { min: s,       max: e - 1,    label: 'inside the shift, strictly before end' };
  return null;
};

const getPHNowString = () => {
  const now = new Date();
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' };
  return now.toLocaleDateString('en-CA', options);
};

// ✅ FIX M1 — Helper for computing a date offset (in days) in PH timezone
const getPHDateOffset = (daysOffset) => {
  const now = new Date();
  now.setDate(now.getDate() + daysOffset);
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' };
  return now.toLocaleDateString('en-CA', options);
};

const getPHDateOffsetIn = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};

const parseServerResponse = async (response) => {
  if (!response) {
    return { success: false, message: 'No response received from server.' };
  }
  try {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: response.ok, message: text || response.statusText || 'Server error' };
    }
  } catch (err) {
    return { success: false, message: err.message || 'Failed to parse response.' };
  }
};

export default function RequestsScreen({ navigation, route }) {
  const prefill = route.params || {};
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [activeTab, setActiveTab] = useState(prefill.prefillTab || 'leave');

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerMode, setTimePickerMode] = useState('');
  const [tempDate, setTempDate] = useState(new Date());
  const [scheduleForOTDate, setScheduleForOTDate] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // --- LEAVE STATE ---
  const [leaveStep, setLeaveStep] = useState(1);
  const [leaveBreakdown, setLeaveBreakdown] = useState([]);
  const [leaveDateFrom, setLeaveDateFrom] = useState('');
  const [leaveDateTo, setLeaveDateTo] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [leaveType, setLeaveType] = useState('Vacation');
  const [availableLeaveTypes, setAvailableLeaveTypes] = useState([
    { id: 1, name: 'Vacation' },
    { id: 2, name: 'Sick' },
    { id: 3, name: 'Emergency' },
    { id: 4, name: 'Birthday' },
    { id: 5, name: 'PTO' },
    { id: 6, name: 'Compensatory Paid Off' }
  ]);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveImage, setLeaveImage] = useState(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [showLeaveCalendarFrom, setShowLeaveCalendarFrom] = useState(false);
  const [showLeaveCalendarTo, setShowLeaveCalendarTo] = useState(false);
  const [showBalancesModal, setShowBalancesModal] = useState(false);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // --- APPEAL STATE ---
  const [appealStep, setAppealStep] = useState(1);
  const [appealDate, setAppealDate] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [appealImage, setAppealImage] = useState(null);
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [showAppealCalendar, setShowAppealCalendar] = useState(false);
  const [appealTimeIn, setAppealTimeIn] = useState('');
  const [appealTimeOut, setAppealTimeOut] = useState('');

  // --- CORRECTION STATE ---
  const [correctionStep, setCorrectionStep] = useState(1);
  const [correctionDate, setCorrectionDate] = useState(prefill.prefillDate || '');
  const [correctionType, setCorrectionType] = useState(prefill.prefillType || 'clock_in');
  const [correctionTime, setCorrectionTime] = useState(prefill.prefillTime || '');
  const [correctionReason, setCorrectionReason] = useState(prefill.prefillReason || '');
  const [correctionScheduleId, setCorrectionScheduleId] = useState(prefill.prefillScheduleId || null);
  const [correctionAttachment, setCorrectionAttachment] = useState(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [showCorrectionCalendar, setShowCorrectionCalendar] = useState(false);
  const [scheduleForCorrection, setScheduleForCorrection] = useState(null); 
  const [scheduleForAppeal,     setScheduleForAppeal]     = useState(null)

  // --- OVERTIME STATE ---
  const [overtimeStep, setOvertimeStep] = useState(1);
  const [overtimeDate, setOvertimeDate] = useState('');
  const [overtimeStart, setOvertimeStart] = useState('');
  const [overtimeEnd, setOvertimeEnd] = useState('');
  const [overtimeReason, setOvertimeReason] = useState('');
  const [overtimeImage, setOvertimeImage] = useState(null);
  const [submittingOvertime, setSubmittingOvertime] = useState(false);
  const [showOvertimeCalendar, setShowOvertimeCalendar] = useState(false);
  const [overtimeType, setOvertimeType] = useState('Regular Overtime');
  const [overtimeTiming, setOvertimeTiming] = useState('Normal OT');
  const [myOvertimeRequests, setMyOvertimeRequests] = useState([]);

  const todayStr = getPHNowString();
  
  const thirtyDaysAgoStr = getPHDateOffset(-30);
  const minDateForLeave = /emergency|sick/i.test(leaveType) ? thirtyDaysAgoStr : todayStr;

  const loadInitialLeaveData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userId = await AsyncStorage.getItem('user_id');
      const year = new Date().getFullYear();

      const resTypes = await fetch(`${API_URL}/leave-types`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const dataTypes = await resTypes.json();
      if (resTypes.ok && Array.isArray(dataTypes) && dataTypes.length > 0) {
        setAvailableLeaveTypes(dataTypes);
        
        setLeaveType(prev =>
          dataTypes.some(t => t.name === prev) ? prev : dataTypes[0].name
        );
      }

      if (userId) {
        const resBal = await fetch(`${API_URL}/leave-balances/${userId}?year=${year}`, {
          headers: { Authorization: `Bearer ${token || ''}` }
        });
        const dataBal = await resBal.json();
        if (resBal.ok && Array.isArray(dataBal)) {
          setLeaveBalances(dataBal);
        }
      }
    } catch (err) {
      console.log('Error loading initial leave data:', err);
    }
  }, []); 


  const fetchMyPendingRequests = async (kind) => {
  // kind = 'corrections' | 'appeals'
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const empId = await AsyncStorage.getItem('employee_id');
    if (!empId) return [];
    const url = kind === 'corrections'
      ? `${API_URL}/attendance/corrections/user/${empId}`
      : `${API_URL}/attendance-appeals/user/${empId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
};

  const loadScheduleForDate = async (date, setter) => {
  if (!date) { setter(null); return; }
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const userStr = await AsyncStorage.getItem('user');
    let empId = null;
    if (userStr) { try { empId = JSON.parse(userStr).employee_id; } catch {} }
    if (!empId) return setter(null);

    const res  = await fetch(`${API_URL}/schedules/${empId}`, {
      headers: { Authorization: `Bearer ${token || ''}` }
    });
    const data = await res.json();
    const sched = Array.isArray(data)
      ? data.find(s => String(s.date).split('T')[0] === date)
      : null;
    setter(sched);
  } catch { setter(null); }
};


    useEffect(() => {
        const fetchScheduleForOT = async () => {
      if (!overtimeDate) {
        setScheduleForOTDate(null);
        return;
      }
      setLoadingSchedule(true);
      try {
        const token = await AsyncStorage.getItem('auth_token');
        const userStr = await AsyncStorage.getItem('user');
        let empId = null;
        if (userStr) {
          try { empId = JSON.parse(userStr).employee_id; } catch(e) {}
        }
        
        if (!empId) {
           setScheduleForOTDate(null);
           return;
        }

        const res = await fetch(`${API_URL}/schedules/${empId}`, {
          headers: { Authorization: `Bearer ${token || ''}` }
        });
        const data = await res.json();
        const sched = Array.isArray(data) ? data.find(s => String(s.date).split('T')[0] === overtimeDate) : null;
        setScheduleForOTDate(sched);
      } catch (err) {
        console.error("Failed to fetch schedule for OT:", err);
        setScheduleForOTDate(null);
      } finally {
        setLoadingSchedule(false);
      }
    };
    fetchScheduleForOT();
  }, [overtimeDate]);

    
  useEffect(() => { 
    loadScheduleForDate(correctionDate, setScheduleForCorrection); 
  }, [correctionDate]);

  useEffect(() => { 
    loadScheduleForDate(appealDate, setScheduleForAppeal);     
  }, [appealDate]);

  

  useEffect(() => {
    loadInitialLeaveData();
  }, [loadInitialLeaveData]);

  const currentSelectedBalance = useMemo(() => {
    const record = leaveBalances.find(b =>
      b.leave_type?.trim().toLowerCase() === leaveType?.trim().toLowerCase()
    );
    return record ? parseFloat(record.remaining_days) : 0;
  }, [leaveBalances, leaveType]);

  const loadMyOvertimeRequests = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/overtime-requests`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await res.json();
      setMyOvertimeRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      setMyOvertimeRequests([]);
    }
  };

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setLeaveStep(1);
    setAppealStep(1);
    setCorrectionStep(1);
    setOvertimeStep(1);
    if (tab === 'leave') loadInitialLeaveData();
    if (tab === 'overtime') loadMyOvertimeRequests();
  };

  const toMinutes = (hhmm) => {
    if (!hhmm || hhmm.length < 5) return null;
    const [h, m] = hhmm.substring(0, 5).split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  const handleBackPress = () => {
    try {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('Main');
    } catch (err) {
      navigation.navigate('Main');
    }
  };

  const handleTimeChange = (event, selectedDate) => {
    setShowTimePicker(false);
    if (selectedDate) {
      const hours = String(selectedDate.getHours()).padStart(2, '0');
      const minutes = String(selectedDate.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      if (timePickerMode === 'appealIn') setAppealTimeIn(timeString);
      if (timePickerMode === 'appealOut') setAppealTimeOut(timeString);
      if (timePickerMode === 'correctionTime') setCorrectionTime(timeString);
      if (timePickerMode === 'overtimeStart') setOvertimeStart(timeString);
      if (timePickerMode === 'overtimeEnd') setOvertimeEnd(timeString);
    }
  };

    const fetchLeaveBalances = async () => {
    setLoadingBalances(true);
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) { Alert.alert('Error', 'User account not found.'); setLoadingBalances(false); return; }
    try {
      const token = await AsyncStorage.getItem('auth_token'); // ✅ ADD THIS
      const year = new Date().getFullYear();
      
      
      const res = await fetch(`${API_URL}/leave-balances/${userId}?year=${year}`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setLeaveBalances(data);
        setShowBalancesModal(true);
      } else {
        Alert.alert('Error', data.message || 'Failed to fetch leave balances.');
      }
    } catch (err) {
      Alert.alert('Network Error', 'Could not connect to server.');
    } finally { setLoadingBalances(false); }
  };

  const pickDocument = async (setFn, currentFile = null) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true
      });

     
      if (result.canceled) {
        
        if (currentFile) {
          Alert.alert(
            'No New File Selected',
            `Your previously attached file "${currentFile.name || 'attachment'}" is still active.`,
            [{ text: 'OK' }]
          );
        }
        return;
      }

      
      if (!result.assets || result.assets.length === 0) {
        Alert.alert(
          'No File Selected',
          'The picker returned no file. Please try again.'
        );
        return;
      }

      const file = result.assets[0];

     
      if (file.size > 5 * 1024 * 1024) {
        Alert.alert(
          'File Too Large',
          'Maximum file size is 5MB. Please select a smaller file.'
        );
        return;
      }

      setFn(file);
    } catch (err) {
      
      console.error('Document picker error:', err);
      Alert.alert(
        'Upload Error',
        'Could not open the file picker. Please check that the app has permission to access your files, then try again.'
      );
    }
  };

  // ============================================================
  // LEAVE
  // ============================================================
    const handleNextLeave = async () => {
    if (!leaveDateFrom) { Alert.alert('Validation Error', 'Please select a start date.'); return; }
    if (isRange && !leaveDateTo) { Alert.alert('Validation Error', 'Please select an end date.'); return; }

    const trimmed = leaveReason.trim();
    if (!trimmed || trimmed.length < 10) {
      Alert.alert('Validation Error', 'Please provide a detailed reason (minimum 10 characters).');
      return;
    }
    // ✅ FIX M2 — Reason max length (matches backend 500-char cap)
    if (trimmed.length > 500) {
      Alert.alert('Validation Error', 'Reason is too long (maximum 500 characters).');
      return;
    }

    if (!leaveImage) { Alert.alert('Validation Error', 'An attachment (Image/PDF/DOC) is strictly required.'); return; }
    if (isRange && leaveDateTo < leaveDateFrom) {
      Alert.alert('Invalid Date Range', 'End date cannot be earlier than start date.');
      return;
    }

    if (currentSelectedBalance <= 0) {
      Alert.alert(
        'Insufficient Balance',
        `You currently have 0.00 days remaining for "${leaveType}". You cannot submit a leave application without available balance.`
      );
      return;
    }

    const start = new Date(leaveDateFrom);
    const end = isRange ? new Date(leaveDateTo) : start;
    const dates = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // 🚨 FIX: Prevent timezone shift by using local 'en-CA' format (YYYY-MM-DD)
      dates.push({
        date: d.toLocaleDateString('en-CA'), 
        duration: 'Whole Day',
        isPaid: true 
      });
    }

    // 🚨 FIX: Smart balance check (Allows 1.5 days to cover a 2-day range)
    let totalCost = dates.length;
    if (totalCost > currentSelectedBalance) {
      if ((totalCost - 0.5) <= currentSelectedBalance) {
        // They are short exactly 0.5 days, so auto-convert the last day to Half Day
        dates[dates.length - 1].duration = '1st Half';
        totalCost -= 0.5;
      } else {
        Alert.alert(
          'Insufficient Balance',
          `You are requesting ${dates.length} day(s), but only have ${currentSelectedBalance.toFixed(2)} day(s) remaining for "${leaveType}".`
        );
        return;
      }
    }

    // Recalculate the "isPaid" flag based on the corrected durations
    let runningBalance = currentSelectedBalance;
    dates.forEach(item => {
      const cost = item.duration === 'Whole Day' ? 1.0 : 0.5;
      item.isPaid = runningBalance >= cost;
      runningBalance -= cost;
    });

    // ── NEW: Pre-check for existing leaves on any selected date ──
    // Surfaces conflicts BEFORE the user proceeds to steps 2 and 3.
    // Lists every conflicting date at once (not just the first one).
    // Fails open — if the network call fails, the backend still holds the guard.
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userStr = await AsyncStorage.getItem('user');
      let empId = null;
      if (userStr) { try { empId = JSON.parse(userStr).employee_id; } catch {} }

      if (empId) {
        const res = await fetch(`${API_URL}/leave-requests/user/${empId}`, {
          headers: { Authorization: `Bearer ${token || ''}` },
        });
        const allLeaves = await res.json();

        const conflicts = (Array.isArray(allLeaves) ? allLeaves : []).filter(lv => {
          const st = String(lv.status || '').toLowerCase();
          if (st !== 'pending' && st !== 'approved') return false;
          const lvDate = String(lv.request_date || '').substring(0, 10);
          return dates.some(d => d.date === lvDate);
        });

        if (conflicts.length > 0) {
          const dateList = conflicts.map(c => `• ${c.request_date} (${c.status})`).join('\n');
          Alert.alert(
            'Existing Leave Found',
            `You already have ${conflicts.length} leave on the selected date(s):\n\n${dateList}\n\nPlease exclude these dates before submitting, or contact HR if you need to modify the existing leave.`
          );
          return;
        }
      }
    } catch (e) {
      
      console.warn('Leave pre-check failed (non-blocking):', e);
    }
    // ─────────────────────────────────────────────────────────────

    setLeaveBreakdown(dates);
    setLeaveStep(2);
  };

  const updateBreakdownDuration = (index, value) => {
    const newBreakdown = leaveBreakdown.map((item, i) =>
  i === index ? { ...item, duration: value } : item
);

    let totalCost = 0;
    newBreakdown.forEach(item => {
      totalCost += item.duration === 'Whole Day' ? 1.0 : 0.5;
    });

    if (totalCost > currentSelectedBalance) {
      Alert.alert(
        'Quota Exceeded',
        `The selected durations require ${totalCost} day(s), which exceeds your remaining balance of ${currentSelectedBalance} day(s) for "${leaveType}".`
      );
      return;
    }

    let runningBalance = currentSelectedBalance;
    newBreakdown.forEach(item => {
      const cost = item.duration === 'Whole Day' ? 1.0 : 0.5;
      item.isPaid = runningBalance >= cost;
      runningBalance -= cost;
    });

    setLeaveBreakdown(newBreakdown);
  };

  const handleSubmitLeave = async () => {
    let totalRequired = 0;
    leaveBreakdown.forEach(item => {
      totalRequired += item.duration === 'Whole Day' ? 1.0 : 0.5;
    });

    if (totalRequired > currentSelectedBalance) {
      Alert.alert('Submission Error', `You do not have sufficient "${leaveType}" balance to complete this request.`);
      return;
    }

    setSubmittingLeave(true);
  try {
    const token = await AsyncStorage.getItem('auth_token');
    
    // 🚨 NEW: Format the array for the backend
    const requestsPayload = leaveBreakdown.map(item => ({
      date: item.date,
      duration: item.duration
    }));

    // 🚨 Send ONE request instead of looping
    const result = await uploadRequestWithFile(`${API_URL}/leave-requests`, token, 'image', leaveImage, {
      type: leaveType,
      reason: leaveReason.trim(),
      requests: JSON.stringify(requestsPayload), // Pass the JSON string
      is_paid: '1',
    });

    if (result.ok && result.success) {
      Alert.alert('Success', 'Leave Application submitted successfully!');
      setLeaveDateFrom('');
      setLeaveDateTo('');
      setLeaveReason('');
      setLeaveImage(null);
      setIsRange(false);
      setLeaveStep(1);
      loadInitialLeaveData();
    } else {
      Alert.alert('Submission Error', result.message || 'Failed to submit request.');
    }
  } catch (err) {
    console.error('Submit Leave Error:', err);
    Alert.alert('Submission Error', err.message || 'Failed to connect to server.');
  } finally {
    setSubmittingLeave(false);
  }
};

  // ============================================================
  // APPEAL
  // ============================================================
     const handleNextAppeal = async () => {  
    if (!appealDate) { Alert.alert('Validation Error', 'Please select a date for your appeal.'); return; }

    if (appealDate > todayStr) {
      Alert.alert('Validation Error', 'Appeals cannot be filed for future dates.');
      return;
    }
    if (appealDate < thirtyDaysAgoStr) {
      Alert.alert('Validation Error', 'Appeals can only be filed for the last 30 days.');
      return;
    }

    if (!scheduleForAppeal) {
      Alert.alert('No Schedule', 'You have no scheduled shift on this date, so an appeal cannot be filed.');
      return;
    }

    const trimmed = appealReason.trim();
    if (!trimmed || trimmed.length < 10) {
      Alert.alert('Validation Error', 'Please provide a detailed reason (minimum 10 characters).');
      return;
    }
    if (trimmed.length > 500) {
      Alert.alert('Validation Error', 'Reason is too long (maximum 500 characters).');
      return;
    }

    if (!appealImage) { Alert.alert('Validation Error', 'An attachment or proof is strictly required.'); return; }

    
    if (!appealTimeIn && !appealTimeOut) {
      Alert.alert(
        'Missing Time',
        'Please provide at least a Time In or a Time Out so HR knows what to correct.'
      );
      return;
    }

    
    if (appealTimeIn && appealTimeOut) {
      const inMin = toMinutes(appealTimeIn);
      const outMin = toMinutes(appealTimeOut);
      if (inMin !== null && outMin !== null && outMin <= inMin) {
        Alert.alert('Validation Error', 'Time Out must be later than Time In.');
        return;
      }
    }
    const pending = await fetchMyPendingRequests('appeals');
    const already = pending.find(p =>
      String(p.status).toLowerCase() === 'pending' &&
      String(p.attendance_date || p.date).substring(0,10) === appealDate
    );
    if (already) {
      Alert.alert(
        'Already Pending',
        'You already have a pending appeal for this date. Please wait for HR to review it.'
      );
      return;
    }

    setAppealStep(2);
  };

  const handleSubmitAppeal = async () => {
    setSubmittingAppeal(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');

      const result = await uploadRequestWithFile(`${API_URL}/attendance-appeals`, token, 'image', appealImage, {
        date: appealDate,
        reason: appealReason.trim(),
        schedule_id: prefill.prefillScheduleId || '',
        time_in: appealTimeIn ? formatTimeForDB(appealTimeIn) : '',
        time_out: appealTimeOut ? formatTimeForDB(appealTimeOut) : '',
      });
      if (result.ok && (result.success || result.success === undefined)) {
        Alert.alert('Success', 'Attendance appeal submitted successfully.');
        setAppealDate('');
        setAppealTimeIn('');
        setAppealTimeOut('');
        setAppealReason('');
        setAppealImage(null);
        setAppealStep(1);
      } else {
        Alert.alert('Submission Error', result.message || result.error || 'Failed to submit appeal.');
      }
    } catch (error) {
      Alert.alert('Submission Error', error.message || 'Server connection failed.');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  // ============================================================
  // CORRECTION
  // ============================================================
    const handleNextCorrection = async () => {  // ✅ Added async here
    if (!correctionDate) { Alert.alert('Validation Error', 'Please select a date.'); return; }

    if (correctionDate > todayStr) {
      Alert.alert('Validation Error', 'Corrections cannot be filed for future dates.');
      return;
    }
    if (correctionDate < thirtyDaysAgoStr) {
      Alert.alert('Validation Error', 'Corrections can only be filed for the last 30 days.');
      return;
    }

    if (!scheduleForCorrection) {
      Alert.alert('No Schedule', 'You have no scheduled shift on this date, so a correction cannot be filed.');
      return;
    }

    if (!correctionTime) { Alert.alert('Validation Error', 'Please select a correction time.'); return; }

    const trimmed = correctionReason.trim();
    if (!trimmed || trimmed.length < 5) {
      Alert.alert('Validation Error', 'Please provide a valid reason (minimum 5 characters).');
      return;
    }
    if (trimmed.length > 500) {
      Alert.alert('Validation Error', 'Reason is too long (maximum 500 characters).');
      return;
    }

    if (!correctionAttachment) {
      Alert.alert('Validation Error', 'An attachment (Image/PDF/DOC) is strictly required.');
      return;
    }

    const shiftStart = scheduleForCorrection.start_time;
    const shiftEnd   = scheduleForCorrection.end_time;
    const window     = getCorrectionWindow(correctionType, shiftStart, shiftEnd);

    if (window) {
      const [h, m] = correctionTime.substring(0, 5).split(':').map(Number);
      const reqMin = h * 60 + m;

      if (reqMin < window.min || reqMin > window.max) {
        Alert.alert(
          'Invalid Time',
          `For ${correctionType.replace('_', ' ')}, the time must be within the shift window (${window.label}).\n\nYour shift: ${formatTo12Hour(shiftStart)} – ${formatTo12Hour(shiftEnd)}`
        );
        return;
      }
    }

    // ✅ NEW: H2 - Check for duplicate pending request
    const pending = await fetchMyPendingRequests('corrections');
    const already = pending.find(p =>
      String(p.status).toLowerCase() === 'pending' &&
      String(p.attendance_date || p.date).substring(0,10) === correctionDate
    );
    if (already) {
      Alert.alert(
        'Already Pending',
        'You already have a pending correction for this date. Please wait for HR to review it.'
      );
      return;
    }

    setCorrectionStep(2);
  };

  

  const handleSubmitCorrection = async () => {
    setSubmittingCorrection(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      let employeeId = await AsyncStorage.getItem('employee_id');
      if (!employeeId) {
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
          try { employeeId = JSON.parse(userStr).employee_id; } catch (e) {}
        }
      }
      if (!employeeId) {
        Alert.alert('Authentication Error', 'Employee ID not found.');
        setSubmittingCorrection(false);
        return;
      }

      const dbType = correctionType === 'early_out' ? 'clock_out' : correctionType;
      const finalReason = correctionType === 'early_out'
        ? `[Early Departure] ${correctionReason.trim()}`
        : correctionReason.trim();
      const formattedTime = formatTimeForDB(correctionTime);

      const res = await uploadRequestWithFile(`${API_URL}/attendance/correction-request`, token, 'attachment', correctionAttachment, {
  employee_id: employeeId,
  date: correctionDate,
  type: correctionType,
  time: formattedTime,
  reason: finalReason,
  schedule_id: correctionScheduleId || '',
});

      if (res.ok && (res.success || res.success === undefined)) {
        Alert.alert('Success', res.message || 'Correction request submitted.');
        setCorrectionDate(''); setCorrectionTime(''); setCorrectionReason(''); setCorrectionAttachment(null);
        setCorrectionType('clock_in'); setCorrectionScheduleId(null); setCorrectionStep(1);
        if (navigation.setParams) {
          navigation.setParams({
            prefillTab: undefined, prefillDate: undefined, prefillType: undefined,
            prefillTime: undefined, prefillReason: undefined, prefillScheduleId: undefined
          });
        }
        setActiveTab('leave');
      } else {
        Alert.alert('Submission Error', res?.message || res?.error || 'Failed to submit correction.');
      }
    } catch (err) {
      Alert.alert('Submission Error', err?.message || 'Connection failed.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // ============================================================
  // OVERTIME
  // ============================================================
    const handleNextOvertime = () => {
    if (!overtimeDate) {
      Alert.alert('Validation Error', 'Please select a date.');
      return;
    }
    if (!overtimeStart || !overtimeEnd) {
      Alert.alert('Validation Error', 'Start and end times are required.');
      return;
    }

    const startMin = toMinutes(overtimeStart);
    const endMin = toMinutes(overtimeEnd);
    if (startMin === null || endMin === null) {
      Alert.alert('Validation Error', 'Invalid time format. Please re-select the times.');
      return;
    }
    if (startMin >= endMin) {
      Alert.alert('Validation Error', 'Overtime end time must be strictly after the start time.');
      return;
    }

    const duration = endMin - startMin;
    if (duration < 30) {
      Alert.alert('Validation Error', 'Minimum overtime duration is 30 minutes.');
      return;
    }
    if (duration > 12 * 60) {
      Alert.alert('Validation Error', 'Maximum overtime duration is 12 hours per request.');
      return;
    }

    
    if (overtimeType === 'Compensatory Time Off (CTO)' && duration < 60) {
      Alert.alert('Validation Error', 'CTO conversion requires at least 1 hour (60 minutes) of overtime.');
      return;
    }

    
    if (loadingSchedule) {
  Alert.alert('Please Wait', 'Checking your schedule...');
  return;
}
if (!scheduleForOTDate) {
  Alert.alert('No Schedule Found', 'You do not have a scheduled shift on this date.');
  return;
}


    if (scheduleForOTDate) {
      const shiftStart = toMinutes(scheduleForOTDate.start_time);
      const shiftEnd = toMinutes(scheduleForOTDate.end_time);

      if (overtimeTiming === 'Early OT') {
        
        if (endMin > shiftStart) {
          Alert.alert(
            'Invalid Early OT', 
            `Your shift starts at ${formatTo12Hour(scheduleForOTDate.start_time)}. Early OT must end at or before this time.`
          );
          return;
        }
      } else if (overtimeTiming === 'Normal OT') {
       
        if (startMin < shiftEnd) {
          Alert.alert(
            'Invalid Normal OT', 
            `Your shift ends at ${formatTo12Hour(scheduleForOTDate.end_time)}. Normal OT must start at or after this time.`
          );
          return;
        }
      }
    }

    const trimmed = overtimeReason.trim();
    if (!trimmed || trimmed.length < 5) {
      Alert.alert('Validation Error', 'Please provide a detailed reason (minimum 5 characters).');
      return;
    }
    if (trimmed.length > 500) {
      Alert.alert('Validation Error', 'Reason is too long (maximum 500 characters).');
      return;
    }

    const start5 = overtimeStart.substring(0, 5);
    const end5 = overtimeEnd.substring(0, 5);
    const conflict = myOvertimeRequests.find(r => {
      const st = String(r.status || '').toLowerCase();
      if (st !== 'pending' && st !== 'approved') return false;
      const rDate = String(r.date || '').substring(0, 10);
      if (rDate !== overtimeDate) return false;
      const rStart = String(r.start_time || '').substring(0, 5);
      const rEnd = String(r.end_time || '').substring(0, 5);
      return !(end5 <= rStart || start5 >= rEnd);
    });

    if (conflict) {
      Alert.alert(
        'Overlapping Request',
        `You already have a ${conflict.status} overtime request on ${overtimeDate} from ${formatTo12Hour(conflict.start_time)} to ${formatTo12Hour(conflict.end_time)}.\n\nPlease adjust the time range or cancel the existing request first.`
      );
      return;
    }

    setOvertimeStep(2);
  };

  const handleSubmitOvertime = async () => {
    const start5 = overtimeStart.substring(0, 5);
    const end5 = overtimeEnd.substring(0, 5);
    const conflict = myOvertimeRequests.find(r => {
      const st = String(r.status || '').toLowerCase();
      if (st !== 'pending' && st !== 'approved') return false;
      if (String(r.date || '').substring(0, 10) !== overtimeDate) return false;
      const rStart = String(r.start_time || '').substring(0, 5);
      const rEnd = String(r.end_time || '').substring(0, 5);
      return !(end5 <= rStart || start5 >= rEnd);
    });
    if (conflict) {
      Alert.alert('Overlapping Request', 'A conflicting overtime request already exists for this time slot.');
      return;
    }

    setSubmittingOvertime(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      let response;
      const dbScenarioType = overtimeTiming === 'Early OT' ? 'early_ot' : 'normal_ot';
      const scheduleId = scheduleForOTDate?.id || prefill?.prefillScheduleId || null;

      if (overtimeImage) {
        response = await uploadRequestWithFile(`${API_URL}/overtime-requests`, token, 'attachment', overtimeImage, {
          date: overtimeDate,
          start_time: formatTimeForDB(overtimeStart),
          end_time: formatTimeForDB(overtimeEnd),
          reason: overtimeReason.trim(),
          scenario_type: dbScenarioType,
          overtime_type: overtimeType,
          schedule_id: scheduleId || '',
        });
      } else {
        response = await fetch(`${API_URL}/overtime-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            date: overtimeDate,
            start_time: formatTimeForDB(overtimeStart),
            end_time: formatTimeForDB(overtimeEnd),
            reason: overtimeReason.trim(),
            scenario_type: dbScenarioType,
            overtime_type: overtimeType,
            schedule_id: scheduleId,
          }),
        });
      }

      const result = response?.ok !== undefined ? response : await parseServerResponse(response);
      if (response && result.ok && (result.success || result.success === undefined)) {
        Alert.alert('Success', result.message || 'Overtime request submitted successfully.');
        setOvertimeDate('');
        setOvertimeStart('');
        setOvertimeEnd('');
        setOvertimeReason('');
        setOvertimeImage(null);
        setOvertimeStep(1);
        loadMyOvertimeRequests();
      } else {
        Alert.alert('Submission Error', result.message || result.error || 'Failed to submit overtime request.');
      }
    } catch (err) {
      console.error('Submit Overtime Error:', err);
      Alert.alert('Submission Error', err.message || 'Server connection failed.');
    } finally {
      setSubmittingOvertime(false);
    }
  };

  // ✅ FIX M10 — renderCalendar now accepts maxDate so appeal/correction can
  //              block future dates while still allowing past up to 30 days.
  const renderCalendar = (show, setShow, date, setDate, minDate = todayStr, maxDate = null) => {
    if (!show) return null;
    return (
      <View style={styles.calendarModal}>
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>Select Date (PH)</Text>
          <TouchableOpacity onPress={() => setShow(false)}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Calendar
          onDayPress={(day) => { setDate(day.dateString); setShow(false); }}
          markedDates={{ [date]: { selected: true, selectedColor: '#00897B' } }}
          minDate={minDate}
          maxDate={maxDate || undefined}
          theme={{
            calendarBackground: 'transparent',
            textDayFontFamily: 'Inter_18pt-Medium',
            textMonthFontFamily: 'Inter_18pt-Bold',
            selectedDayBackgroundColor: '#00897B',
            todayTextColor: '#00897B',
            arrowColor: '#00897B',
            monthTextColor: colors.textPrimary,
            dayTextColor: colors.textPrimary
          }}
        />
      </View>
    );
  };

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>

        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <ArrowLeft size={24} color={isLight ? '#0F172A' : colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Requests</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {['leave', 'appeal', 'correction', 'overtime'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.activeTab]}
                onPress={() => handleTabSwitch(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

          {/* ======================================= */}
          {/* LEAVE TAB */}
          {/* ======================================= */}
          {activeTab === 'leave' && (
            <View>
              {leaveStep === 1 && (
                <View>
                  <TouchableOpacity style={styles.historyButton} onPress={() => { setLeaveStep(1); navigation.navigate('LeaveHistory'); }}>
                    <Text style={styles.historyButtonText}>View Leave History</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.balancesButton} onPress={fetchLeaveBalances}>
                    <Text style={styles.balancesButtonText}>View Leave Balances & CTO</Text>
                  </TouchableOpacity>

                  <View style={styles.rangeToggle}>
                    <TouchableOpacity style={[styles.rangeButton, !isRange && styles.rangeButtonActive]} onPress={() => setIsRange(false)}>
                      <Text style={[styles.rangeButtonText, !isRange && styles.rangeButtonTextActive]}>Single Day</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.rangeButton, isRange && styles.rangeButtonActive]} onPress={() => setIsRange(true)}>
                      <Text style={[styles.rangeButtonText, isRange && styles.rangeButtonTextActive]}>Date Range</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>{isRange ? 'From Date' : 'Date'}</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowLeaveCalendarFrom(true)}>
                    <CalendarIcon size={20} color="#00897B" />
                    <Text style={styles.dateText}>{leaveDateFrom || 'Select date'}</Text>
                  </TouchableOpacity>
                  {renderCalendar(showLeaveCalendarFrom, setShowLeaveCalendarFrom, leaveDateFrom, setLeaveDateFrom, minDateForLeave, getPHDateOffsetIn(180))}

                  {isRange && (
                    <>
                      <Text style={styles.label}>To Date</Text>
                      <TouchableOpacity style={styles.datePicker} onPress={() => setShowLeaveCalendarTo(true)}>
                        <CalendarIcon size={20} color="#00897B" />
                        <Text style={styles.dateText}>{leaveDateTo || 'Select date'}</Text>
                      </TouchableOpacity>
                      {renderCalendar(showLeaveCalendarTo, setShowLeaveCalendarTo, leaveDateTo, setLeaveDateTo, leaveDateFrom || minDateForLeave, getPHDateOffsetIn(180) )}
                    </>
                  )}

                  <View style={styles.leaveTypeHeaderRow}>
                    <Text style={[styles.label, { marginVertical: 0 }]}>Leave Type</Text>
                    <Text style={[
                      styles.balanceIndicatorText,
                      { color: currentSelectedBalance > 0 ? '#00897B' : '#EF4444' }
                    ]}>
                      Available: {currentSelectedBalance.toFixed(2)} day(s) left
                    </Text>
                  </View>

                  <View style={styles.typeGroup}>
                    {availableLeaveTypes.map(t => (
                      <TouchableOpacity
                        key={t.id || t.name}
                        style={[styles.typeChip, leaveType === t.name && styles.typeChipActive]}
                        onPress={() => setLeaveType(t.name)}
                      >
                        <Text style={[styles.typeChipText, leaveType === t.name && styles.typeChipTextActive]}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Reason (10–500 characters)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    multiline
                    maxLength={500}
                    placeholder="Explain reason..."
                    placeholderTextColor={colors.textSecondary}
                    value={leaveReason}
                    onChangeText={setLeaveReason}
                  />

                  <Text style={styles.label}>Attachment (Required - PDF, DOC, JPG up to 5MB)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setLeaveImage, leaveImage)}>
                    <Upload size={18} color="#00897B" />
                    <Text style={styles.uploadText}>{leaveImage ? (leaveImage.name || 'File Attached') : 'Upload Proof'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.submitBtn} onPress={handleNextLeave}>
                    <Text style={styles.submitBtnText}>Next: Date Breakdown</Text>
                  </TouchableOpacity>
                </View>
              )}

              {leaveStep === 2 && (
                <View>
                  <Text style={[styles.headerTitle, { marginBottom: 8 }]}>Date Breakdown</Text>
                  <Text style={[styles.subLabel, { marginBottom: 16 }]}>
                    Specify duration for each day. Available '{leaveType}' balance: {currentSelectedBalance.toFixed(2)} day(s).
                  </Text>

                  {leaveBreakdown.map((item, index) => (
                    <View key={item.date} style={styles.reviewBox}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={{ fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary }}>{item.date}</Text>
                        <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#059669' }}>
                          Approved Balance Deductible
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {['Whole Day', '1st Half', '2nd Half'].map(dur => (
                          <TouchableOpacity
                            key={dur}
                            style={[styles.typeChip, { flex: 1, paddingHorizontal: 0, alignItems: 'center' }, item.duration === dur && styles.typeChipActive]}
                            onPress={() => updateBreakdownDuration(index, dur)}
                          >
                            <Text style={[styles.typeChipText, { fontSize: 11 }, item.duration === dur && styles.typeChipTextActive]}>{dur}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setLeaveStep(1)}>
                      <Text style={[styles.submitBtnText, { color: colors.textPrimary }]}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={() => setLeaveStep(3)}>
                      <Text style={styles.submitBtnText}>Review Application</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {leaveStep === 3 && (
                <View>
                  <Text style={[styles.headerTitle, { marginBottom: 20 }]}>Leave Application Review</Text>

                  <View style={styles.reviewBox}>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Type</Text>
                      <Text style={styles.reviewValue}>{leaveType}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Available Quota</Text>
                      <Text style={[styles.reviewValue, { color: '#00897B' }]}>{currentSelectedBalance.toFixed(2)} days</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRowColumn}>
                      <Text style={styles.reviewLabel}>Reason</Text>
                      <Text style={styles.reviewValueMultiline}>{leaveReason || '—'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Attachment</Text>
                      <Text style={styles.reviewValue}>{leaveImage?.name || (leaveImage ? 'File Attached' : 'None')}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={{ paddingTop: 8 }}>
                      <Text style={[styles.reviewLabel, { marginBottom: 8 }]}>Requested Dates ({leaveBreakdown.length} day{leaveBreakdown.length > 1 ? 's' : ''}):</Text>
                      {leaveBreakdown.map((item) => (
                        <View key={item.date} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                          <Text style={{ fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#334155' : colors.textPrimary }}>• {item.date} ({item.duration})</Text>
                          <Text style={{ fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: '#059669' }}>Quota Deductible</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setLeaveStep(2)}>
                      <Text style={[styles.submitBtnText, { color: colors.textPrimary }]}>Edit Dates</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={handleSubmitLeave} disabled={submittingLeave}>
                      <Text style={styles.submitBtnText}>{submittingLeave ? 'Submitting...' : 'Confirm Submit'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ======================================= */}
          {/* APPEAL TAB */}
          {/* ======================================= */}
          {activeTab === 'appeal' && (
            <View>
              {appealStep === 1 && (
                <View>
                  <TouchableOpacity style={styles.historyButton} onPress={() => { setAppealStep(1); navigation.navigate('AppealHistory'); }}>
                    <Text style={styles.historyButtonText}>View Appeal History</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Date (last 30 days only)</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowAppealCalendar(true)}>
                    <CalendarIcon size={20} color="#00897B" />
                    <Text style={styles.dateText}>{appealDate || 'Select date'}</Text>
                  </TouchableOpacity>
                  {renderCalendar(showAppealCalendar, setShowAppealCalendar, appealDate, setAppealDate, thirtyDaysAgoStr, todayStr)}

                  {/* ✅ NEW: Shift Info Banner for Appeal */}
                  {appealDate && (
                    <View style={{ padding: 12, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, borderRadius: 12, marginBottom: 12 }}>
                      {scheduleForAppeal
                        ? <Text style={{ fontSize: 12, color: '#00897B', fontFamily: 'Inter_18pt-Medium' }}>
                            💡 Shift on this date: {formatTo12Hour(scheduleForAppeal.start_time)} – {formatTo12Hour(scheduleForAppeal.end_time)}
                          </Text>
                        : <Text style={{ fontSize: 12, color: '#EF4444', fontFamily: 'Inter_18pt-Medium' }}>
                            ⚠️ No scheduled shift on this date — appeal cannot be filed.
                          </Text>}
                    </View>
                  )}

                  <Text style={styles.label}>Time In (optional)</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('appealIn'); setShowTimePicker(true); }}>
                    <Clock size={20} color="#00897B" />
                    <Text style={styles.dateText}>{appealTimeIn ? formatTo12Hour(appealTimeIn) : 'Select time in'}</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Time Out (optional)</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('appealOut'); setShowTimePicker(true); }}>
                    <Clock size={20} color="#00897B" />
                    <Text style={styles.dateText}>{appealTimeOut ? formatTo12Hour(appealTimeOut) : 'Select time out'}</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Reason (10–500 characters)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    multiline
                    maxLength={500}
                    placeholder="Explain why you couldn't clock in/out..."
                    placeholderTextColor={colors.textSecondary}
                    value={appealReason}
                    onChangeText={setAppealReason}
                  />

                  <Text style={styles.label}>Proof (Required - PDF, DOC, JPG up to 5MB)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setAppealImage, appealImage)}>
                    <Upload size={18} color="#00897B" />
                    <Text style={styles.uploadText}>{appealImage ? (appealImage.name || 'File Attached') : 'Upload Proof'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.submitBtn} onPress={handleNextAppeal}>
                    <Text style={styles.submitBtnText}>Next: Review Application</Text>
                  </TouchableOpacity>
                </View>
              )}

              {appealStep === 2 && (
                <View>
                  <Text style={[styles.headerTitle, { marginBottom: 20 }]}>Appeal Application Review</Text>
                  <View style={styles.reviewBox}>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Date</Text>
                      <Text style={styles.reviewValue}>{appealDate}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Time In</Text>
                      <Text style={styles.reviewValue}>{appealTimeIn ? formatTo12Hour(appealTimeIn) : 'N/A'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Time Out</Text>
                      <Text style={styles.reviewValue}>{appealTimeOut ? formatTo12Hour(appealTimeOut) : 'N/A'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRowColumn}>
                      <Text style={styles.reviewLabel}>Reason</Text>
                      <Text style={styles.reviewValueMultiline}>{appealReason || '—'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Attachment</Text>
                      <Text style={styles.reviewValue}>{appealImage?.name || (appealImage ? 'File Attached' : 'None')}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setAppealStep(1)}>
                      <Text style={[styles.submitBtnText, { color: colors.textPrimary }]}>Edit Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={handleSubmitAppeal} disabled={submittingAppeal}>
                      <Text style={styles.submitBtnText}>{submittingAppeal ? 'Submitting...' : 'Confirm Submit'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ======================================= */}
          {/* CORRECTION TAB */}
          {/* ======================================= */}
          {activeTab === 'correction' && (
            <View>
              {correctionStep === 1 && (
                <View>
                  <TouchableOpacity style={styles.historyButton} onPress={() => { setCorrectionStep(1); navigation.navigate('CorrectionHistory'); }}>
                    <Text style={styles.historyButtonText}>View Correction History</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Date (last 30 days only)</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowCorrectionCalendar(true)}>
                    <CalendarIcon size={20} color="#00897B" />
                    <Text style={styles.dateText}>{correctionDate || 'Select date'}</Text>
                  </TouchableOpacity>
                  {renderCalendar(showCorrectionCalendar, setShowCorrectionCalendar, correctionDate, setCorrectionDate, thirtyDaysAgoStr, todayStr)}
                  
                  {/* ✅ NEW: Shift Info Banner for Correction */}
                  {correctionDate && (
                    <View style={{ padding: 12, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, borderRadius: 12, marginBottom: 12 }}>
                      {scheduleForCorrection
                        ? <Text style={{ fontSize: 12, color: '#00897B', fontFamily: 'Inter_18pt-Medium' }}>
                            💡 Shift on this date: {formatTo12Hour(scheduleForCorrection.start_time)} – {formatTo12Hour(scheduleForCorrection.end_time)}
                          </Text>
                        : <Text style={{ fontSize: 12, color: '#EF4444', fontFamily: 'Inter_18pt-Medium' }}>
                            ⚠️ No scheduled shift on this date — correction cannot be filed.
                          </Text>}
                    </View>
                  )}

                 

                  <Text style={styles.label}>What to correct?</Text>
                  <View style={styles.typeGroup}>
                    <TouchableOpacity style={[styles.typeChip, correctionType === 'clock_in' && styles.typeChipActive]} onPress={() => setCorrectionType('clock_in')}>
                      <Text style={[styles.typeChipText, correctionType === 'clock_in' && styles.typeChipTextActive]}>Clock In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.typeChip, correctionType === 'clock_out' && styles.typeChipActive]} onPress={() => setCorrectionType('clock_out')}>
                      <Text style={[styles.typeChipText, correctionType === 'clock_out' && styles.typeChipTextActive]}>Clock Out</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.typeChip, correctionType === 'early_out' && styles.typeChipActive]} onPress={() => setCorrectionType('early_out')}>
                      <Text style={[styles.typeChipText, correctionType === 'early_out' && styles.typeChipTextActive]}>Early Out</Text>
                    </TouchableOpacity>
                  </View>

                   {/* ✅ NEW: H4 - Show shift times next to Time picker */}
                  {scheduleForCorrection && (
                    <View style={{
                      padding: 10, marginBottom: 6, borderRadius: 10,
                      backgroundColor: isLight ? '#F1F5F9' : colors.iconBg
                    }}>
                      <Text style={{ fontSize: 12, color: isLight ? '#475569' : colors.textSecondary, fontFamily: 'Inter_18pt-Medium' }}>
                        Shift: <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#00897B' }}>
                          {formatTo12Hour(scheduleForCorrection.start_time)} – {formatTo12Hour(scheduleForCorrection.end_time)}
                        </Text>
                        {'  '}(pick a time inside this window)
                      </Text>
                    </View>
                  )}

                  <Text style={styles.label}>Time</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('correctionTime'); setShowTimePicker(true); }}>
                    <Clock size={20} color="#00897B" />
                    <Text style={styles.dateText}>{correctionTime ? formatTo12Hour(correctionTime) : 'Select time'}</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Reason (5–500 characters)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    multiline
                    maxLength={500}
                    placeholder="Why did you forget to clock or need to leave early?"
                    placeholderTextColor={colors.textSecondary}
                    value={correctionReason}
                    onChangeText={setCorrectionReason}
                  />

                  <Text style={styles.label}>Attachment (Required - PDF, DOC, JPG up to 5MB)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setCorrectionAttachment, correctionAttachment)}>
                    <Upload size={18} color="#00897B" />
                    <Text style={styles.uploadText}>{correctionAttachment ? (correctionAttachment.name || 'File Attached') : 'Upload Proof'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.submitBtn} onPress={handleNextCorrection}>
                    <Text style={styles.submitBtnText}>Next: Review Application</Text>
                  </TouchableOpacity>
                </View>
              )}

              {correctionStep === 2 && (
                <View>
                  <Text style={[styles.headerTitle, { marginBottom: 20 }]}>Correction Application Review</Text>
                  <View style={styles.reviewBox}>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Date</Text>
                      <Text style={styles.reviewValue}>{correctionDate}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Correction Type</Text>
                      <Text style={styles.reviewValue}>
                        {correctionType === 'clock_in' ? 'Clock In' : correctionType === 'clock_out' ? 'Clock Out' : 'Early Out'}
                      </Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Time</Text>
                      <Text style={styles.reviewValue}>{formatTo12Hour(correctionTime)}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRowColumn}>
                      <Text style={styles.reviewLabel}>Reason</Text>
                      <Text style={styles.reviewValueMultiline}>{correctionReason || '—'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Attachment</Text>
                      <Text style={styles.reviewValue}>{correctionAttachment ? (correctionAttachment.name || 'File Attached') : 'No'}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setCorrectionStep(1)}>
                      <Text style={[styles.submitBtnText, { color: colors.textPrimary }]}>Edit Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={handleSubmitCorrection} disabled={submittingCorrection}>
                      <Text style={styles.submitBtnText}>{submittingCorrection ? 'Submitting...' : 'Confirm Submit'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ======================================= */}
          {/* OVERTIME TAB */}
          {/* ======================================= */}
          {activeTab === 'overtime' && (
            <View>
              {overtimeStep === 1 && (
                <View>
                  <TouchableOpacity style={styles.historyButton} onPress={() => { setOvertimeStep(1); navigation.navigate('OvertimeHistory'); }}>
                    <Text style={styles.historyButtonText}>View Overtime History</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Date</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowOvertimeCalendar(true)}>
                    <CalendarIcon size={20} color="#00897B" />
                    <Text style={styles.dateText}>{overtimeDate || 'Select date'}</Text>
                  </TouchableOpacity>
                  {renderCalendar(
  showOvertimeCalendar, 
  setShowOvertimeCalendar, 
  overtimeDate, 
  setOvertimeDate, 
  getPHDateOffset(-7), 
  todayStr             
)}

                  <Text style={styles.label}>Overtime Type</Text>
                  <View style={styles.typeGroup}>
                    {['Regular Overtime', 'Compensatory Time Off (CTO)'].map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.typeChip, overtimeType === opt && styles.typeChipActive]}
                        onPress={() => setOvertimeType(opt)}
                      >
                        <Text style={[styles.typeChipText, overtimeType === opt && styles.typeChipTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Timing</Text>
                  <View style={styles.typeGroup}>
                    {['Early OT', 'Normal OT'].map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.typeChip, overtimeTiming === opt && styles.typeChipActive]}
                        onPress={() => setOvertimeTiming(opt)}
                      >
                        <Text style={[styles.typeChipText, overtimeTiming === opt && styles.typeChipTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* ✅ NEW: Display User's Shift for Context */}
                  {overtimeDate && (
                    <View style={{ marginBottom: 16, padding: 12, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, borderRadius: 12 }}>
                      {loadingSchedule ? (
                        <Text style={{ fontFamily: 'Inter_18pt-Medium', color: colors.textSecondary, fontSize: 12 }}>Checking your schedule...</Text>
                      ) : scheduleForOTDate ? (
                        <Text style={{ fontFamily: 'Inter_18pt-Medium', color: isLight ? '#475569' : colors.textSecondary, fontSize: 12 }}>
                          💡 Your shift on this date is: <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#00897B' }}>{formatTo12Hour(scheduleForOTDate.start_time)} – {formatTo12Hour(scheduleForOTDate.end_time)}</Text>
                        </Text>
                      ) : (
                        <Text style={{ fontFamily: 'Inter_18pt-Medium', color: '#EF4444', fontSize: 12 }}>
                          ⚠️ You do not have a scheduled shift on this date. Overtime requires an existing schedule.
                        </Text>
                      )}
                    </View>
                  )}

                  <Text style={styles.label}>Start Time</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('overtimeStart'); setShowTimePicker(true); }}>
                    <Clock size={20} color="#00897B" />
                    <Text style={styles.dateText}>{overtimeStart ? formatTo12Hour(overtimeStart) : 'Select start time'}</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>End Time</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('overtimeEnd'); setShowTimePicker(true); }}>
                    <Clock size={20} color="#00897B" />
                    <Text style={styles.dateText}>{overtimeEnd ? formatTo12Hour(overtimeEnd) : 'Select end time'}</Text>
                  </TouchableOpacity>

                  {overtimeStart && overtimeEnd && toMinutes(overtimeStart) !== null && toMinutes(overtimeEnd) !== null && (
                    (() => {
                      const d = toMinutes(overtimeEnd) - toMinutes(overtimeStart);
if (d <= 0) return <Text style={{ color: '#EF4444', fontFamily: 'Inter_18pt-Medium', fontSize: 12, marginBottom: 8 }}>End time must be after start time.</Text>;
if (overtimeType === 'Compensatory Time Off (CTO)' && d < 60) {
  return <Text style={{ color: '#EF4444', fontFamily: 'Inter_18pt-Medium', fontSize: 12, marginBottom: 8 }}>
    CTO requires at least 1 hour ({d} min selected).
  </Text>;
}
if (d < 30) return <Text style={{ color: '#EF4444', fontFamily: 'Inter_18pt-Medium', fontSize: 12, marginBottom: 8 }}>Minimum 30 minutes required ({d} min).</Text>;
if (d > 720) return <Text style={{ color: '#EF4444', fontFamily: 'Inter_18pt-Medium', fontSize: 12, marginBottom: 8 }}>Maximum 12 hours per request.</Text>;
const h = Math.floor(d / 60), m = d % 60;
return <Text style={{ color: '#059669', fontFamily: 'Inter_18pt-Medium', fontSize: 12, marginBottom: 8 }}>Duration: {h}h {m}m</Text>;
                    })()
                  )}

                  <Text style={styles.label}>Reason / Task (5–500 characters)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    multiline
                    maxLength={500}
                    placeholder="Why is overtime needed?"
                    placeholderTextColor={colors.textSecondary}
                    value={overtimeReason}
                    onChangeText={setOvertimeReason}
                  />

                  <Text style={styles.label}>Attachment (Optional - PDF, DOC, JPG up to 5MB)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setOvertimeImage, overtimeImage)}>
                    <Upload size={18} color="#00897B" />
                    <Text style={styles.uploadText}>{overtimeImage ? (overtimeImage.name || 'File Attached') : 'Upload File'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.submitBtn} onPress={handleNextOvertime}>
                    <Text style={styles.submitBtnText}>Next: Review Application</Text>
                  </TouchableOpacity>
                </View>
              )}

              {overtimeStep === 2 && (
                <View>
                  <Text style={[styles.headerTitle, { marginBottom: 20 }]}>Overtime Application Review</Text>
                  <View style={styles.reviewBox}>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Type</Text>
                      <Text style={styles.reviewValue}>{overtimeType || 'Regular Overtime'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Timing</Text>
                      <Text style={styles.reviewValue}>{overtimeTiming || 'Normal OT'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Date</Text>
                      <Text style={styles.reviewValue}>{overtimeDate}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Time</Text>
                      <Text style={styles.reviewValue}>{formatTo12Hour(overtimeStart)} – {formatTo12Hour(overtimeEnd)}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRowColumn}>
                      <Text style={styles.reviewLabel}>Reason</Text>
                      <Text style={styles.reviewValueMultiline}>{overtimeReason || '—'}</Text>
                    </View>
                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Attachment</Text>
                      <Text style={styles.reviewValue}>{overtimeImage ? (overtimeImage.name || 'File Attached') : 'None'}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setOvertimeStep(1)}>
                      <Text style={[styles.submitBtnText, { color: colors.textPrimary }]}>Edit Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={handleSubmitOvertime} disabled={submittingOvertime}>
                      <Text style={styles.submitBtnText}>{submittingOvertime ? 'Submitting...' : 'Confirm Submit'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

        </ScrollView>

        {showTimePicker && (
          <DateTimePicker
            value={tempDate}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={handleTimeChange}
            onDismiss={() => setShowTimePicker(false)}
          />
        )}

        {/* Leave Balances Modal */}
        <RNModal visible={showBalancesModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.balancesModal}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Leave Balances ({new Date().getFullYear()})</Text>
                <TouchableOpacity onPress={() => setShowBalancesModal(false)}><X size={22} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              {loadingBalances ? (
                <ActivityIndicator size="small" color="#00897B" style={{ marginVertical: 20 }} />
              ) : leaveBalances.length === 0 ? (
                <Text style={styles.emptyText}>No balances found.</Text>
              ) : (
                leaveBalances.map((item, idx) => (
                  <View key={idx} style={styles.balanceRow}>
                    <Text style={styles.balanceType}>{item.leave_type}</Text>
                    <Text style={styles.balanceDays}>{parseFloat(item.remaining_days).toFixed(2)} / {item.annual_quota || 15} left</Text>
                  </View>
                ))
              )}
              <TouchableOpacity style={styles.closeBalancesBtn} onPress={() => setShowBalancesModal(false)}>
                <Text style={{ fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </RNModal>
      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: isLight ? '#E2E8F0' : colors.border, backgroundColor: isLight ? '#FFFFFF' : colors.surface },
  backButton: { padding: 4 },
  headerTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary },

  tabBar: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isLight ? '#E2E8F0' : colors.border },
  tab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  activeTab: { backgroundColor: isLight ? '#E0F2F1' : 'rgba(0, 137, 123, 0.2)' },
  tabText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary },
  activeTabText: { color: '#00897B' },

  container: { padding: 22, paddingBottom: 60 },
  label: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#334155' : colors.textPrimary, marginBottom: 8, marginTop: 16 },
  subLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },

  leaveTypeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  balanceIndicatorText: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 12,
  },

  input: { fontFamily: 'Inter_18pt-Medium', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, padding: 16, fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, backgroundColor: isLight ? '#FFFFFF' : colors.surface, marginBottom: 16 },
  textArea: { height: 110, textAlignVertical: 'top' },

  datePicker: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, padding: 16, backgroundColor: isLight ? '#FFFFFF' : colors.surface, marginBottom: 16 },
  dateText: { fontFamily: 'Inter_18pt-Medium', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, flex: 1 },

  typeGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  typeChip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 30, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, backgroundColor: isLight ? '#FFFFFF' : colors.surface },
  typeChipActive: { backgroundColor: '#00897B', borderColor: '#00897B' },
  typeChipText: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary },
  typeChipTextActive: { fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF' },

  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, padding: 16, borderRadius: 16, marginTop: 4, marginBottom: 16 },
  uploadText: { fontFamily: 'Inter_18pt-Bold', color: '#00897B', fontSize: 14 },
  previewImage: { width: '100%', height: 180, borderRadius: 16, marginTop: 12, marginBottom: 20 },

  submitBtn: { backgroundColor: '#00897B', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 24, shadowColor: '#00897B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnText: { fontFamily: 'Inter_18pt-Black', color: '#FFFFFF', fontSize: 15, letterSpacing: 0.5 },

  historyButton: { backgroundColor: isLight ? '#E0F2F1' : 'rgba(0, 137, 123, 0.15)', padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  historyButtonText: { fontFamily: 'Inter_18pt-Bold', color: '#00897B', fontSize: 14 },

  balancesButton: { backgroundColor: isLight ? '#F1F5F9' : colors.surface, padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  balancesButtonText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#475569' : colors.textSecondary, fontSize: 14 },

  rangeToggle: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  rangeButton: { flex: 1, paddingVertical: 12, borderRadius: 30, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, alignItems: 'center', backgroundColor: isLight ? '#FFFFFF' : colors.surface },
  rangeButtonActive: { backgroundColor: '#00897B', borderColor: '#00897B' },
  rangeButtonText: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary },
  rangeButtonTextActive: { color: '#FFFFFF' },

  calendarModal: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 20, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calendarTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  balancesModal: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 20, width: '85%', alignSelf: 'center', borderWidth: 1, borderColor: colors.border },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border },
  balanceType: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#1E293B' : colors.textPrimary, flex: 1 },
  balanceDays: { fontFamily: 'Inter_18pt-Medium', color: '#00897B', textAlign: 'right' },
  closeBalancesBtn: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  emptyText: { fontFamily: 'Inter_18pt-Medium', textAlign: 'center', color: isLight ? '#94A3B8' : colors.textSecondary, marginTop: 20 },

  reviewBox: {
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  reviewRowColumn: {
    flexDirection: 'column',
    paddingVertical: 10,
    gap: 6,
  },
  reviewLabel: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 13,
    color: isLight ? '#64748B' : colors.textSecondary,
    letterSpacing: 0.3,
  },
  reviewValue: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 14,
    color: isLight ? '#0F172A' : colors.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 16,
  },
  reviewValueMultiline: {
    fontFamily: 'Inter_18pt-Medium',
    fontSize: 14,
    color: isLight ? '#0F172A' : colors.textPrimary,
    lineHeight: 20,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: isLight ? '#F1F5F9' : colors.border,
  }
});