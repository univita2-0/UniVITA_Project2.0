import React, { useEffect, useState, useRef, useContext } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform, Modal, ActivityIndicator, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Calendar, Clock, User, AlertCircle } from 'lucide-react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio'; // The new SDK 57 audio engine
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import axios from 'axios';
import ErrorBoundary from './ErrorBoundary';

import { API_URL, fetchEmergencyAlerts, markAlertAsRead } from './src/screens/api';
import { ThemeProvider, ThemeContext, themeColors } from './src/context/ThemeContext'; 

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

// Keep splash screen visible initially
SplashScreen.preventAutoHideAsync();

const LOCATION_TASK_NAME = 'background-location-task';

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

function AppContent() {
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;

  const [appIsReady, setAppIsReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const [userId, setUserId] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  const alertSound = useRef(null);
  const activeAlertId = useRef(null);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          'Inter_18pt-Regular': require('./assets/fonts/Inter_18pt-Regular.ttf'),
          'Inter_18pt-Medium': require('./assets/fonts/Inter_18pt-Medium.ttf'),
          'Inter_18pt-Bold': require('./assets/fonts/Inter_18pt-Bold.ttf'),
          'Inter_18pt-Black': require('./assets/fonts/Inter_18pt-Black.ttf'),
        });

        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status !== 'granted') console.warn('Background location permission not granted');
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (e) { 
        console.warn(e); 
      } finally { 
        setAppIsReady(true);
        // Force hide the splash screen here so it never traps you
        await SplashScreen.hideAsync(); 
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem('user');
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          const resolvedId = parsed.id || parsed.employee_id || parsed.user_id;
          setUserId(resolvedId);
        } else {
          setUserId(null);
        }
      } catch (e) {}
    };
    checkUser();
    const interval = setInterval(checkUser, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const registerPushToken = async () => {
      if (!userId) return;
      try {
        // EXPO GO PUSH NOTIFICATION BYPASS
        if (Constants.executionEnvironment === 'storeClient') {
          console.log("Push notifications safely bypassed for Expo Go testing.");
          return;
        }

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
      } catch (error) { 
        console.error("Push token error:", error); 
      }
    };
    registerPushToken();
  }, [userId]);

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
      // NEW EXPO-AUDIO LOGIC
      if (alertSound.current) {
        alertSound.current.pause();
        alertSound.current.release();
        alertSound.current = null;
      }

      let soundSource;
      if (alert.severity === 'critical') soundSource = require('./assets/critical.mp3'); 
      else if (alert.severity === 'warning') soundSource = require('./assets/warning.mp3'); 
      else soundSource = require('./assets/info.mp3'); 
      
      const sound = createAudioPlayer(soundSource);
      alertSound.current = sound;
      
      sound.loop = true;
      sound.play();
    } catch (error) { console.log("Error playing alert sound:", error); }
  };

  const dismissAlert = async () => {
    // NEW EXPO-AUDIO RELEASE
    if (alertSound.current) {
      try {
        alertSound.current.pause();
        alertSound.current.release();
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

  const onLayoutRootView = async () => {
    if (appIsReady) {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  };

  if (!appIsReady) {
    return null; // Maintain null so the native splash screen stays up until ready
  }

  function ProfileStack() {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: true,
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontFamily: 'Inter_18pt-Bold', fontSize: 16 },
          headerTitleAlign: 'center',
          headerBackTitleVisible: false,
          headerStyle: { backgroundColor: colors.surface },
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
          tabBarActiveTintColor: colors.textPrimary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: { 
            height: 65, 
            paddingBottom: 8, 
            paddingTop: 8, 
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0
          },
          tabBarLabelStyle: { fontFamily: 'Inter_18pt-Medium', fontSize: 11 },
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
        <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarIcon: ({ color }) => <Calendar size={22} color={color} /> }} />
        <Tab.Screen name="Schedule" component={ScheduleScreen} options={{ tabBarIcon: ({ color }) => <Clock size={22} color={color} /> }} />
        <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
      </Tab.Navigator>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayoutRootView}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <ErrorBoundary>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Requests" component={RequestsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MyPayroll" component={MyPayrollScreen} options={{ headerShown: true, title: 'My Payroll', headerTintColor: colors.textPrimary, headerTitleStyle: { fontFamily: 'Inter_18pt-Bold' }, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }} />
            <Stack.Screen name="LeaveHistory" component={LeaveHistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ScheduleHistory" component={ScheduleHistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AppealHistory" component={AppealHistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CorrectionHistory" component={CorrectionHistoryScreen} options={{ headerShown: false }} /> 
            <Stack.Screen name="OvertimeHistory" component={OvertimeHistoryScreen} options={{ headerTintColor: colors.textPrimary, headerTitleStyle: { fontFamily: 'Inter_18pt-Bold' }, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>

      <Modal visible={showAlertModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.alertModal, { backgroundColor: colors.surface, borderColor: colors.border }, currentAlert?.severity === 'critical' ? styles.alertCritical : currentAlert?.severity === 'warning' ? styles.alertWarning : styles.alertInfo]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <AlertCircle size={48} color={currentAlert?.severity === 'critical' ? colors.danger : currentAlert?.severity === 'warning' ? colors.warning : colors.info} />
            </View>
            <Text style={[styles.alertHeader, { color: colors.textSecondary }]}>
              {currentAlert?.severity === 'critical' ? 'CRITICAL ALERT' : currentAlert?.severity === 'warning' ? 'WARNING' : 'SYSTEM INFO'}
            </Text>
            <Text style={[styles.alertTitle, { color: colors.textPrimary }]}>{currentAlert?.title}</Text>
            <Text style={[styles.alertBody, { color: colors.textPrimary }]}>{currentAlert?.message}</Text>
            <View style={styles.alertActions}>
              <TouchableOpacity style={[styles.btnAlertDismiss, { backgroundColor: colors.buttonBg }]} onPress={dismissAlert} activeOpacity={0.8}>
                <Text style={[styles.btnAlertText, { color: colors.buttonText }]}>Acknowledge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Animated.View pointerEvents="none" style={[styles.splashOverlay, { backgroundColor: colors.background, opacity: fadeAnim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 99999 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(6, 9, 19, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertModal: { width: '100%', borderRadius: 20, padding: 24, borderWidth: 1 },
  alertCritical: { borderColor: '#F87171' },
  alertWarning: { borderColor: '#FBBF24' },
  alertInfo: { borderColor: '#60A5FA' },
  alertHeader: { fontFamily: 'Inter_18pt-Bold', textAlign: 'center', fontSize: 14, marginBottom: 12, letterSpacing: 1 },
  alertTitle: { fontFamily: 'Inter_18pt-Bold', textAlign: 'center', fontSize: 20, marginBottom: 12 },
  alertBody: { fontFamily: 'Inter_18pt-Regular', textAlign: 'center', lineHeight: 22, marginBottom: 20, marginTop: 8 },
  alertActions: { width: '100%', marginTop: 24, alignItems: 'stretch' },
  btnAlertDismiss: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnAlertText: { fontFamily: 'Inter_18pt-Bold', fontSize: 15 },
});

// Final export explicitly handled here without root registrar
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}