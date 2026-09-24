// src/screens/NotificationsScreen.js
import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, StatusBar, Platform
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
import { API_URL } from './api';

// src/screens/NotificationsScreen.js

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

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = getStyles(colors, isLight);

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchNotifications = async () => {
        setLoading(true);
        try {
          const token = await AsyncStorage.getItem('auth_token');
          let employeeId = await AsyncStorage.getItem('employee_id');

          if (!employeeId) {
            const rawUser = await AsyncStorage.getItem('user');
            if (rawUser) {
              try {
                const parsed = JSON.parse(rawUser);
                employeeId = parsed.employee_id || parsed.employeeId || parsed.id;
              } catch (e) {}
            }
          }

          if (!token || !employeeId) {
            setNotifications([]);
            return;
          }

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

          // Sort descending by action date
          aggregated.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          setNotifications(aggregated);
        } catch (error) {
          console.error("Failed to load notifications:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchNotifications();
    }, [])
  );

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
        <Text style={styles.headerTitle}>Request Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        alwaysBounceVertical={true}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#0D9488" style={{ marginTop: 40 }} />
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Inbox size={48} color={colors.textSecondary} opacity={0.5} />
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptySub}>You have no approved or rejected request updates.</Text>
          </View>
        ) : (
          notifications.map(item => (
            <View key={item.id} style={styles.card}>
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
                  {item.status === 'approved' ? (
                    <View style={styles.badgeSuccess}>
                      <CheckCircle size={12} color="#059669" />
                      <Text style={styles.badgeTextSuccess}>Approved</Text>
                    </View>
                  ) : (
                    <View style={styles.badgeDanger}>
                      <XCircle size={12} color="#DC2626" />
                      <Text style={styles.badgeTextDanger}>Rejected</Text>
                    </View>
                  )}
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