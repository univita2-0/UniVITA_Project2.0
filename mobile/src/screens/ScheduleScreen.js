// src/screens/ScheduleScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  ActivityIndicator, RefreshControl, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock, MapPin, BookOpen, ChevronLeft, ChevronRight, Calendar as CalIcon
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchUserSchedule } from './api';

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchSchedules = useCallback(async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        const data = await fetchUserSchedule(user.employee_id);
        setSchedules(data);
      }
    } catch (err) {
      console.error('Fetch schedule error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const changeWeek = (daysOffset) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + daysOffset);
    setCurrentDate(newDate);
  };

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const getWeekRange = () => {
    const start = getStartOfWeek(currentDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${start.getFullYear()}`;
  };

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const onRefresh = () => {
    setRefreshing(true);
    fetchSchedules();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'IN PROGRESS':
        return { label: 'IN PROGRESS', color: '#B45309', bg: '#FFFBEB', border: '#FEF3C7' };
      case 'COMPLETED':
        return { label: 'COMPLETED', color: '#047857', bg: '#ECFDF5', border: '#D1FAE5' };
      default:
        return { label: 'SCHEDULED', color: '#4B5563', bg: '#F9FAFB', border: '#E5E7EB' };
    }
  };

  if (loading) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D9488" />
            <Text style={styles.loadingText}>Loading schedule...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

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
            <CalIcon size={24} color="#0D9488" />
            <Text style={styles.title}>My Schedule</Text>
          </View>

          {/* Week Navigator */}
          <View style={styles.weekNavigator}>
            <TouchableOpacity onPress={() => changeWeek(-7)} style={styles.navButton} activeOpacity={1}>
              <ChevronLeft size={20} color="#374151" />
            </TouchableOpacity>
            <View style={styles.weekRangeContainer}>
              <Text style={styles.weekRangeText}>{getWeekRange()}</Text>
            </View>
            <TouchableOpacity onPress={() => changeWeek(7)} style={styles.navButton} activeOpacity={1}>
              <ChevronRight size={20} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Daily Cards */}
          {weekDays.map((dayName, index) => {
            const startOfWeek = getStartOfWeek(currentDate);
            const targetDate = new Date(startOfWeek);
            targetDate.setDate(startOfWeek.getDate() + index);
            const targetDateStr = targetDate.toLocaleDateString('en-CA');
            const daySchedule = schedules.find(s => s.date === targetDateStr);
            const status = daySchedule?.attendance_status || 'SCHEDULED';
            const badge = getStatusBadge(status);

            return (
              <View key={dayName} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{dayName.toUpperCase()}</Text>
                  <Text style={styles.dayDate}>{targetDate.getDate()}</Text>
                </View>
                <View style={styles.dayContent}>
                  {daySchedule ? (
                    <View style={styles.scheduleItem}>
                      <View style={styles.courseHeader}>
                        <BookOpen size={16} color="#0D9488" />
                        <Text style={styles.courseText}>{daySchedule.course}</Text>
                      </View>
                      <View style={styles.detailsGrid}>
                        <View style={styles.infoRow}>
                          <Clock size={14} color="#6B7280" />
                          <Text style={styles.infoText}>
                            {daySchedule.start_time?.substring(0,5)} – {daySchedule.end_time?.substring(0,5)}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MapPin size={14} color="#6B7280" />
                          <Text style={styles.infoText}>{daySchedule.place || 'Main Campus'}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.noSchedule}>No classes scheduled</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  weekNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  navButton: { padding: 4 },
  weekRangeContainer: { flex: 1, alignItems: 'center' },
  weekRangeText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  dayName: { fontSize: 12, fontWeight: '700', color: '#4B5563', letterSpacing: 0.5 },
  dayDate: { fontSize: 14, fontWeight: '700', color: '#111827' },
  dayContent: { padding: 16 },
  noSchedule: { color: '#9CA3AF', fontSize: 13, textAlign: 'center' },
  scheduleItem: { gap: 12 },
  courseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseText: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  detailsGrid: { gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#374151' },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 4,
  },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});