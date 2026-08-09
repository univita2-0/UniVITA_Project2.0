// src/screens/CalendarScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, RefreshControl,
  Modal, TouchableOpacity, FlatList, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { MapPin, Clock, Calendar as CalendarIcon, X, List, Star } from 'lucide-react-native';
import { fetchEvents } from './api';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
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
      marks[todayStr] = { selected: true, selectedColor: '#E0F2F1', selectedTextColor: '#0D9488' };

      cleanEvents.forEach(event => {
        const date = event.date.split('T')[0];
        marks[date] = { ...marks[date], marked: true, dotColor: '#0D9488' };
      });

      cleanHolidays.forEach(holiday => {
        marks[holiday.date] = { ...marks[holiday.date], marked: true, dotColor: '#DC2626' };
      });

      setMarkedDates(marks);
    } catch (error) {
      console.error("Data Load Error:", error);
    }
  }, [todayStr]);

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
        <CalendarIcon size={12} color="#6B7280" />
        <Text style={styles.modalDetailText}>{item.date?.split('T')[0] || 'Unknown date'}</Text>
      </View>
      {item.start_time && (
        <View style={styles.modalDetailRow}>
          <Clock size={12} color="#6B7280" />
          <Text style={styles.modalDetailText}>
            {item.start_time.substring(0,5)} {item.end_time ? `- ${item.end_time.substring(0,5)}` : ''}
          </Text>
        </View>
      )}
      {item.place && (
        <View style={styles.modalDetailRow}>
          <MapPin size={12} color="#6B7280" />
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
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0D9488"]} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <CalendarIcon size={24} color="#0D9488" />
            <Text style={styles.title}>Shared Calendar</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionButton} onPress={() => setShowEventsModal(true)} activeOpacity={1}>
              <List size={16} color="#374151" />
              <Text style={styles.actionButtonText}>Upcoming Events</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => setShowHolidaysModal(true)} activeOpacity={1}>
              <Star size={16} color="#DC2626" />
              <Text style={[styles.actionButtonText, { color: '#DC2626' }]}>Philippine Holidays</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Calendar
              markedDates={markedDates}
              onDayPress={onDayPress}
              theme={{
                calendarBackground: '#FFFFFF',
                todayTextColor: '#0D9488',
                arrowColor: '#111827',
                selectedDayBackgroundColor: '#0D9488',
                selectedDayTextColor: '#FFFFFF',
                textDayFontWeight: '500',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '600',
                monthTextColor: '#111827',
                textSectionTitleColor: '#6B7280',
              }}
            />
          </View>
        </ScrollView>

        {/* Static Modals (Animation removed) */}
        <Modal visible={showEventsModal} animationType="none" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Upcoming Events</Text>
                <TouchableOpacity onPress={() => setShowEventsModal(false)} activeOpacity={1}>
                  <X size={20} color="#6B7280" />
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

        <Modal visible={showHolidaysModal} animationType="none" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Philippine Holidays</Text>
                <TouchableOpacity onPress={() => setShowHolidaysModal(false)} activeOpacity={1}>
                  <X size={20} color="#6B7280" />
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

        <Modal visible={showDateModal} animationType="none" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Events on {selectedDate}</Text>
                <TouchableOpacity onPress={() => setShowDateModal(false)} activeOpacity={1}>
                  <X size={20} color="#6B7280" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#E5E7EB', gap: 6,
  },
  holidayButton: { borderColor: '#FECACA' },
  actionButtonText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, width: '100%',
    maxHeight: '80%', borderWidth: 1, borderColor: '#E5E7EB',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptyModalText: { textAlign: 'center', color: '#9CA3AF', marginVertical: 20, fontSize: 14 },
  modalEventCard: {
    backgroundColor: '#F9FAFB', padding: 16, borderRadius: 8, marginBottom: 12,
    borderLeftWidth: 4, borderLeftColor: '#0D9488', borderWidth: 1, borderColor: '#E5E7EB',
  },
  modalEventTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  modalDetailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  modalDetailText: { color: '#4B5563', fontSize: 12 },
  modalEventDesc: { marginTop: 10, color: '#6B7280', fontSize: 12, lineHeight: 18 },
  modalHolidayCard: {
    backgroundColor: '#FEF2F2', padding: 16, borderRadius: 8, marginBottom: 12,
    borderWidth: 1, borderColor: '#FECACA',
  },
  modalHolidayName: { fontSize: 15, fontWeight: '700', color: '#B91C1C', marginBottom: 4 },
  modalHolidayDate: { fontSize: 12, color: '#7F1D1D', marginBottom: 10 },
  modalHolidayBadge: {
    backgroundColor: '#FECACA', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 4, alignSelf: 'flex-start',
  },
  modalHolidayBadgeText: { fontSize: 10, fontWeight: '700', color: '#991B1B' },
});