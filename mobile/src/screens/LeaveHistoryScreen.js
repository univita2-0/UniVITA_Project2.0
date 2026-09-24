// src/screens/LeaveHistoryScreen.js
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Modal, RefreshControl, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { ArrowLeft, Calendar as CalendarIcon, AlertCircle, ChevronLeft, ChevronRight, X, Eye, EyeOff } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { fetchMyLeaveRequests, API_URL } from './api';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const cleanStr = String(dateStr).substring(0, 10);
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!isNaN(year) && month >= 0 && month < 12 && !isNaN(day)) {
      return `${months[month]} ${day}, ${year}`;
    }
  }
  return cleanStr;
};

// Formats PHT MySQL timestamps (YYYY-MM-DD HH:mm:ss) without UTC shifting
const formatDateTime = (dateStr) => {
  if (!dateStr || dateStr === 'Not Recorded') return 'Not Recorded';
  const raw = String(dateStr).trim();
  const clean = raw.replace('T', ' ').split('.')[0].replace('Z', '');
  const [dPart, tPart] = clean.split(' ');

  if (dPart && tPart) {
    const [y, m, d] = dPart.split('-').map(Number);
    const [h, min] = tPart.split(':').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && !isNaN(h) && !isNaN(min)) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthStr = months[m - 1] || 'Jan';
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      return `${monthStr} ${d}, ${y}, ${hour12}:${String(min).padStart(2, '0')} ${ampm}`;
    }
  }

  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw || 'Not Recorded';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

const getStatusTheme = (status, isLight) => {
  const s = status?.toLowerCase();
  if (s === 'approved') return { bg: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.15)', text: isLight ? '#059669' : '#34D399' };
  if (s === 'rejected') return { bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', text: isLight ? '#DC2626' : '#F87171' };
  if (s === 'cancelled') return { bg: isLight ? '#F1F5F9' : 'rgba(148, 163, 184, 0.15)', text: isLight ? '#64748B' : '#94A3B8' };
  return { bg: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)', text: isLight ? '#D97706' : '#FBBF24' };
};

const ITEMS_PER_PAGE = 10;

export default function LeaveHistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [allHistory, setAllHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [activeTab, setActiveTab] = useState('pending');
  const [filterDate, setFilterDate] = useState(new Date());
  const [page, setPage] = useState(1);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Cancellation State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { loadHistory(); }, []);

  const groupConsecutiveLeaves = (leaves) => {
    if (!leaves || leaves.length === 0) return [];
    
    const sorted = [...leaves].sort((a, b) => {
      const dateA = new Date(String(a.request_date).substring(0, 10));
      const dateB = new Date(String(b.request_date).substring(0, 10));
      return dateA - dateB;
    });

    const grouped = [];
    let currentGroup = null;

    sorted.forEach(leave => {
      const leaveDateStr = String(leave.request_date || '').substring(0, 10);
      if (!leaveDateStr) return;

      if (!currentGroup) {
        currentGroup = { 
          ...leave, 
          start_date: leaveDateStr, 
          end_date: leaveDateStr, 
          days: 1, 
          groupedIds: [leave.id] 
        };
        grouped.push(currentGroup);
      } else {
        const prevDate = new Date(currentGroup.end_date);
        const currDate = new Date(leaveDateStr);
        const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));

        const sameType = currentGroup.type === leave.type;
        const sameStatus = (currentGroup.status || '').toLowerCase() === (leave.status || '').toLowerCase();
        const sameReason = (currentGroup.reason || '').trim() === (leave.reason || '').trim();

        if (diffDays === 1 && sameType && sameStatus && sameReason) {
          currentGroup.end_date = leaveDateStr;
          currentGroup.days += 1;
          currentGroup.groupedIds.push(leave.id);
        } else {
          currentGroup = { 
            ...leave, 
            start_date: leaveDateStr, 
            end_date: leaveDateStr, 
            days: 1, 
            groupedIds: [leave.id] 
          };
          grouped.push(currentGroup);
        }
      }
    });

    return grouped.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  };

  const loadHistory = async () => {
    try {
      const employeeId = await AsyncStorage.getItem('employee_id');
      if (employeeId) {
        const data = await fetchMyLeaveRequests(employeeId);
        const grouped = groupConsecutiveLeaves(Array.isArray(data) ? data : []);
        setAllHistory(grouped);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelReason.trim()) {
      Alert.alert("Reason Required", "Please enter a reason for cancellation.");
      return;
    }
    setCancelling(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      
      const idsToCancel = Array.isArray(selectedRequestId) ? selectedRequestId : [selectedRequestId];
      let successCount = 0;
      
      for (const id of idsToCancel) {
        const res = await fetch(`${API_URL}/leave-requests/${id}/cancel`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ reason: cancelReason })
        });
        const data = await res.json();
        if (res.ok && data.success) successCount++;
      }
      
      if (successCount > 0) {
        Alert.alert("Success", "Request cancelled successfully.");
        setShowCancelModal(false);
        setCancelReason('');
        loadHistory(); 
      } else {
        Alert.alert("Error", "Failed to cancel request.");
      }
    } catch (err) {
      Alert.alert("Error", "Server connection failed.");
    } finally {
      setCancelling(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const changeMonth = (offset) => {
    const newDate = new Date(filterDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setFilterDate(newDate);
    setPage(1); 
    setExpandedId(null);
  };

  const displayedMonth = filterDate.getMonth();
  const displayedYear = filterDate.getFullYear();
  const monthYearString = filterDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const filteredByTab = allHistory.filter(item => {
    const s = item.status?.toLowerCase() || 'pending';
    if (activeTab === 'pending') return s === 'pending';
    return s === 'approved' || s === 'rejected' || s === 'cancelled';
  });

  const filteredHistory = filteredByTab.filter(item => {
    const dateStr = item.start_date || item.request_date || '';
    if (!dateStr) return false;
    const safeDateString = dateStr.substring(0, 10);
    const [y, m] = safeDateString.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      return (m - 1) === displayedMonth && y === displayedYear;
    }
    const d = new Date(safeDateString);
    return d.getMonth() === displayedMonth && d.getFullYear() === displayedYear;
  });

  const paginatedHistory = filteredHistory.slice(0, page * ITEMS_PER_PAGE);

  const handleLoadMore = () => {
    if (page * ITEMS_PER_PAGE < filteredHistory.length) setPage(page + 1);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Leave History</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 'pending' && styles.activeTab]} onPress={() => { setActiveTab('pending'); setPage(1); setExpandedId(null); }} activeOpacity={0.8}>
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'history' && styles.activeTab]} onPress={() => { setActiveTab('history'); setPage(1); setExpandedId(null); }} activeOpacity={0.8}>
            <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>History</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterNavigator}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton} activeOpacity={0.7}>
            <ChevronLeft size={20} color={isLight ? "#0F172A" : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateRangeContainer} onPress={() => setShowCalendarModal(true)} activeOpacity={0.7}>
            <CalendarIcon size={16} color={colors.primary} />
            <Text style={styles.dateRangeText}>{monthYearString}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton} activeOpacity={0.7}>
            <ChevronRight size={20} color={isLight ? "#0F172A" : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={paginatedHistory}
          keyExtractor={(item) => String(item.id || item.start_date)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLight ? "#0F172A" : "#FFFFFF"} />}
          renderItem={({ item }) => {
            const statusTheme = getStatusTheme(item.status, isLight);
            const isRange = item.days > 1;
            const displayDateText = isRange
              ? `${formatDate(item.start_date)} – ${formatDate(item.end_date)}`
              : formatDate(item.start_date || item.request_date);
            const isExpanded = expandedId === item.id;

            return (
              <View style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.headerLeft}>
                    <CalendarIcon size={18} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.date} numberOfLines={1}>{displayDateText}</Text>
                  </View>
                  <View style={styles.headerRight}>
                    <View style={[styles.statusBadge, { backgroundColor: statusTheme.bg }]}>
                      <Text style={[styles.statusText, { color: statusTheme.text }]}>{item.status?.toUpperCase() || 'PENDING'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleExpand(item.id)} style={styles.eyeBtn}>
                      {isExpanded ? <EyeOff size={20} color={colors.primary} /> : <Eye size={20} color={isLight ? "#94A3B8" : colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>
                
                <View style={styles.cardBody}>
                  <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>Leave Type</Text>
                    <Text style={styles.tableValue}>{item.type}</Text>
                  </View>

                  <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>Duration</Text>
                    <Text style={styles.tableValue}>
                      {item.days} {item.days > 1 ? 'Days' : 'Day'}
                    </Text>
                  </View>

                  {item.reason ? (
                    <View style={[styles.tableRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                      <Text style={styles.tableLabel}>Reason</Text>
                      <Text style={styles.tableValueReason}>{item.reason}</Text>
                    </View>
                  ) : null}
                </View>

                {item.image_url && (
                  <View style={styles.attachmentBadge}>
                    <AlertCircle size={14} color={colors.info} />
                    <Text style={[styles.attachmentText, { color: colors.info }]}>Supporting Document Attached</Text>
                  </View>
                )}

                {item.status?.toLowerCase() === 'pending' && (
                  <TouchableOpacity 
                    style={{ backgroundColor: '#EF4444', padding: 12, borderRadius: 12, marginTop: 12, alignItems: 'center' }}
                    onPress={() => {
                      setSelectedRequestId(item.groupedIds || [item.id]);
                      setShowCancelModal(true);
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_18pt-Bold', fontSize: 14 }}>Cancel Request</Text>
                  </TouchableOpacity>
                )}

                {isExpanded && (
                  <View style={styles.expandedContainer}>
                    <View style={styles.expandedRow}>
                      <Text style={styles.expandedLabel}>Submitted On</Text>
                      <Text style={styles.expandedValue}>{formatDateTime(item.submitted_at || item.created_at)}</Text>
                    </View>
                    
                    {item.status?.toLowerCase() !== 'pending' && (
                      <View style={styles.expandedRow}>
                        <Text style={styles.expandedLabel}>
                          {item.status?.toLowerCase() === 'approved' ? 'Approved On' : item.status?.toLowerCase() === 'cancelled' ? 'Cancelled On' : 'Rejected On'}
                        </Text>
                        <Text style={styles.expandedValue}>{formatDateTime(item.reviewed_at || item.updated_at || item.processed_at)}</Text>
                      </View>
                    )}

                    {(item.admin_remarks || item.admin_notes) ? (
                      <View style={[styles.expandedRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.expandedLabel}>Remarks</Text>
                        <Text style={styles.expandedValueRemarks}>"{item.admin_remarks || item.admin_notes}"</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No {activeTab === 'pending' ? 'pending' : 'past'} requests found for {monthYearString}.</Text>
          }
          ListFooterComponent={
            page * ITEMS_PER_PAGE < filteredHistory.length ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore} activeOpacity={0.8}>
                <Text style={styles.loadMoreText}>Load More</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        <Modal visible={showCalendarModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.calendarModalContent}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Select Month</Text>
                <TouchableOpacity onPress={() => setShowCalendarModal(false)}>
                  <X size={22} color={isLight ? "#64748B" : colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <RNCalendar
                current={filterDate.toISOString().substring(0, 10)}
                onDayPress={(day) => {
                  setFilterDate(new Date(day.dateString));
                  setPage(1);
                  setExpandedId(null);
                  setShowCalendarModal(false);
                }}
                theme={{
                  calendarBackground: 'transparent',
                  textDayFontFamily: 'Inter_18pt-Medium',
                  textMonthFontFamily: 'Inter_18pt-Bold',
                  textDayHeaderFontFamily: 'Inter_18pt-Bold',
                  selectedDayBackgroundColor: colors.primary,
                  todayTextColor: colors.primary,
                  arrowColor: colors.primary,
                  monthTextColor: colors.textPrimary,
                  dayTextColor: colors.textPrimary,
                  textSectionTitleColor: isLight ? '#64748B' : '#94A3B8',
                }}
              />
            </View>
          </View>
        </Modal>

        <Modal visible={showCancelModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.calendarModalContent}>
              <Text style={[styles.modalTitle, { marginBottom: 10 }]}>Cancel Request</Text>
              <Text style={{ fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#475569' : colors.textSecondary, marginBottom: 10 }}>
                Please provide a reason for cancelling this request:
              </Text>
              <TextInput
                style={{ fontFamily: 'Inter_18pt-Medium', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary, backgroundColor: isLight ? '#FFFFFF' : colors.surface, height: 100, textAlignVertical: 'top' }}
                multiline
                placeholder="Reason for cancellation..."
                placeholderTextColor={colors.textSecondary}
                value={cancelReason}
                onChangeText={setCancelReason}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <TouchableOpacity onPress={() => setShowCancelModal(false)} style={{ padding: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontFamily: 'Inter_18pt-Medium' }}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCancelRequest} disabled={cancelling} style={{ backgroundColor: '#EF4444', padding: 12, borderRadius: 8 }}>
                  <Text style={{ color: '#FFF', fontFamily: 'Inter_18pt-Bold' }}>{cancelling ? 'Cancelling...' : 'Confirm Cancel'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: isLight ? '#E2E8F0' : colors.border, 
    backgroundColor: isLight ? '#FFFFFF' : colors.surface 
  },
  backButton: { padding: 4 },
  headerTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary },
  tabContainer: { 
    flexDirection: 'row', 
    marginHorizontal: 20, 
    marginTop: 16, 
    backgroundColor: isLight ? '#F1F5F9' : colors.surface, 
    borderRadius: 20, 
    padding: 6, 
    borderWidth: 1, 
    borderColor: isLight ? '#E2E8F0' : colors.border 
  },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  activeTab: { 
    backgroundColor: isLight ? '#FFFFFF' : colors.iconBg, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: isLight ? 0.05 : 0.2, 
    shadowRadius: 4, 
    elevation: 2 
  },
  tabText: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },
  activeTabText: { color: isLight ? '#0F172A' : colors.textPrimary },
  filterNavigator: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: isLight ? '#FFFFFF' : colors.surface, 
    paddingVertical: 14, 
    paddingHorizontal: 20, 
    borderRadius: 24, 
    marginHorizontal: 20, 
    marginTop: 14, 
    marginBottom: 6,
    borderWidth: 1, 
    borderColor: isLight ? '#E2E8F0' : colors.border, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: isLight ? 0.05 : 0.15, 
    shadowRadius: 10, 
    elevation: 2 
  },
  navButton: { padding: 4 },
  dateRangeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateRangeText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  list: { padding: 20, paddingBottom: 60 },
  historyCard: { 
    backgroundColor: isLight ? '#FFFFFF' : colors.surface, 
    borderRadius: 24, 
    padding: 20, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: isLight ? '#E2E8F0' : colors.border, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: isLight ? 0.05 : 0.15, 
    shadowRadius: 10, 
    elevation: 2 
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingBottom: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: isLight ? '#F1F5F9' : colors.border 
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary, flexShrink: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontFamily: 'Inter_18pt-Bold', fontSize: 10, letterSpacing: 0.5 },
  eyeBtn: { padding: 4 },
  cardBody: { paddingTop: 14, gap: 10 },
  tableRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    paddingBottom: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: isLight ? '#F8FAFC' : colors.border 
  },
  tableLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary, width: '35%' },
  tableValue: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary, width: '65%', textAlign: 'right' },
  tableValueReason: { 
    fontFamily: 'Inter_18pt-Medium', 
    fontSize: 13, 
    color: isLight ? '#334155' : colors.textPrimary, 
    width: '65%', 
    textAlign: 'right', 
    lineHeight: 18 
  },
  attachmentBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    marginTop: 12, 
    paddingTop: 12, 
    borderTopWidth: 1, 
    borderTopColor: isLight ? '#F1F5F9' : colors.border 
  },
  attachmentText: { fontFamily: 'Inter_18pt-Bold', fontSize: 12 },
  expandedContainer: { 
    marginTop: 12, 
    paddingTop: 12, 
    borderTopWidth: 1, 
    borderTopColor: isLight ? '#F1F5F9' : colors.border, 
    gap: 8 
  },
  expandedRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    paddingBottom: 8, 
    borderBottomWidth: 1, 
    borderBottomColor: isLight ? '#F8FAFC' : colors.border 
  },
  expandedLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, width: '35%' },
  expandedValue: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#0F172A' : colors.textPrimary, width: '65%', textAlign: 'right' },
  expandedValueRemarks: { 
    fontFamily: 'Inter_18pt-Medium', 
    fontSize: 12, 
    color: isLight ? '#0F172A' : colors.textPrimary, 
    width: '65%', 
    textAlign: 'right', 
    fontStyle: 'italic', 
    lineHeight: 16 
  },
  emptyText: { fontFamily: 'Inter_18pt-Medium', textAlign: 'center', color: isLight ? '#94A3B8' : colors.textSecondary, marginTop: 50, fontSize: 14 },
  loadMoreBtn: { 
    backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, 
    padding: 14, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginTop: 10, 
    marginBottom: 20 
  },
  loadMoreText: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: colors.primary },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  calendarModalContent: { 
    backgroundColor: isLight ? '#FFFFFF' : colors.surface, 
    borderRadius: 24, 
    padding: 20, 
    width: '100%', 
    maxWidth: 400, 
    borderWidth: 1, 
    borderColor: isLight ? '#E2E8F0' : colors.border 
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
});