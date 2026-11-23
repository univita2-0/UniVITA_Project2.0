// src/screens/NotificationsScreen.js
import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, StatusBar, Platform, AppState, DeviceEventEmitter
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Inbox, CheckCircle, XCircle, FileText,
  Clock, AlertTriangle, Calendar, Bell
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { API_URL, fetchC14AttendanceNotifications, markC14AttendanceNotificationRead } from './api';

// C15.4: Store only pending read IDs, scoped to the signed-in employee.
// The server remains authoritative; no attendance records are changed here.
const c15ReadQueueKey = employeeId => `@c15_pending_notification_reads:${String(employeeId)}`;
const c15ValidIds = values => [...new Set((Array.isArray(values) ? values : [])
  .map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 200);
const c15GetQueuedReads = async employeeId => {
  if (!employeeId) return [];
  try { return c15ValidIds(JSON.parse(await AsyncStorage.getItem(c15ReadQueueKey(employeeId)) || '[]')); }
  catch { return []; }
};
const c15SaveQueuedReads = async (employeeId, ids) => {
  if (employeeId) await AsyncStorage.setItem(c15ReadQueueKey(employeeId), JSON.stringify(c15ValidIds(ids)));
};
const c15ResolveEmployeeId = async () => {
  let id = await AsyncStorage.getItem('employee_id');
  if (!id) {
    try {
      const user = JSON.parse(await AsyncStorage.getItem('user') || '{}');
      id = user.employee_id || user.employeeId || user.id;
    } catch {}
  }
  return id ? String(id) : null;
};
// Sequential, idempotent PUTs; keep unsuccessful IDs to retry on next refresh.
const c15FlushQueuedReads = async employeeId => {
  const queued = await c15GetQueuedReads(employeeId);
  if (!queued.length) return [];
  const failed = [];
  for (const id of queued) {
    try { await markC14AttendanceNotificationRead(id); }
    catch (error) {
      // Session expiry is handled in api.js. Don't send more requests with stale auth.
      failed.push(id);
      if (/log in|session|unauthorized/i.test(String(error?.message || ''))) {
        failed.push(...queued.slice(queued.indexOf(id) + 1));
        break;
      }
    }
  }
  await c15SaveQueuedReads(employeeId, failed);
  if (failed.length !== queued.length) DeviceEventEmitter.emit('c15:attendance-notifications-changed');
  return failed;
};

const formatPHTDateTime = (dateInput) => {
  if (!dateInput) return '';

  let dateObj;

  if (typeof dateInput === 'string') {
    const raw = dateInput.trim();

    // Case 1: Plain SQL Date with Time (e.g., "2026-09-24 14:11:00")
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
      const [dPart, tPart] = raw.split(' ');
      const [y, m, d] = dPart.split('-').map(Number);
      const [h, min] = tPart.split(':').map(Number);

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthStr = months[m - 1] || 'Jan';
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;

      return `${monthStr} ${d}, ${y}, ${hour12}:${String(min).padStart(2, '0')} ${ampm}`;
    }

    // Case 2: UTC ISO string from MySQL (e.g., "2026-09-24T06:11:00.000Z")
    let iso = raw.replace(' ', 'T');
    if (!iso.endsWith('Z') && !iso.includes('+')) {
      iso += 'Z';
    }
    dateObj = new Date(iso);
  } else {
    dateObj = new Date(dateInput);
  }

  if (isNaN(dateObj.getTime())) return String(dateInput);

  // Convert safely using Asia/Manila timezone
  return dateObj.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// C15.5: Keep notification labels short, consistent, and action-specific.
// The backend's event type determines the status; a message's wording does not.
// Emergency alerts share the existing backend alert_receipts read state.
// History is loaded from authenticated, server-filtered recipient records.
const fetchEmergencyAlertHistory = async token => {
  const response = await axios.get(`${API_URL}/emergency-alerts/history`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!Array.isArray(response.data)) throw new Error('Invalid emergency alert history response.');
  return response.data;
};

const acknowledgeEmergencyAlert = async (id, token) => {
  const response = await axios.post(
    `${API_URL}/emergency-alerts/${id}/read`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.data?.success) throw new Error('Emergency alert acknowledgment was not saved.');
};

const c155DescribeAttendanceEvent = notification => {
  const event = String(notification?.event_type || '').toUpperCase();
  const target = String(notification?.target_type || '').toLowerCase();
  const category = target === 'appeal' || event.startsWith('APPEAL_') ? 'Appeal' : 'Correction';
  if (event === 'CORRECTION_PENDING' || event === 'APPEAL_PENDING') {
    return { title: `${category} submitted`, status: 'pending' };
  }
  if (event === 'CORRECTION_DECISION' || event === 'APPEAL_DECISION') {
    const message = String(notification?.message || '').toLowerCase();
    const decision = /\breject(?:ed|ion)?\b|\bdeclined\b/.test(message) ? 'rejected'
      : /\bapprov(?:ed|al)?\b/.test(message) ? 'approved' : 'info';
    return { title: decision === 'info' ? `${category} reviewed` : `${category} ${decision}`, status: decision };
  }
  if (event.includes('MISSING_CLOCK_OUT') || event.includes('CLOCK_OUT_MISSING')) {
    return { title: 'Missing Clock-Out', status: 'attention' };
  }
  return { title: notification?.title || 'Attendance update', status: 'info' };
};

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = getStyles(colors, isLight);

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [c14Error, setC14Error] = useState('');
  const [c15ReadError, setC15ReadError] = useState('');
  const [emergencyError, setEmergencyError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let pending = false;
      const fetchNotifications = async () => {
        if (!active || pending) return;
        pending = true;
        if (!notifications.length) setLoading(true);
        try {
          const token = await AsyncStorage.getItem('auth_token');
          const employeeId = await c15ResolveEmployeeId();

          if (!token || !employeeId) {
            setNotifications([]);
            return;
          }

          const failedReadIds = await c15FlushQueuedReads(employeeId).catch(err => {
            console.warn('Pending notification read sync unavailable:', err?.message || err);
            return [];
          });
          if (active) setC15ReadError(failedReadIds.length ? 'Some read updates will retry when connected.' : '');
          const pendingReadIds = new Set(failedReadIds);
          const config = { headers: { Authorization: `Bearer ${token}` } };

          // Fetch all request modules in parallel
          const [leavesRes, overtimeRes, correctionsRes, appealsRes, schedulesRes] = await Promise.allSettled([
            axios.get(`${API_URL}/leave-requests/history/${employeeId}`, config),
            axios.get(`${API_URL}/overtime-requests`, config),
            axios.get(`${API_URL}/attendance/corrections/user/${employeeId}`, config),
            axios.get(`${API_URL}/attendance-appeals/user/${employeeId}`, config),
            axios.get(`${API_URL}/schedule-requests/my`, config)
          ]);

          let aggregated = [];

          const processItems = (res, type, titleField, dateField) => {
            if (res.status === 'fulfilled' && Array.isArray(res.value.data)) {
              res.value.data.forEach(item => {
                const status = String(item.status || '').toLowerCase();
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
          processItems(schedulesRes, 'Schedule', 'request_type', 'created_at');

          // C14: server-side durable inbox; do not show duplicate legacy
          // correction/appeal decision entries when C14 has those decisions.
          try {
            const inbox = await fetchC14AttendanceNotifications();
            if (!inbox?.success) throw new Error(inbox?.message || 'Attendance inbox unavailable.');
            if (inbox.success) {
              const c14 = (inbox.data || []).map(n => ({
                id: `c14_${n.id}`, notificationId: n.id, type: 'Attendance',
                targetType: n.target_type, targetId: n.target_id, eventType: n.event_type,
                title: c155DescribeAttendanceEvent(n).title,
                remarks: n.message, date: n.created_at,
                status: c155DescribeAttendanceEvent(n).status,
                unread: !n.read_at && !pendingReadIds.has(Number(n.id))
              }));
              const decided = new Set((inbox.data || []).filter(n => n.event_type?.endsWith('_DECISION'))
                .map(n => `${n.target_type === 'correction' ? 'Correction' : 'Appeal'}_${n.target_id}`));
              aggregated = aggregated.filter(item => !decided.has(item.id));
              aggregated.push(...c14);
            }
            if (active) setC14Error('');
          } catch (err) {
            if (active) setC14Error('Attendance alerts are temporarily unavailable. Other request updates remain visible.');
          }
          // Emergency alert history remains visible after acknowledgment or expiry.
          // Unlike the active-only endpoint, the history endpoint reads durable receipts.
          try {
            const emergency = await fetchEmergencyAlertHistory(token);
            if (active) setEmergencyError('');
            aggregated.push(...emergency.map(alert => ({
              id: `emergency_${alert.id}`,
              notificationId: alert.id,
              type: 'Emergency',
              title: alert.title || 'Emergency alert',
              remarks: alert.message || '',
              date: alert.sent_at,
              status: 'emergency',
              severity: String(alert.severity || 'info').toLowerCase(),
              unread: !alert.read_at,
              emergency: true
            })));
          } catch (err) {
            if (active) setEmergencyError('Emergency alert history is temporarily unavailable.');
          }
          // Sort descending by action date
          aggregated.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          if (active) setNotifications(aggregated);
        } catch (error) {
          console.error("Failed to load notifications:", error);
          if (active) setC14Error("Unable to refresh notifications. Showing the last available updates.");
        } finally {
          pending = false;
          if (active) setLoading(false);
        }
      };

      fetchNotifications();
      const timer = setInterval(fetchNotifications, 30000);
      const stateListener = AppState.addEventListener('change', next => {
        if (next === 'active') fetchNotifications();
      });
      return () => { active = false; clearInterval(timer); stateListener.remove(); };
    }, [])
  );

  // C15: Open the existing authoritative history screen, not a new review flow.
  // Navigation works for both read and unread notifications.
  const openNotification = async (item) => {
    if (item.emergency) {
      if (!item.unread) return;
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (!token) throw new Error('Please sign in again.');
        await acknowledgeEmergencyAlert(item.notificationId, token);
        setNotifications(old => old.map(n => n.id === item.id ? { ...n, unread: false } : n));
        setEmergencyError('');
      } catch (error) {
        setEmergencyError('Unable to acknowledge the alert. Check your connection and retry.');
      }
      return;
    }
    if (item.notificationId && item.unread) {
      const employeeId = await c15ResolveEmployeeId();
      try {
        await markC14AttendanceNotificationRead(item.notificationId);
        if (employeeId) {
          const pending = await c15GetQueuedReads(employeeId);
          await c15SaveQueuedReads(employeeId, pending.filter(id => id !== Number(item.notificationId)));
        }
        setC15ReadError('');
      } catch (err) {
        // Preserve user intent when temporarily offline, without duplicating events.
        if (employeeId && !/log in|session|unauthorized/i.test(String(err?.message || ''))) {
          const pending = await c15GetQueuedReads(employeeId);
          await c15SaveQueuedReads(employeeId, [...pending, Number(item.notificationId)]);
          setC15ReadError('Read status will sync when the connection returns.');
        } else {
          setC15ReadError('Unable to update read status. Please sign in again if needed.');
        }
      }
      setNotifications(old => old.map(n => n.id === item.id ? { ...n, unread: false } : n));
      DeviceEventEmitter.emit('c15:attendance-notifications-changed');
    }
    const kind = String(item.targetType || item.type || '').toLowerCase();
    const screen = kind === 'correction' ? 'CorrectionHistory'
      : kind === 'appeal' ? 'AppealHistory'
      : kind === 'schedule' || kind === 'attendance' ? 'AttendanceHistory'
      : kind === 'leave' ? 'LeaveHistory'
      : kind === 'overtime' ? 'OvertimeHistory' : null;
    if (screen) navigation.navigate(screen, { targetId: item.targetId ? String(item.targetId) : undefined });
  };

  const getIcon = (type) => {
    switch (type) {
      case 'Leave': return <FileText size={20} color={colors.primary} />;
      case 'Overtime': return <Clock size={20} color={colors.primary} />;
      case 'Correction': return <AlertTriangle size={20} color={colors.primary} />;
      case 'Appeal': return <AlertTriangle size={20} color={colors.primary} />;
      case 'Schedule': return <Calendar size={20} color={colors.primary} />;
      default: return <Bell size={20} color={colors.primary} />;
    }
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
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        alwaysBounceVertical={true}
      >
        {!!emergencyError && <Text style={{color:'#B45309',padding:12}}>{emergencyError}</Text>}
        {!!c14Error && <Text style={{color:'#B45309',padding:12}}>{c14Error}</Text>}
        {!!c15ReadError && <Text style={{color:'#B45309',paddingHorizontal:12,paddingBottom:8}}>{c15ReadError}</Text>}
        {loading ? (
          <ActivityIndicator size="large" color="#0D9488" style={{ marginTop: 40 }} />
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Inbox size={48} color={colors.textSecondary} opacity={0.5} />
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptySub}>No notifications are available.</Text>
          </View>
        ) : (
          notifications.map(item => (
            <TouchableOpacity key={item.id} style={[styles.card, item.unread && {borderColor:'#0D9488',borderWidth:1}]} onPress={() => openNotification(item)}>
              <View style={styles.iconBox}>
                {getIcon(item.type)}
              </View>
              <View style={styles.cardContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.titleText}>{item.title}</Text>
                  <Text style={styles.dateText}>{formatPHTDateTime(item.date)}</Text>
                </View>
                <Text style={styles.remarksText}>{item.remarks}</Text>
                <View style={styles.statusWrap}>
                  {item.emergency ? (
                     <View style={styles.badgeNeutral}>
                       <AlertTriangle size={12} color={item.severity === 'critical' ? '#DC2626' : item.severity === 'warning' ? '#D97706' : colors.textSecondary} />
                       <Text style={styles.badgeTextNeutral}>
                         {`${item.severity === 'critical' ? 'Critical' : item.severity === 'warning' ? 'Warning' : 'Information'} · ${item.unread ? 'Acknowledge' : 'Acknowledged'}`}
                       </Text>
                     </View>
                   ) : item.status === 'approved' ? (
                    <View style={styles.badgeSuccess}>
                      <CheckCircle size={12} color="#059669" />
                      <Text style={styles.badgeTextSuccess}>Approved</Text>
                    </View>
                  ) : item.status === 'rejected' ? (
                    <View style={styles.badgeDanger}>
                      <XCircle size={12} color="#DC2626" />
                      <Text style={styles.badgeTextDanger}>Rejected</Text>
                    </View>
                  ) : item.status === 'pending' ? (
                    <View style={styles.badgeNeutral}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={styles.badgeTextNeutral}>Pending review</Text>
                    </View>
                  ) : item.status === 'attention' ? (
                    <View style={styles.badgeNeutral}>
                      <AlertTriangle size={12} color={colors.textSecondary} />
                      <Text style={styles.badgeTextNeutral}>Needs attention</Text>
                    </View>
                  ) : (
                    <View style={styles.badgeNeutral}>
                      <Bell size={12} color={colors.textSecondary} />
                      <Text style={styles.badgeTextNeutral}>{item.unread ? 'New' : 'Read'}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors, isLight) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: isLight ? '#F8FAFC' : colors.background
  },
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
  headerTitle: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 18,
    color: colors.textPrimary
  },
  headerSpacer: { width: 36 },

  // Unrestricted vertical scrolling
  scrollView: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 60,
    flexGrow: 1
  },
  
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: isLight ? '#F0FDFA' : colors.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  cardContent: {
    flex: 1
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4
  },
  titleText: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    marginRight: 10
  },
  dateText: {
    fontFamily: 'Inter_18pt-Medium',
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2
  },
  remarksText: {
    fontFamily: 'Inter_18pt-Medium',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
    lineHeight: 18
  },
  
  badgeNeutral: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 5, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: colors.surface || (isLight ? '#F1F5F9' : '#1E293B')
  },
  badgeTextNeutral: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  statusWrap: {
    alignSelf: 'flex-start'
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0'
  },
  badgeTextSuccess: {
    color: '#059669',
    fontSize: 11,
    fontFamily: 'Inter_18pt-Bold'
  },
  badgeDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  badgeTextDanger: {
    color: '#DC2626',
    fontSize: 11,
    fontFamily: 'Inter_18pt-Bold'
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80
  },
  emptyTitle: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 18,
    color: colors.textPrimary,
    marginTop: 16
  },
  emptySub: {
    fontFamily: 'Inter_18pt-Medium',
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center'
  }
});