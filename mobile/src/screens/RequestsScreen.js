// src/screens/RequestsScreen.js
import React, { useState, useContext } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image, Modal as RNModal, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { submitLeaveRequest, requestAttendanceCorrection, API_URL, submitScheduleRequest } from './api';
import { Upload, X, Calendar as CalendarIcon, Camera, Clock, ArrowLeft } from 'lucide-react-native';

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

const formatTimeForDB = (timeStr) => {
  if (!timeStr) return null;
  return timeStr.length === 5 ? `${timeStr}:00` : timeStr;
};

const getLocalTodayString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return (new Date(now - offset)).toISOString().split('T')[0];
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

  const locationList = ['S Residence Tower 3', 'Main Campus', 'Pasig Branch'];
  const courseList = ['Allied Health', 'Healthcare101', 'Information Technology'];

  // Leave
  const [leaveDateFrom, setLeaveDateFrom] = useState('');
  const [leaveDateTo, setLeaveDateTo] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [leaveType, setLeaveType] = useState('Sick Leave');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveImage, setLeaveImage] = useState(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [showLeaveCalendarFrom, setShowLeaveCalendarFrom] = useState(false);
  const [showLeaveCalendarTo, setShowLeaveCalendarTo] = useState(false);
  const [showBalancesModal, setShowBalancesModal] = useState(false);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Schedule
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('17:00');
  const [schedulePlace, setSchedulePlace] = useState('S Residence Tower 3');
  const [scheduleCourse, setScheduleCourse] = useState('Allied Health');
  const [scheduleReason, setScheduleReason] = useState('');
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [showScheduleCalendar, setShowScheduleCalendar] = useState(false);

  // Appeal
  const [appealDate, setAppealDate] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [appealImage, setAppealImage] = useState(null);
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [showAppealCalendar, setShowAppealCalendar] = useState(false);
  const [appealTimeIn, setAppealTimeIn] = useState('');
  const [appealTimeOut, setAppealTimeOut] = useState('');

  // Correction
  const [correctionDate, setCorrectionDate] = useState(prefill.prefillDate || '');
  const [correctionType, setCorrectionType] = useState(prefill.prefillType || 'clock_in');
  const [correctionTime, setCorrectionTime] = useState(prefill.prefillTime || '');
  const [correctionReason, setCorrectionReason] = useState(prefill.prefillReason || '');
  const [correctionSelfie, setCorrectionSelfie] = useState(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [showCorrectionCalendar, setShowCorrectionCalendar] = useState(false);

  // Overtime
  const [overtimeDate, setOvertimeDate] = useState('');
  const [overtimeStart, setOvertimeStart] = useState('');
  const [overtimeEnd, setOvertimeEnd] = useState('');
  const [overtimeReason, setOvertimeReason] = useState('');
  const [overtimeImage, setOvertimeImage] = useState(null);
  const [submittingOvertime, setSubmittingOvertime] = useState(false);
  const [showOvertimeCalendar, setShowOvertimeCalendar] = useState(false);
  const [overtimeScenario, setOvertimeScenario] = useState('future');

  const todayStr = getLocalTodayString();

  const handleTimeChange = (event, selectedDate) => {
    setShowTimePicker(false);
    if (selectedDate) {
      const hours = String(selectedDate.getHours()).padStart(2, '0');
      const minutes = String(selectedDate.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      if (timePickerMode === 'scheduleStart') setScheduleStart(timeString);
      if (timePickerMode === 'scheduleEnd') setScheduleEnd(timeString);
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
    if (!userId) { Alert.alert('Error', 'User not found'); setLoadingBalances(false); return; }
    try {
      const year = new Date().getFullYear();
      const res = await fetch(`${API_URL}/leave-balances/${userId}?year=${year}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setLeaveBalances(data);
      else setLeaveBalances([{ leave_type: 'Sick Leave', remaining_days: 15, annual_quota: 15 }, { leave_type: 'Vacation Leave', remaining_days: 15, annual_quota: 15 }]);
      setShowBalancesModal(true);
    } catch (err) {
      setLeaveBalances([{ leave_type: 'Sick Leave', remaining_days: 15, annual_quota: 15 }, { leave_type: 'Vacation Leave', remaining_days: 15, annual_quota: 15 }]);
      setShowBalancesModal(true);
    } finally { setLoadingBalances(false); }
  };

  const pickImage = async (setFn) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow access to photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 });
    if (!result.canceled) setFn(result.assets[0].uri);
  };

  const takeSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission needed'); return null; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) return result.assets[0].uri;
    return null;
  };

  const handleSubmitLeave = async () => {
    if (!leaveDateFrom) { Alert.alert('Required', 'Select a start date.'); return; }
    if (isRange && !leaveDateTo) { Alert.alert('Required', 'Select an end date.'); return; }
    if (!leaveReason.trim()) { Alert.alert('Required', 'Provide a reason.'); return; }

    let daysRequested = 1;
    if (isRange) {
      const start = new Date(leaveDateFrom);
      const end = new Date(leaveDateTo);
      const diffTime = Math.abs(end - start);
      daysRequested = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    const userId = await AsyncStorage.getItem('user_id');
    const year = new Date(leaveDateFrom).getFullYear();
    let remainingDays = 0;
    try {
      const res = await fetch(`${API_URL}/leave-balances/${userId}?year=${year}`);
      const balances = await res.json();
      const found = balances.find(b => b.leave_type === leaveType);
      remainingDays = found ? found.remaining_days : 0;
    } catch (err) {
      Alert.alert('Error', 'Could not verify leave balance.');
      return;
    }

    if (daysRequested > remainingDays) {
      Alert.alert('Insufficient Balance', `You only have ${remainingDays} day(s) left for ${leaveType}.`);
      return;
    }

    setSubmittingLeave(true);
    try {
      const formDataBase = new FormData();
      formDataBase.append('user_id', userId);
      formDataBase.append('type', leaveType);
      formDataBase.append('reason', leaveReason.trim());
      if (leaveImage) {
        const filename = leaveImage.split('/').pop();
        const fileType = filename.split('.').pop();
        formDataBase.append('image', { uri: leaveImage, name: filename, type: `image/${fileType}` });
      }

      const submitForDate = async (date) => {
        const formData = new FormData();
        for (let pair of formDataBase._parts) {
          formData.append(pair[0], pair[1]);
        }
        formData.append('request_date', date);
        return await submitLeaveRequest(formData);
      };

      const start = new Date(leaveDateFrom);
      const end = isRange ? new Date(leaveDateTo) : start;
      const dateList = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateList.push(d.toISOString().split('T')[0]);
      }

      let successCount = 0;
      let failMessage = '';
      for (const date of dateList) {
        const res = await submitForDate(date);
        if (res.success) successCount++;
        else failMessage = res.message || `Failed for ${date}`;
      }

      if (successCount === dateList.length) {
        Alert.alert('Success', `${successCount} leave request(s) submitted.`);
        setLeaveDateFrom(''); setLeaveDateTo(''); setLeaveReason(''); setLeaveImage(null); setIsRange(false);
      } else {
        Alert.alert('Partial Success', `${successCount}/${dateList.length} submitted. ${failMessage}`);
      }
    } catch (err) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleSubmitSchedule = async () => {
    if (!scheduleDate) { Alert.alert('Required', 'Select a date.'); return; }
    if (!scheduleStart || !scheduleEnd) { Alert.alert('Required', 'Enter times.'); return; }
    if (!schedulePlace.trim()) { Alert.alert('Required', 'Select a campus location.'); return; }
    if (!scheduleCourse.trim()) { Alert.alert('Required', 'Select a course name.'); return; }

    setSubmittingSchedule(true);
    try {
      const result = await submitScheduleRequest({
        request_type: 'new',
        date: scheduleDate,
        place: schedulePlace.trim(), 
        course: scheduleCourse.trim(), 
        start_time: formatTimeForDB(scheduleStart),
        end_time: formatTimeForDB(scheduleEnd),
        reason: scheduleReason.trim()
      });
      if (result.success) {
        Alert.alert('Request Sent', 'Your schedule request has been submitted.');
        setScheduleDate(''); setScheduleStart('09:00'); setScheduleEnd('17:00'); setSchedulePlace('S Residence Tower 3'); setScheduleCourse('Allied Health'); setScheduleReason('');
      } else {
        Alert.alert('Error', result.message || 'Failed to submit request.');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const submitAppeal = async () => {
    if (!appealDate) { Alert.alert('Required', 'Select a date.'); return; }
    if (!appealReason.trim()) { Alert.alert('Required', 'Provide a reason.'); return; }

    setSubmittingAppeal(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('date', appealDate);
      formData.append('reason', appealReason.trim());
      
      if (appealTimeIn) formData.append('time_in', formatTimeForDB(appealTimeIn));
      if (appealTimeOut) formData.append('time_out', formatTimeForDB(appealTimeOut));
      
      if (appealImage) {
        const filename = appealImage.split('/').pop();
        const fileType = filename.split('.').pop();
        formData.append('image', { uri: appealImage, name: filename, type: `image/${fileType}` });
      }
      
      const token = await AsyncStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/attendance-appeals`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token || ''}` },
        body: formData,
      });
      const result = await response.json();
      if (result.success) {
        Alert.alert('Appeal Submitted', 'Your appeal has been sent.');
        setAppealDate(''); setAppealTimeIn(''); setAppealTimeOut(''); setAppealReason(''); setAppealImage(null);
      } else {
        Alert.alert('Error', result.error || result.message || 'Failed.');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error.');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const submitCorrection = async () => {
    if (!correctionDate) { Alert.alert('Required', 'Select a date.'); return; }
    if (!correctionTime) { Alert.alert('Required', 'Enter the time.'); return; }
    if (!correctionReason.trim()) { Alert.alert('Required', 'Provide a reason.'); return; }

    let selfieUri = correctionSelfie;
    if (!selfieUri) {
      const taken = await takeSelfie();
      if (!taken) { Alert.alert('Selfie Required', 'Please take a selfie as proof.'); return; }
      selfieUri = taken;
      setCorrectionSelfie(taken);
    }
    
    setSubmittingCorrection(true);
    try {
      const employeeId = await AsyncStorage.getItem('employee_id');
      const formData = new FormData();
      
      const dbType = correctionType === 'early_out' ? 'clock_out' : correctionType;
      const finalReason = correctionType === 'early_out' 
        ? `[Early Departure] ${correctionReason.trim()}` 
        : correctionReason.trim();

      formData.append('employee_id', employeeId);
      formData.append('date', correctionDate);
      formData.append('type', dbType);
      formData.append('time', formatTimeForDB(correctionTime)); 
      formData.append('reason', finalReason);
      
      const filename = selfieUri.split('/').pop();
      const fileType = filename.split('.').pop();
      formData.append('selfie', { uri: selfieUri, name: filename, type: `image/${fileType}` });
      
      const res = await requestAttendanceCorrection(formData);
      if (res.success) {
        Alert.alert('Request Sent', 'Correction request submitted for approval.');
        setCorrectionDate(''); setCorrectionTime(''); setCorrectionReason(''); setCorrectionSelfie(null); setCorrectionType('clock_in');
        navigation.setParams({ prefillTab: undefined, prefillDate: undefined, prefillType: undefined, prefillTime: undefined, prefillReason: undefined });
        setActiveTab('leave');
      } else {
        Alert.alert('Error', res.message || 'Failed.');
      }
    } catch (err) { 
      Alert.alert('Error', 'Network error.'); 
    } finally { 
      setSubmittingCorrection(false); 
    }
  };

  const handleSubmitOvertime = async () => {
    if (!overtimeDate) { Alert.alert('Required', 'Select a date.'); return; }
    if (!overtimeStart || !overtimeEnd) { Alert.alert('Required', 'Enter start and end time.'); return; }
    if (!overtimeReason.trim()) { Alert.alert('Required', 'Provide a reason.'); return; }

    setSubmittingOvertime(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const formData = new FormData();
      formData.append('date', overtimeDate);
      formData.append('start_time', formatTimeForDB(overtimeStart));
      formData.append('end_time', formatTimeForDB(overtimeEnd));
      formData.append('reason', overtimeReason.trim());
      formData.append('scenario_type', overtimeScenario);
      if (overtimeImage) {
        const filename = overtimeImage.split('/').pop();
        const fileType = filename.split('.').pop();
        formData.append('attachment', { uri: overtimeImage, name: filename, type: `image/${fileType}` });
      }
      const response = await fetch(`${API_URL}/overtime-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (result.success) {
        Alert.alert('Success', 'Overtime request submitted.');
        setOvertimeDate(''); setOvertimeStart(''); setOvertimeEnd(''); setOvertimeReason(''); setOvertimeImage(null); setOvertimeScenario('future');
      } else {
        Alert.alert('Error', result.message || 'Submission failed.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error.');
    } finally {
      setSubmittingOvertime(false);
    }
  };

  const renderCalendar = (show, setShow, date, setDate, minDate = todayStr) => {
    if (!show) return null;
    return (
      <View style={styles.calendarModal}>
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>Select Date</Text>
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Requests</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {['leave', 'schedule', 'appeal', 'correction', 'overtime'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.activeTab]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          
          {/* LEAVE TAB */}
          {activeTab === 'leave' && (
            <View>
              <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('LeaveHistory')}>
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

              <Text style={styles.label}>Type</Text>
              <View style={styles.typeGroup}>
                {['Sick Leave', 'Vacation', 'Emergency', 'Other'].map(t => (
                  <TouchableOpacity key={t} style={[styles.typeChip, leaveType === t && styles.typeChipActive]} onPress={() => setLeaveType(t)}>
                    <Text style={[styles.typeChipText, leaveType === t && styles.typeChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Reason</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Explain reason..." placeholderTextColor={colors.textSecondary} value={leaveReason} onChangeText={setLeaveReason} />

              <Text style={styles.label}>Attachment (optional)</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(setLeaveImage)}>
                <Upload size={18} color="#00897B" /><Text style={styles.uploadText}>{leaveImage ? 'Change Image' : 'Upload'}</Text>
              </TouchableOpacity>
              {leaveImage && <Image source={{ uri: leaveImage }} style={styles.previewImage} />}

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitLeave} disabled={submittingLeave}>
                <Text style={styles.submitBtnText}>{submittingLeave ? 'Submitting...' : 'Submit Leave Request'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* SCHEDULE TAB */}
          {activeTab === 'schedule' && (
            <View>
              <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('ScheduleHistory')}>
                <Text style={styles.historyButtonText}>View Schedule History</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Date</Text>
              <TouchableOpacity style={styles.datePicker} onPress={() => setShowScheduleCalendar(true)}>
                <CalendarIcon size={20} color="#00897B" />
                <Text style={styles.dateText}>{scheduleDate || 'Select date'}</Text>
              </TouchableOpacity>
              {renderCalendar(showScheduleCalendar, setShowScheduleCalendar, scheduleDate, setScheduleDate)}

              <Text style={styles.label}>Start Time</Text>
              <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('scheduleStart'); setShowTimePicker(true); }}>
                <Clock size={20} color="#00897B" />
                <Text style={styles.dateText}>{scheduleStart ? formatTo12Hour(scheduleStart) : 'Select start time'}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>End Time</Text>
              <TouchableOpacity style={styles.datePicker} onPress={() => { setTimePickerMode('scheduleEnd'); setShowTimePicker(true); }}>
                <Clock size={20} color="#00897B" />
                <Text style={styles.dateText}>{scheduleEnd ? formatTo12Hour(scheduleEnd) : 'Select end time'}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Location / Campus</Text>
              <View style={styles.typeGroup}>
                {locationList.map(loc => (
                  <TouchableOpacity key={loc} style={[styles.typeChip, schedulePlace === loc && styles.typeChipActive]} onPress={() => setSchedulePlace(loc)}>
                    <Text style={[styles.typeChipText, schedulePlace === loc && styles.typeChipTextActive]}>{loc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Course Name</Text>
              <View style={styles.typeGroup}>
                {courseList.map(c => (
                  <TouchableOpacity key={c} style={[styles.typeChip, scheduleCourse === c && styles.typeChipActive]} onPress={() => setScheduleCourse(c)}>
                    <Text style={[styles.typeChipText, scheduleCourse === c && styles.typeChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Reason for Request</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline placeholder="e.g., Need to cover a shift..." placeholderTextColor={colors.textSecondary} value={scheduleReason} onChangeText={setScheduleReason} />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitSchedule} disabled={submittingSchedule}>
                <Text style={styles.submitBtnText}>{submittingSchedule ? 'Sending...' : 'Send Schedule Request'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* APPEAL TAB */}
          {activeTab === 'appeal' && (
            <View>
              <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('AppealHistory')}>
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

              <Text style={styles.label}>Reason</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Explain why you couldn't clock in/out..." placeholderTextColor={colors.textSecondary} value={appealReason} onChangeText={setAppealReason} />

              <Text style={styles.label}>Proof (optional)</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(setAppealImage)}>
                <Upload size={18} color="#00897B" /><Text style={styles.uploadText}>{appealImage ? 'Change Image' : 'Upload'}</Text>
              </TouchableOpacity>
              {appealImage && <Image source={{ uri: appealImage }} style={styles.previewImage} />}

              <TouchableOpacity style={styles.submitBtn} onPress={submitAppeal} disabled={submittingAppeal}>
                <Text style={styles.submitBtnText}>{submittingAppeal ? 'Submitting...' : 'Submit Appeal'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* CORRECTION TAB */}
          {activeTab === 'correction' && (
            <View>
              <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('CorrectionHistory')}>
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

              <Text style={styles.label}>Selfie (proof)</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={async () => { const uri = await takeSelfie(); if (uri) setCorrectionSelfie(uri); }}>
                <Camera size={18} color="#00897B" /><Text style={styles.uploadText}>{correctionSelfie ? 'Retake Selfie' : 'Take Selfie'}</Text>
              </TouchableOpacity>
              {correctionSelfie && <Image source={{ uri: correctionSelfie }} style={styles.previewImage} />}

              <TouchableOpacity style={styles.submitBtn} onPress={submitCorrection} disabled={submittingCorrection}>
                <Text style={styles.submitBtnText}>{submittingCorrection ? 'Submitting...' : 'Submit Correction Request'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* OVERTIME TAB */}
          {activeTab === 'overtime' && (
            <View>
              <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('OvertimeHistory')}>
                <Text style={styles.historyButtonText}>View Overtime History</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Date</Text>
              <TouchableOpacity style={styles.datePicker} onPress={() => setShowOvertimeCalendar(true)}>
                <CalendarIcon size={20} color="#00897B" />
                <Text style={styles.dateText}>{overtimeDate || 'Select date'}</Text>
              </TouchableOpacity>
              {renderCalendar(showOvertimeCalendar, setShowOvertimeCalendar, overtimeDate, setOvertimeDate)}

              <Text style={styles.label}>Scenario Type</Text>
              <View style={styles.typeGroup}>
                {[
                  { value: 'future', label: 'Future Date' },
                  { value: 'ongoing', label: 'Ongoing Shift' },
                  { value: 'after_shift', label: 'After Shift' }
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.typeChip, overtimeScenario === opt.value && styles.typeChipActive]}
                    onPress={() => setOvertimeScenario(opt.value)}
                  >
                    <Text style={[styles.typeChipText, overtimeScenario === opt.value && styles.typeChipTextActive]}>
                      {opt.label}
                    </Text>
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

              <Text style={styles.label}>Reason / Task</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Why is overtime needed?" placeholderTextColor={colors.textSecondary} value={overtimeReason} onChangeText={setOvertimeReason} />

              <Text style={styles.label}>Attachment (optional)</Text>
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(setOvertimeImage)}>
                <Upload size={18} color="#00897B" /><Text style={styles.uploadText}>{overtimeImage ? 'Change Image' : 'Upload'}</Text>
              </TouchableOpacity>
              {overtimeImage && <Image source={{ uri: overtimeImage }} style={styles.previewImage} />}

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitOvertime} disabled={submittingOvertime}>
                <Text style={styles.submitBtnText}>{submittingOvertime ? 'Submitting...' : 'Submit Overtime Request'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Native Time Picker Component */}
        {showTimePicker && (
          <DateTimePicker
            value={tempDate}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={handleTimeChange}
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
                    <Text style={styles.balanceDays}>{item.remaining_days} / {item.annual_quota || 15} days left</Text>
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

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  balancesModal: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 20, width: '85%', alignSelf: 'center', borderWidth: 1, borderColor: colors.border },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border },
  balanceType: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#1E293B' : colors.textPrimary },
  balanceDays: { fontFamily: 'Inter_18pt-Medium', color: '#00897B' },
  closeBalancesBtn: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  emptyText: { fontFamily: 'Inter_18pt-Medium', textAlign: 'center', color: isLight ? '#94A3B8' : colors.textSecondary, marginTop: 20 },
});