// src/screens/CalendarScreen.js
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, RefreshControl,
  Modal, TouchableOpacity, FlatList, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { MapPin, Clock, Calendar as CalendarIcon, X, List, Star } from 'lucide-react-native';
import { fetchEvents } from './api';
import { ThemeContext, themeColors } from '../context/ThemeContext';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  
  // Use React.useMemo to safely generate dynamic styles 
  const styles = React.useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [events, setEvents] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [markedDates, setMarkedDates] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDateEvents, setSelectedDateEvents] = useState([]);

  const todayStr = new Date().toISOString().split('T')[0];
  const leaveCategories = ['Sick Leave', 'Vacation', 'Emergency', 'Other', 'Leave'];

  const getPHHolidays = (year) => [
    { id: `ph-${year}-1`, title: "New Year's Day", date: `${year}-01-01`, type: 'Holiday' },
    { id: `ph-${year}-2`, title: "Araw ng Kagitingan", date: `${year}-04-09`, type: 'Holiday' },
    { id: `ph-${year}-3`, title: "Labor Day", date: `${year}-05-01`, type: 'Holiday' },
    { id: `ph-${year}-4`, title: "Independence Day", date: `${year}-06-12`, type: 'Holiday' },
    { id: `ph-${year}-5`, title: "Ninoy Aquino Day", date: `${year}-08-21`, type: 'Holiday' },
    { id: `ph-${year}-6`, title: "National Heroes Day", date: `${year}-08-31`, type: 'Holiday' },
    { id: `ph-${year}-7`, title: "All Saints Day", date: `${year}-11-01`, type: 'Holiday' },
    { id: `ph-${year}-8`, title: "Bonifacio Day", date: `${year}-11-30`, type: 'Holiday' },
    { id: `ph-${year}-9`, title: "Immaculate Conception", date: `${year}-12-08`, type: 'Holiday' },
    { id: `ph-${year}-10`, title: "Christmas Day", date: `${year}-12-25`, type: 'Holiday' },
    { id: `ph-${year}-11`, title: "Rizal Day", date: `${year}-12-30`, type: 'Holiday' },
  ];

  const loadData = useCallback(async () => {
    try {
      const eventData = await fetchEvents();
      const currentYear = new Date(todayStr).getFullYear();
      const phHolidays = getPHHolidays(currentYear);

      const cleanEvents = eventData.filter(e =>
        !leaveCategories.map(c => c.toLowerCase()).includes(e.type?.toLowerCase()) &&
        !e.title?.startsWith('LEAVE:') &&
        e.date >= todayStr &&
        (e.type !== 'Holiday' || !e.id?.toString().startsWith('ph-'))
      );
      setEvents(cleanEvents);

      const cleanHolidays = phHolidays.filter(h => h.date >= todayStr);
      setHolidays(cleanHolidays);

      const marks = {};
      
      // Dynamic thematic today marker
      marks[todayStr] = { 
        selected: true, 
        selectedColor: isLight ? '#0F172A' : '#FFFFFF', 
        selectedTextColor: isLight ? '#FFFFFF' : '#060913' 
      };

      cleanEvents.forEach(event => {
        const date = event.date.split('T')[0];
        marks[date] = { ...marks[date], marked: true, dotColor: isLight ? '#0F172A' : '#FFFFFF' };
      });

      cleanHolidays.forEach(holiday => {
        marks[holiday.date] = { ...marks[holiday.date], marked: true, dotColor: '#EF4444' };
      });

      setMarkedDates(marks);
    } catch (error) {}
  }, [todayStr, isLight]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const onDayPress = (day) => {
    const date = day.dateString;
    const dayEvents = events.filter(e => e.date?.split('T')[0] === date);
    const dayHolidays = holidays.filter(h => h.date === date);
    const allItems = [...dayEvents, ...dayHolidays];
    if (allItems.length > 0) {
      setSelectedDate(date);
      setSelectedDateEvents(allItems);
      setShowDateModal(true);
    }
  };

  const renderEventItem = ({ item }) => (
    <View style={styles.modalEventCard}>
      <Text style={styles.modalEventTitle}>{item.title || 'Untitled'}</Text>
      <View style={styles.modalDetailRow}>
        <CalendarIcon size={12} color={isLight ? "#64748B" : colors.textSecondary} />
        <Text style={styles.modalDetailText}>{item.date?.split('T')[0] || 'Unknown date'}</Text>
      </View>
      {item.start_time && (
        <View style={styles.modalDetailRow}>
          <Clock size={12} color={isLight ? "#64748B" : colors.textSecondary} />
          <Text style={styles.modalDetailText}>
            {item.start_time.substring(0,5)} {item.end_time ? `- ${item.end_time.substring(0,5)}` : ''}
          </Text>
        </View>
      )}
      {item.place && (
        <View style={styles.modalDetailRow}>
          <MapPin size={12} color={isLight ? "#64748B" : colors.textSecondary} />
          <Text style={styles.modalDetailText}>{item.place}</Text>
        </View>
      )}
      <Text style={styles.modalEventDesc}>{item.description || 'No description provided.'}</Text>
    </View>
  );

  const renderHolidayItem = ({ item }) => (
    <View style={styles.modalHolidayCard}>
      <Text style={styles.modalHolidayName}>{item.title}</Text>
      <Text style={styles.modalHolidayDate}>{item.date}</Text>
      <View style={styles.modalHolidayBadge}>
        <Text style={styles.modalHolidayBadgeText}>HOLIDAY</Text>
      </View>
    </View>
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLight ? "#0F172A" : "#FFFFFF"} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <CalendarIcon size={26} color={isLight ? "#0F172A" : colors.textPrimary} strokeWidth={2} />
            <Text style={styles.title}>Shared Calendar</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionButton} onPress={() => setShowEventsModal(true)} activeOpacity={0.8}>
              <List size={16} color={isLight ? "#0F172A" : colors.textPrimary} />
              <Text style={styles.actionButtonText}>Upcoming Events</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.holidayButton]} onPress={() => setShowHolidaysModal(true)} activeOpacity={0.8}>
              <Star size={16} color="#EF4444" />
              <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Philippine Holidays</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Calendar
              markedDates={markedDates}
              onDayPress={onDayPress}
              theme={{
                calendarBackground: 'transparent',
                todayTextColor: isLight ? '#0F172A' : '#FFFFFF',
                arrowColor: isLight ? '#0F172A' : '#FFFFFF',
                dayTextColor: isLight ? '#0F172A' : '#FFFFFF',
                monthTextColor: isLight ? '#0F172A' : '#FFFFFF',
                textSectionTitleColor: isLight ? '#64748B' : '#94A3B8',
                textDayFontFamily: 'Inter_18pt-Medium',
                textMonthFontFamily: 'Inter_18pt-Bold',
                textDayHeaderFontFamily: 'Inter_18pt-Medium',
                textDayFontSize: 15,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 11,
              }}
            />
          </View>
        </ScrollView>

        {/* Static Modals */}
        <Modal visible={showEventsModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Upcoming Events</Text>
                <TouchableOpacity onPress={() => setShowEventsModal(false)} activeOpacity={0.8}>
                  <X size={24} color={isLight ? "#64748B" : colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {events.length === 0 ? (
                <Text style={styles.emptyModalText}>No upcoming events found.</Text>
              ) : (
                <FlatList
                  data={events}
                  keyExtractor={(item, idx) => (item.id ? item.id.toString() : `event-${idx}`)}
                  renderItem={renderEventItem}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          </View>
        </Modal>

        <Modal visible={showHolidaysModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Philippine Holidays</Text>
                <TouchableOpacity onPress={() => setShowHolidaysModal(false)} activeOpacity={0.8}>
                  <X size={24} color={isLight ? "#64748B" : colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {holidays.length === 0 ? (
                <Text style={styles.emptyModalText}>No upcoming holidays.</Text>
              ) : (
                <FlatList
                  data={holidays}
                  keyExtractor={item => item.id}
                  renderItem={renderHolidayItem}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          </View>
        </Modal>

        <Modal visible={showDateModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Events on {selectedDate}</Text>
                <TouchableOpacity onPress={() => setShowDateModal(false)} activeOpacity={0.8}>
                  <X size={24} color={isLight ? "#64748B" : colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={selectedDateEvents}
                keyExtractor={(item, idx) => (item.id ? item.id.toString() : `date-${idx}`)}
                renderItem={({item}) => item.type === 'Holiday' || item.id?.toString().startsWith('ph-') ? renderHolidayItem({item}) : renderEventItem({item})}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={<Text style={styles.emptyModalText}>No events scheduled.</Text>}
              />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

// DYNAMIC STYLESHEET GENERATOR
const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  scroll: { paddingHorizontal: 22, paddingBottom: 120, paddingTop: 10 },
  
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 28 },
  title: { fontFamily: 'Inter_18pt-Bold', fontSize: 26, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: -0.5 },
  
  buttonRow: { flexDirection: 'row', gap: 14, marginBottom: 24 },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: isLight ? '#FFFFFF' : colors.surface, paddingVertical: 14, borderRadius: 24,
    borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, gap: 8,
  },
  holidayButton: { borderColor: isLight ? '#FECACA' : 'rgba(239, 68, 68, 0.4)' },
  actionButtonText: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary },
  
  card: {
    backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 10,
    borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.2, shadowRadius: 10, elevation: 2
  },
  
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: {
    backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, padding: 24, width: '100%',
    maxHeight: '80%', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  emptyModalText: { fontFamily: 'Inter_18pt-Medium', textAlign: 'center', color: isLight ? '#94A3B8' : colors.textSecondary, marginVertical: 20, fontSize: 14 },
  
  modalEventCard: {
    backgroundColor: isLight ? '#F8FAFC' : colors.iconBg, padding: 18, borderRadius: 16, marginBottom: 14,
    borderLeftWidth: 4, borderLeftColor: isLight ? '#0F172A' : colors.textPrimary, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border,
  },
  modalEventTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 8 },
  modalDetailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  modalDetailText: { fontFamily: 'Inter_18pt-Medium', color: isLight ? '#64748B' : colors.textSecondary, fontSize: 13 },
  modalEventDesc: { fontFamily: 'Inter_18pt-Regular', marginTop: 12, color: isLight ? '#475569' : colors.textSecondary, fontSize: 13, lineHeight: 20 },
  
  modalHolidayCard: {
    backgroundColor: isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.1)', padding: 18, borderRadius: 16, marginBottom: 14,
    borderWidth: 1, borderColor: isLight ? '#FECACA' : 'rgba(239, 68, 68, 0.4)',
  },
  modalHolidayName: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: '#DC2626', marginBottom: 6 },
  modalHolidayDate: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: '#B91C1C', marginBottom: 14 },
  modalHolidayBadge: {
    backgroundColor: '#FECACA', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  modalHolidayBadgeText: { fontFamily: 'Inter_18pt-Bold', fontSize: 10, color: '#991B1B', letterSpacing: 0.5 },
});