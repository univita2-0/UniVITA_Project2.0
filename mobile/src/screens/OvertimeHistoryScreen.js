// src/screens/OvertimeHistoryScreen.js
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Linking, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { ArrowLeft, Calendar as CalendarIcon, Clock, FileText, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, X, Eye, EyeOff } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { API_URL } from './api';

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'Not Recorded';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Not Recorded';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

const getStatusTheme = (status, isLight) => {
  const s = status?.toLowerCase();
  if (s === 'approved') return { bg: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.15)', text: isLight ? '#059669' : '#34D399' };
  if (s === 'rejected') return { bg: isLight ? '#FEE2E2' : 'rgba(248, 113, 113, 0.15)', text: isLight ? '#DC2626' : '#F87171' };
  return { bg: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.15)', text: isLight ? '#D97706' : '#FBBF24' };
};

const getScenarioLabel = (scenario) => {
  switch (scenario) {
    case 'future': return 'Future Date';
    case 'ongoing': return 'Ongoing Shift (extend)';
    case 'after_shift': return 'After Shift (extra)';
    default: return scenario || '—';
  }
};

const ITEMS_PER_PAGE = 10;

export default function OvertimeHistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [allHistory, setAllHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('pending');
  const [filterDate, setFilterDate] = useState(new Date());
  const [page, setPage] = useState(1);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/overtime-requests`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await res.json();
      setAllHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setAllHistory([]);
    } finally { setLoading(false); }
  };

  const openAttachment = (url) => { if (url) Linking.openURL(url); };

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
    return s === 'approved' || s === 'rejected';
  });

  const filteredHistory = filteredByTab.filter(item => {
    const dateStr = item.date || item.request_date || '';
    if (!dateStr) return false;
    const safeDateString = dateStr.substring(0, 10);
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
          <Text style={styles.headerTitle}>Overtime History</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 'pending' && styles.activeTab]} onPress={() => {setActiveTab('pending'); setPage(1); setExpandedId(null);}} activeOpacity={0.8}>
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'history' && styles.activeTab]} onPress={() => {setActiveTab('history'); setPage(1); setExpandedId(null);}} activeOpacity={0.8}>
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
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const rawDate = item.date || item.request_date || '';
            const displayDate = rawDate ? rawDate.substring(0, 10) : '—';
            const statusTheme = getStatusTheme(item.status, isLight);
            const isExpanded = expandedId === item.id;

            return (
              <View style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <CalendarIcon size={18} color={colors.primary} strokeWidth={2} />
                  <Text style={styles.date}>{displayDate}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusTheme.bg }]}>
                    <Text style={[styles.statusText, { color: statusTheme.text }]}>{item.status?.toUpperCase() || 'PENDING'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleExpand(item.id)} style={styles.eyeBtn}>
                    {isExpanded ? <EyeOff size={20} color={colors.primary} /> : <Eye size={20} color={isLight ? "#94A3B8" : colors.textSecondary} />}
                  </TouchableOpacity>
                </View>

                <View style={styles.cardRow}>
                  <Clock size={16} color={isLight ? "#64748B" : colors.textSecondary} />
                  <Text style={styles.time}>{formatTo12Hour(item.start_time)} – {formatTo12Hour(item.end_time)}</Text>
                </View>

                <View style={styles.cardRow}>
                  <AlertCircle size={16} color={isLight ? "#64748B" : colors.textSecondary} />
                  <Text style={styles.scenario}>{getScenarioLabel(item.scenario_type)}</Text>
                </View>

                {item.reason && <Text style={styles.reason}>{item.reason}</Text>}

                {item.processed === 1 && (
                  <View style={styles.processedBadge}>
                    <CheckCircle size={12} color="#059669" />
                    <Text style={styles.processedText}>Processed via Payroll</Text>
                  </View>
                )}

                {item.attachment && (
                  <TouchableOpacity style={styles.attachmentButton} onPress={() => openAttachment(`${API_URL.replace('/api', '')}${item.attachment}`)}>
                    <FileText size={16} color={colors.primary} />
                    <Text style={styles.attachmentText}>View Attachment Proof</Text>
                  </TouchableOpacity>
                )}

                {isExpanded && (
                  <View style={styles.expandedContainer}>
                    <View style={styles.expandedRow}>
                      <Text style={styles.expandedLabel}>Submitted On:</Text>
                      <Text style={styles.expandedValue}>{formatDateTime(item.created_at || item.submitted_at)}</Text>
                    </View>
                    {(item.status?.toLowerCase() !== 'pending') && (
                      <View style={styles.expandedRow}>
                        <Text style={styles.expandedLabel}>
                          {item.status?.toLowerCase() === 'approved' ? 'Approved On:' : 'Rejected On:'}
                        </Text>
                        <Text style={styles.expandedValue}>{formatDateTime(item.reviewed_at || item.updated_at || item.processed_at)}</Text>
                      </View>
                    )}
                    {(item.admin_remarks || item.admin_notes) && (
                       <View style={styles.expandedRow}>
                         <Text style={styles.expandedLabel}>Remarks:</Text>
                         <Text style={styles.expandedValue}>{item.admin_remarks || item.admin_notes}</Text>
                       </View>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No {activeTab === 'pending' ? 'pending' : 'past'} requests found for {monthYearString}.</Text>}
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

      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: isLight ? '#E2E8F0' : colors.border, backgroundColor: isLight ? '#FFFFFF' : colors.surface },
  backButton: { padding: 4 },
  headerTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary },
  tabContainer: { flexDirection: 'row', marginHorizontal: 22, marginTop: 16, backgroundColor: isLight ? '#F1F5F9' : colors.surface, borderRadius: 20, padding: 6, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  activeTab: { backgroundColor: isLight ? '#FFFFFF' : colors.iconBg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.2, shadowRadius: 4, elevation: 2 },
  tabText: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },
  activeTabText: { color: isLight ? '#0F172A' : colors.textPrimary },
  filterNavigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isLight ? '#FFFFFF' : colors.surface, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 24, marginBottom: 4, marginHorizontal: 22, marginTop: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.2, shadowRadius: 10, elevation: 2 },
  navButton: { padding: 4 },
  dateRangeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateRangeText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  list: { padding: 22, paddingBottom: 60 },
  historyCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.15, shadowRadius: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  date: { flex: 1, fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  time: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#334155' : colors.textPrimary },
  scenario: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary },
  reason: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary, marginTop: 10, backgroundColor: isLight ? '#F1F5F9' : colors.background, padding: 12, borderRadius: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontFamily: 'Inter_18pt-Bold', fontSize: 10, letterSpacing: 0.5 },
  eyeBtn: { padding: 4, marginLeft: 4 },
  processedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isLight ? '#D1FAE5' : 'rgba(52, 211, 153, 0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginTop: 12, alignSelf: 'flex-start' },
  processedText: { fontFamily: 'Inter_18pt-Bold', fontSize: 11, color: isLight ? '#059669' : '#34D399' },
  attachmentButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: isLight ? '#F1F5F9' : colors.border, justifyContent: 'center' },
  attachmentText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: colors.primary },
  expandedContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: isLight ? '#F1F5F9' : colors.border },
  expandedRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  expandedLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  expandedValue: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#0F172A' : colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: 10 },
  emptyText: { fontFamily: 'Inter_18pt-Medium', textAlign: 'center', color: isLight ? '#94A3B8' : colors.textSecondary, marginTop: 50, fontSize: 15 },
  loadMoreBtn: { backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  loadMoreText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: colors.primary },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  calendarModalContent: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 20, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
});