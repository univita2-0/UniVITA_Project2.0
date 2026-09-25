// src/screens/RequestsScreen.js
import React, { useState, useContext } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image, Modal as RNModal, StatusBar, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { API_URL, requestAttendanceCorrection } from './api';
import { Upload, X, Calendar as CalendarIcon, Camera, Clock, ArrowLeft } from 'lucide-react-native';

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
  const cleaned = cleanStr.replace(',', ':').split('.')[0];
  const parts = cleaned.split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].substring(0, 2).padStart(2, '0');
    return `${h}:${m}:00`;
  }
  return timeStr;
};

const getPHNowString = () => {
  const now = new Date();
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' };
  return now.toLocaleDateString('en-CA', options);
};

const parseServerResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { success: false, message: text || `Server error (${response.status})` };
  }
};

export default function RequestsScreen({ navigation, route }) {
  const prefill = route.params || {};
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = React.useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [activeTab, setActiveTab] = useState(prefill.prefillTab || 'leave');

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerMode, setTimePickerMode] = useState('');
  const [tempDate, setTempDate] = useState(new Date());

  // --- LEAVE STATE ---
  const [leaveStep, setLeaveStep] = useState(1);
  const [leaveBreakdown, setLeaveBreakdown] = useState([]);
  const [leaveDateFrom, setLeaveDateFrom] = useState('');
  const [leaveDateTo, setLeaveDateTo] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [leaveType, setLeaveType] = useState('Vacation');
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
  const [correctionSelfie, setCorrectionSelfie] = useState(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [showCorrectionCalendar, setShowCorrectionCalendar] = useState(false);

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

  const todayStr = getPHNowString();

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setLeaveStep(1);
    setAppealStep(1);
    setCorrectionStep(1);
    setOvertimeStep(1);
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
      const year = new Date().getFullYear();
      const res = await fetch(`${API_URL}/leave-balances/${userId}?year=${year}`);
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

  const pickDocument = async (setFn) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        if (file.size > 5 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Maximum file size is 5MB.');
          return;
        }
        setFn(file);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const takeSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission needed'); return null; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) return result.assets[0].uri;
    return null;
  };

  // --- LEAVE VALIDATION & SUBMISSION ---
  const handleNextLeave = () => {
    if (!leaveDateFrom) { Alert.alert('Validation Error', 'Please select a start date.'); return; }
    if (isRange && !leaveDateTo) { Alert.alert('Validation Error', 'Please select an end date.'); return; }
    if (!leaveReason.trim() || leaveReason.trim().length < 10) { Alert.alert('Validation Error', 'Please provide a detailed reason (minimum 10 characters).'); return; }
    if (!leaveImage) { Alert.alert('Validation Error', 'An attachment (Image/PDF/DOC) is strictly required.'); return; }
    if (isRange && leaveDateTo < leaveDateFrom) { Alert.alert('Invalid Date Range', 'End date cannot be earlier than start date.'); return; }

    const start = new Date(leaveDateFrom);
    const end = isRange ? new Date(leaveDateTo) : start;
    const dates = [];
    
    let currentBalance = leaveBalances.find(b => b.leave_type === leaveType)?.remaining_days || 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push({
        date: d.toISOString().split('T')[0],
        duration: 'Whole Day',
        isPaid: currentBalance >= 1
      });
      currentBalance -= 1;
    }
    setLeaveBreakdown(dates);
    setLeaveStep(2);
  };

  const updateBreakdownDuration = (index, value) => {
    const newBreakdown = [...leaveBreakdown];
    newBreakdown[index].duration = value;
    
    let currentBalance = leaveBalances.find(b => b.leave_type === leaveType)?.remaining_days || 0;
    newBreakdown.forEach(item => {
      const cost = item.duration === 'Whole Day' ? 1 : 0.5;
      item.isPaid = currentBalance >= cost;
      currentBalance -= cost;
    });
    
    setLeaveBreakdown(newBreakdown);
  };

  const handleSubmitLeave = async () => {
    setSubmittingLeave(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      let successCount = 0;
      let lastMessage = '';

      const imageUri = typeof leaveImage === 'string' ? leaveImage : leaveImage.uri;
      const filename = leaveImage.name || imageUri.split('/').pop() || 'leave_proof.pdf';
      const mimeType = leaveImage.mimeType || (filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      for (const item of leaveBreakdown) {
        const formData = new FormData();
        formData.append('type', String(leaveType));
        formData.append('reason', String(leaveReason.trim()));
        formData.append('request_date', String(item.date));
        formData.append('duration', String(item.duration));
        formData.append('is_paid', String(item.isPaid));
        formData.append('image', {
          uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
          name: filename,
          type: mimeType
        });

        const response = await fetch(`${API_URL}/leave-requests`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        const result = await parseServerResponse(response);
        if (response.ok && result.success) successCount++;
        else lastMessage = result.message || 'Failed to submit date.';
      }

      if (successCount === leaveBreakdown.length) {
        Alert.alert('Success', 'Leave Application submitted successfully!');
        setLeaveDateFrom(''); setLeaveDateTo(''); setLeaveReason(''); setLeaveImage(null); setIsRange(false); setLeaveStep(1);
      } else {
        Alert.alert('Submission Notice', `${successCount}/${leaveBreakdown.length} submitted. ${lastMessage}`);
      }
    } catch (err) {
      Alert.alert('Submission Error', err.message || 'Failed to connect to server.');
    } finally {
      setSubmittingLeave(false);
    }
  };

  // --- APPEAL VALIDATION & SUBMISSION ---
  const handleNextAppeal = () => {
    if (!appealDate) { Alert.alert('Validation Error', 'Please select a date for your appeal.'); return; }
    if (!appealReason.trim() || appealReason.trim().length < 10) { Alert.alert('Validation Error', 'Please provide a detailed reason (minimum 10 characters).'); return; }
    if (!appealImage) { Alert.alert('Validation Error', 'An attachment or proof is strictly required.'); return; }
    setAppealStep(2);
  };

  const handleSubmitAppeal = async () => {
    setSubmittingAppeal(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const imageUri = typeof appealImage === 'string' ? appealImage : appealImage.uri;
      const filename = appealImage.name || imageUri.split('/').pop() || 'appeal_proof.jpg';
      const mimeType = appealImage.mimeType || (filename.endsWith('.png') ? 'image/png' : 'image/jpeg');

      const formData = new FormData();
      formData.append('date', String(appealDate));
      formData.append('reason', String(appealReason.trim()));
      if (prefill.prefillScheduleId) formData.append('schedule_id', String(prefill.prefillScheduleId));
      if (appealTimeIn) formData.append('time_in', String(formatTimeForDB(appealTimeIn)));
      if (appealTimeOut) formData.append('time_out', String(formatTimeForDB(appealTimeOut)));
      formData.append('image', {
        uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
        name: filename,
        type: mimeType
      });

      const response = await fetch(`${API_URL}/attendance-appeals`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await parseServerResponse(response);
      if (response.ok && result.success) {
        Alert.alert('Success', 'Attendance appeal submitted successfully.');
        setAppealDate(''); setAppealTimeIn(''); setAppealTimeOut(''); setAppealReason(''); setAppealImage(null); setAppealStep(1);
      } else {
        Alert.alert('Submission Error', result.message || result.error || 'Failed to submit appeal.');
      }
    } catch (error) {
      Alert.alert('Submission Error', error.message || 'Server connection failed.');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  // --- CORRECTION VALIDATION & SUBMISSION ---
  const handleNextCorrection = async () => {
    if (!correctionDate) { Alert.alert('Validation Error', 'Please select a date.'); return; }
    if (!correctionTime) { Alert.alert('Validation Error', 'Please select a correction time.'); return; }
    if (!correctionReason.trim() || correctionReason.trim().length < 5) { Alert.alert('Validation Error', 'Please provide a valid reason (minimum 5 characters).'); return; }
    
    let selfieUri = correctionSelfie;
    if (!selfieUri) {
      const taken = await takeSelfie();
      if (!taken) { Alert.alert('Selfie Required', 'A verification selfie is mandatory.'); return; }
      selfieUri = taken;
      setCorrectionSelfie(taken);
    }
    setCorrectionStep(2);
  };

  const handleSubmitCorrection = async () => {
    setSubmittingCorrection(true);
    try {
      let employeeId = await AsyncStorage.getItem('employee_id');
      if (!employeeId) {
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
          try { employeeId = JSON.parse(userStr).employee_id; } catch (e) {}
        }
      }
      if (!employeeId) { Alert.alert('Authentication Error', 'Employee ID not found.'); setSubmittingCorrection(false); return; }

      const dbType = correctionType === 'early_out' ? 'clock_out' : correctionType;
      const finalReason = correctionType === 'early_out' ? `[Early Departure] ${correctionReason.trim()}` : correctionReason.trim();
      const formattedTime = formatTimeForDB(correctionTime);
      const finalSelfieUri = Platform.OS === 'android' ? correctionSelfie : correctionSelfie.replace('file://', '');

      const payload = {
        employee_id: String(employeeId),
        date: correctionDate,
        type: dbType,
        time: formattedTime,
        reason: finalReason,
        schedule_id: correctionScheduleId || null,
        selfie: { uri: finalSelfieUri, name: 'correction.jpg', type: 'image/jpeg' }
      };
      
      const res = await requestAttendanceCorrection(payload);
      
      if (res && res.success) {
        Alert.alert('Success', res.message || 'Correction request submitted.');
        setCorrectionDate(''); setCorrectionTime(''); setCorrectionReason(''); setCorrectionSelfie(null); 
        setCorrectionType('clock_in'); setCorrectionScheduleId(null); setCorrectionStep(1);
        if (navigation.setParams) {
          navigation.setParams({ prefillTab: undefined, prefillDate: undefined, prefillType: undefined, prefillTime: undefined, prefillReason: undefined, prefillScheduleId: undefined });
        }
        setActiveTab('leave');
      } else {
        Alert.alert('Submission Error', res?.message || res?.error || 'Failed to submit correction.');
      }
    } catch (err) {
      Alert.alert('Submission Error', err?.response?.data?.message || err?.message || 'Connection failed.');
    } finally { 
      setSubmittingCorrection(false); 
    }
  };

  // --- OVERTIME VALIDATION & SUBMISSION ---
  const handleNextOvertime = () => {
    if (!overtimeDate) { Alert.alert('Validation Error', 'Please select a date.'); return; }
    if (!overtimeStart || !overtimeEnd) { Alert.alert('Validation Error', 'Start and end times are required.'); return; }
    if (overtimeStart >= overtimeEnd) { Alert.alert('Validation Error', 'Overtime end time must be strictly after the start time.'); return; }
    if (!overtimeReason.trim() || overtimeReason.trim().length < 5) { Alert.alert('Validation Error', 'Please provide a detailed reason (minimum 5 characters).'); return; }
    setOvertimeStep(2);
  };

  const handleSubmitOvertime = async () => {
    setSubmittingOvertime(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      let response;
      const dbScenarioType = overtimeTiming === 'Early OT' ? 'early_ot' : 'normal_ot';

      if (overtimeImage) {
        const imageUri = typeof overtimeImage === 'string' ? overtimeImage : overtimeImage.uri;
        const filename = overtimeImage.name || imageUri.split('/').pop() || 'overtime_proof.pdf';
        const mimeType = overtimeImage.mimeType || (filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

        const formData = new FormData();
        formData.append('date', String(overtimeDate));
        formData.append('start_time', String(formatTimeForDB(overtimeStart)));
        formData.append('end_time', String(formatTimeForDB(overtimeEnd)));
        formData.append('reason', String(overtimeReason.trim()));
        formData.append('scenario_type', String(dbScenarioType));
        formData.append('overtime_type', String(overtimeType));
        if (prefill.prefillScheduleId) formData.append('schedule_id', String(prefill.prefillScheduleId));
        formData.append('attachment', {
          uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
          name: filename,
          type: mimeType
        });

        response = await fetch(`${API_URL}/overtime-requests`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        response = await fetch(`${API_URL}/overtime-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            date: overtimeDate,
            start_time: formatTimeForDB(overtimeStart),
            end_time: formatTimeForDB(overtimeEnd),
            reason: overtimeReason.trim(),
            scenario_type: dbScenarioType,
            overtime_type: overtimeType,
            schedule_id: prefill.prefillScheduleId || null
          })
        });
      }

      const result = await parseServerResponse(response);
      if (response.ok && result.success) {
        Alert.alert('Success', result.message || 'Overtime request submitted successfully.');
        setOvertimeDate(''); setOvertimeStart(''); setOvertimeEnd(''); setOvertimeReason(''); setOvertimeImage(null); setOvertimeStep(1);
      } else {
        Alert.alert('Submission Error', result.message || result.error || 'Failed to submit overtime request.');
      }
    } catch (err) {
      Alert.alert('Submission Error', err.message || 'Server connection failed.');
    } finally {
      setSubmittingOvertime(false);
    }
  };

  const renderCalendar = (show, setShow, date, setDate, minDate = todayStr) => {
    if (!show) return null;
    return (
      <View style={styles.calendarModal}>
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>Select Date (PH)</Text>
          <TouchableOpacity onPress={() => setShow(false)}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
        </View>
        <Calendar
          onDayPress={(day) => { setDate(day.dateString); setShow(false); }}
          markedDates={{ [date]: { selected: true, selectedColor: '#00897B' } }}
          minDate={minDate}
          theme={{ calendarBackground: 'transparent', textDayFontFamily: 'Inter_18pt-Medium', textMonthFontFamily: 'Inter_18pt-Bold', selectedDayBackgroundColor: '#00897B', todayTextColor: '#00897B', arrowColor: '#00897B', monthTextColor: colors.textPrimary, dayTextColor: colors.textPrimary }}
        />
      </View>
    );
  };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} />
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
                    <Text style={styles.balancesButtonText}>View Leave Balances</Text>
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
                  {renderCalendar(showLeaveCalendarFrom, setShowLeaveCalendarFrom, leaveDateFrom, setLeaveDateFrom, todayStr)}

                  {isRange && (
                    <>
                      <Text style={styles.label}>To Date</Text>
                      <TouchableOpacity style={styles.datePicker} onPress={() => setShowLeaveCalendarTo(true)}>
                        <CalendarIcon size={20} color="#00897B" />
                        <Text style={styles.dateText}>{leaveDateTo || 'Select date'}</Text>
                      </TouchableOpacity>
                      {renderCalendar(showLeaveCalendarTo, setShowLeaveCalendarTo, leaveDateTo, setLeaveDateTo, leaveDateFrom || todayStr)}
                    </>
                  )}

                  <Text style={styles.label}>Leave Type</Text>
                  <View style={styles.typeGroup}>
                    {['Birthday', 'PTO', 'Compensatory Paid Off', 'Emergency', 'Vacation'].map(t => (
                      <TouchableOpacity key={t} style={[styles.typeChip, leaveType === t && styles.typeChipActive]} onPress={() => setLeaveType(t)}>
                        <Text style={[styles.typeChipText, leaveType === t && styles.typeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Reason (Minimum 10 characters)</Text>
                  <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Explain reason..." placeholderTextColor={colors.textSecondary} value={leaveReason} onChangeText={setLeaveReason} />

                  <Text style={styles.label}>Attachment (Required - PDF, DOC, JPG up to 5MB)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setLeaveImage)}>
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
                  <Text style={[styles.headerTitle, { marginBottom: 16 }]}>Date Breakdown</Text>
                  <Text style={[styles.subLabel, { marginBottom: 16 }]}>Specify duration for each day. Pay status is calculated based on your remaining '{leaveType}' balance.</Text>
                  
                  {leaveBreakdown.map((item, index) => (
                    <View key={item.date} style={styles.reviewBox}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={{ fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary }}>{item.date}</Text>
                        <Text style={{ fontFamily: 'Inter_18pt-Bold', color: item.isPaid ? '#059669' : '#DC2626' }}>
                          {item.isPaid ? 'With Pay' : 'Without Pay'}
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
                          <Text style={{ fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: item.isPaid ? '#059669' : '#DC2626' }}>{item.isPaid ? 'With Pay' : 'Without Pay'}</Text>
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

                  <Text style={styles.label}>Date</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowAppealCalendar(true)}>
                    <CalendarIcon size={20} color="#00897B" />
                    <Text style={styles.dateText}>{appealDate || 'Select date'}</Text>
                  </TouchableOpacity>
                  {renderCalendar(showAppealCalendar, setShowAppealCalendar, appealDate, setAppealDate, null)}

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

                  <Text style={styles.label}>Reason (Minimum 10 characters)</Text>
                  <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Explain why you couldn't clock in/out..." placeholderTextColor={colors.textSecondary} value={appealReason} onChangeText={setAppealReason} />

                  <Text style={styles.label}>Proof (Required - PDF, DOC, JPG up to 5MB)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setAppealImage)}>
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

                  <Text style={styles.label}>Date</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowCorrectionCalendar(true)}>
                    <CalendarIcon size={20} color="#00897B" />
                    <Text style={styles.dateText}>{correctionDate || 'Select date'}</Text>
                  </TouchableOpacity>
                  {renderCalendar(showCorrectionCalendar, setShowCorrectionCalendar, correctionDate, setCorrectionDate, null)}

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

                  <Text style={styles.label}>Time</Text>
                  <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('correctionTime'); setShowTimePicker(true); }}>
                    <Clock size={20} color="#00897B" />
                    <Text style={styles.dateText}>{correctionTime ? formatTo12Hour(correctionTime) : 'Select time'}</Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Reason</Text>
                  <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Why did you forget to clock or need to leave early?" placeholderTextColor={colors.textSecondary} value={correctionReason} onChangeText={setCorrectionReason} />

                  <Text style={styles.label}>Selfie (Required Proof)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={async () => { const uri = await takeSelfie(); if (uri) setCorrectionSelfie(uri); }}>
                    <Camera size={18} color="#00897B" />
                    <Text style={styles.uploadText}>{correctionSelfie ? 'Retake Selfie' : 'Take Selfie'}</Text>
                  </TouchableOpacity>
                  {correctionSelfie && <Image source={{ uri: correctionSelfie }} style={styles.previewImage} />}

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
                      <Text style={styles.reviewLabel}>Selfie Attached</Text>
                      <Text style={styles.reviewValue}>{correctionSelfie ? 'Yes (Attached)' : 'No'}</Text>
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
                  {renderCalendar(showOvertimeCalendar, setShowOvertimeCalendar, overtimeDate, setOvertimeDate, todayStr)}

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

                  <Text style={styles.label}>Reason / Task (Minimum 5 characters)</Text>
                  <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Why is overtime needed?" placeholderTextColor={colors.textSecondary} value={overtimeReason} onChangeText={setOvertimeReason} />

                  <Text style={styles.label}>Attachment (Optional - PDF, DOC, JPG up to 5MB)</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setOvertimeImage)}>
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
                    <Text style={styles.balanceDays}>{item.remaining_days} / {item.annual_quota || 15} left</Text>
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