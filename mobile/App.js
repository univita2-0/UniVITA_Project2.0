import React, { useEffect, useState, useRef, useContext } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform, Modal, ActivityIndicator, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Calendar, Clock, User, AlertCircle } from 'lucide-react-native';
import * as TaskManager from 'expo-task-manager';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Sora_700Bold } from '@expo-google-fonts/sora'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio'; 
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

// Keep native splash screen visible initially to prevent white flashes
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

    // FIXED: Corrected endpoint from /location-tracking/ping to /instructor/location
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
  
  // --- CUSTOM SPLASH ANIMATION STATES ---
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

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
          'Sora_700Bold': Sora_700Bold, 
        });

        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status !== 'granted') console.warn('Background location permission not granted');
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) { 
        console.warn(e); 
      } finally { 
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync();

      Animated.timing(progressAnim, {
        toValue: 100,
        duration: 1500,
        useNativeDriver: false,
      }).start(() => {
        Animated.timing(splashFadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
          delay: 150
        }).start(() => {
          setShowCustomSplash(false);
        });
      });
    }
  }, [appIsReady, progressAnim, splashFadeAnim]);

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
    try {
      const authToken = await AsyncStorage.getItem('auth_token');
      if (!authToken) return; // Stop if user isn't logged in

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});

      // 🔴 Replace your old axios call with this exact route and PUT method:
      await axios.put(`${API_URL}/users/save-push-token`, 
        { token: tokenData.data }, 
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
    } catch (error) {
      // Changed to console.log so it doesn't throw a red screen for network timeouts
      console.log("Push token error:", error.message); 
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

  if (!appIsReady) {
    return null; 
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
            height: Platform.OS === 'ios' ? 85 : 65,
            paddingBottom: Platform.OS === 'ios' ? 24 : 10,
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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

      {/* CUSTOM ANIMATED SPLASH SCREEN */}
      {showCustomSplash && (
        <Animated.View style={[styles.customSplashContainer, { opacity: splashFadeAnim }]}>
          <StatusBar barStyle="light-content" backgroundColor="#020817" />
          
          <View style={styles.splashCenterContent}>
            <Text style={styles.splashBrand}>
              <Text style={{ color: '#FFFFFF' }}>Uni</Text>
              <Text style={{ color: '#0EA5E9' }}>VÍTA</Text>
            </Text>
            <Text style={styles.splashTagline}>SIMPLER  •  SMARTER  •  TOGETHER</Text>
          </View>

          <View style={styles.progressBarWrapper}>
            <View style={styles.progressBarTrack}>
              <Animated.View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%']
                    }) 
                  }
                ]} 
              />
            </View>
          </View>
        </Animated.View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  customSplashContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#020817', 
    zIndex: 99999,
    elevation: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashCenterContent: {
    alignItems: 'center',
    marginBottom: 60, 
  },
  splashBrand: {
    fontFamily: 'Sora_700Bold',
    fontSize: 54,
    letterSpacing: 2,
    marginBottom: 12,
  },
  splashTagline: {
    fontFamily: 'Inter_18pt-Medium',
    color: '#94A3B8',
    fontSize: 10,
    letterSpacing: 3,
  },
  progressBarWrapper: {
    position: 'absolute',
    bottom: 80, 
    width: '100%',
    alignItems: 'center',
  },
  progressBarTrack: {
    width: 140, 
    height: 4,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00D8D6', 
    borderRadius: 4,
  },
  
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

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}