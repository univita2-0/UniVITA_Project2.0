import { registerRootComponent } from 'expo';
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Calendar, Clock, User, AlertCircle } from 'lucide-react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import axios from 'axios';
import ErrorBoundary from './ErrorBoundary';

import { API_URL, fetchEmergencyAlerts, markAlertAsRead } from './src/screens/api';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SecurityScreen from './src/screens/SecurityScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import RequestsScreen from './src/screens/RequestsScreen';
import MyPayrollScreen from './src/screens/MyPayrollScreen';
import LeaveHistoryScreen from './src/screens/LeaveHistoryScreen';
import ScheduleHistoryScreen from './src/screens/ScheduleHistoryScreen';
import AppealHistoryScreen from './src/screens/AppealHistoryScreen';
import OvertimeHistoryScreen from './src/screens/OvertimeHistoryScreen';
import CorrectionHistoryScreen from './src/screens/CorrectionHistoryScreen'; 

// Keep the native splash screen visible while loading resources
SplashScreen.preventAutoHideAsync();

const LOCATION_TASK_NAME = 'background-location-task';

// ---------- GLOBAL BACKGROUND LOCATION TASK ----------
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background Location Error:", error);
    return;
  }
  if (!data || !data.locations || data.locations.length === 0) return;

  const location = data.locations[0];
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    const token = await AsyncStorage.getItem('auth_token');
    if (!token) return;

    await fetch(`${API_URL}/instructor/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        location_enabled: true
      }),
    });
  } catch (err) {
    console.error("Failed to send background ping:", err.message);
  }
});

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerTintColor: '#0D9488',
        headerTitleAlign: 'center',
        headerBackTitleVisible: false,
        headerStyle: { backgroundColor: '#FAFAFA' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Security" component={SecurityScreen} options={{ title: 'Security & Password' }} />
      <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: 'Emergency Alerts' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0D9488',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: { 
          height: 65, 
          paddingBottom: 8, 
          paddingTop: 8, 
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          elevation: 0,
          shadowOpacity: 0
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color }) => <Home size={22} color={color} /> }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ tabBarIcon: ({ color }) => <Calendar size={22} color={color} /> }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ tabBarIcon: ({ color }) => <Clock size={22} color={color} /> }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User size={22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Global Alert States
  const [userId, setUserId] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  const alertSound = useRef(null);
  const activeAlertId = useRef(null);

  // 1. Constantly check session user status
  useEffect(() => {
    const checkUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem('user');
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          setUserId(parsed.employee_id || parsed.id);
        } else {
          setUserId(null);
        }
      } catch (e) {}
    };
    checkUser();
    const interval = setInterval(checkUser, 3000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch Push Token
  useEffect(() => {
    const registerPushToken = async () => {
      if (!userId) return;
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;

        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
        
        if (tokenData && tokenData.data) {
          const authToken = await AsyncStorage.getItem('auth_token');
          await axios.put(`${API_URL}/users/save-push-token`, { token: tokenData.data }, {
            headers: { Authorization: `Bearer ${authToken}` }
          });
        }
      } catch (error) { console.log("Push token error:", error); }
    };
    registerPushToken();
  }, [userId]);

  // 3. Global Alert Polling across all tabs
  useEffect(() => {
    if (!userId) return;

    const loadAlerts = async () => {
      try {
        const alerts = await fetchEmergencyAlerts(userId);
        const unreadAlerts = alerts.filter(a => !a.read_at);
        
        if (unreadAlerts.length > 0 && activeAlertId.current !== unreadAlerts[0].id) {
          setAlertQueue(unreadAlerts);
          showNextAlert(unreadAlerts[0]);
        }
      } catch (err) { console.error('Global alert fetch failed', err); }
    };

    loadAlerts();
    const intervalId = setInterval(loadAlerts, 10000);
    return () => clearInterval(intervalId);
  }, [userId]);

  const showNextAlert = async (alert) => {
    activeAlertId.current = alert.id;
    setCurrentAlert(alert);
    setShowAlertModal(true);

    if (alert.severity === 'critical') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else if (alert.severity === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      if (alertSound.current) {
        await alertSound.current.stopAsync();
        await alertSound.current.unloadAsync();
        alertSound.current = null;
      }

      let soundSource;
      if (alert.severity === 'critical') soundSource = require('./assets/critical.mp3'); 
      else if (alert.severity === 'warning') soundSource = require('./assets/warning.mp3'); 
      else soundSource = require('./assets/info.mp3'); 
      
      const { sound } = await Audio.Sound.createAsync(soundSource);
      alertSound.current = sound;
      
      await sound.setIsLoopingAsync(true);
      await sound.playAsync();
    } catch (error) { console.log("Error playing alert sound:", error); }
  };

  const dismissAlert = async () => {
    if (alertSound.current) {
      try {
        await alertSound.current.stopAsync();
        await alertSound.current.unloadAsync();
        alertSound.current = null;
      } catch (error) {}
    }

    if (currentAlert && userId) {
      await markAlertAsRead(currentAlert.id, userId);
      const newQueue = alertQueue.filter(a => a.id !== currentAlert.id);
      setAlertQueue(newQueue);
      setShowAlertModal(false);
      
      if (newQueue.length > 0) showNextAlert(newQueue[0]);
      else activeAlertId.current = null;
    } else {
      setShowAlertModal(false);
      activeAlertId.current = null;
    }
  };

  useEffect(() => {
    async function prepare() {
      try {
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status !== 'granted') console.warn('Background location permission not granted');
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (e) { console.warn(e); } 
      finally { setAppIsReady(true); }
    }
    prepare();
  }, []);

  const onLayoutRootView = async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  };

  if (!appIsReady) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFAFA' } }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Requests" component={RequestsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MyPayroll" component={MyPayrollScreen} options={{ headerShown: true, title: 'My Payroll', headerTintColor: '#0D9488', headerStyle: { backgroundColor: '#FAFAFA' }, headerShadowVisible: false }} />
            <Stack.Screen name="LeaveHistory" component={LeaveHistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ScheduleHistory" component={ScheduleHistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AppealHistory" component={AppealHistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CorrectionHistory" component={CorrectionHistoryScreen} options={{ headerShown: false }} /> 
            <Stack.Screen name="OvertimeHistory" component={OvertimeHistoryScreen} options={{ headerTintColor: '#0D9488', headerStyle: { backgroundColor: '#FAFAFA' }, headerShadowVisible: false }} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>

      {/* --- GLOBAL EMERGENCY ALERT MODAL --- */}
      <Modal visible={showAlertModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.alertModal, currentAlert?.severity === 'critical' ? styles.alertCritical : currentAlert?.severity === 'warning' ? styles.alertWarning : styles.alertInfo]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <AlertCircle size={48} color={currentAlert?.severity === 'critical' ? '#DC2626' : currentAlert?.severity === 'warning' ? '#F59E0B' : '#3B82F6'} />
            </View>
            <Text style={[styles.alertHeader, { textAlign: 'center', fontSize: 14 }]}>
              {currentAlert?.severity === 'critical' ? 'CRITICAL ALERT' : currentAlert?.severity === 'warning' ? 'WARNING' : 'SYSTEM INFO'}
            </Text>
            <Text style={[styles.alertTitle, { textAlign: 'center', fontSize: 20 }]}>{currentAlert?.title}</Text>
            <Text style={[styles.alertBody, { textAlign: 'center', marginTop: 8 }]}>{currentAlert?.message}</Text>
            <View style={styles.alertActions}>
              <TouchableOpacity style={styles.btnAlertDismiss} onPress={dismissAlert}>
                <Text style={styles.btnAlertText}>Acknowledge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Animated.View pointerEvents="none" style={[styles.splashOverlay, { opacity: fadeAnim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    zIndex: 99999,
  },
  // Global Alert Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertModal: { width: '100%', borderRadius: 16, padding: 24, backgroundColor: '#FFFFFF', borderWidth: 2 },
  alertCritical: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  alertWarning: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  alertInfo: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  alertHeader: { fontWeight: '800', marginBottom: 12, color: '#111827', letterSpacing: 1 },
  alertTitle: { fontWeight: '800', color: '#111827', marginBottom: 12 },
  alertBody: { color: '#374151', lineHeight: 22, marginBottom: 20 },
  alertActions: { width: '100%', marginTop: 10 },
  btnAlertDismiss: { backgroundColor: '#111827', borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnAlertText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

registerRootComponent(App);