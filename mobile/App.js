import { registerRootComponent } from 'expo';
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Calendar, Clock, User } from 'lucide-react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import ErrorBoundary from './ErrorBoundary';

import { API_URL } from './src/screens/api';

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

// Keep the native splash screen visible while loading resources
SplashScreen.preventAutoHideAsync();

const LOCATION_TASK_NAME = 'background-location-task';

// ---------- GLOBAL BACKGROUND LOCATION TASK ----------
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background Location Error:", error);
    return;
  }

  if (!data || !data.locations || data.locations.length === 0) {
    return;
  }

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

  useEffect(() => {
    async function prepare() {
      try {
        // Request background permissions at startup
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Background location permission not granted');
        }
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  if (!appIsReady) {
    return null;
  }

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
            <Stack.Screen name="OvertimeHistory" component={OvertimeHistoryScreen} options={{ headerTintColor: '#0D9488', headerStyle: { backgroundColor: '#FAFAFA' }, headerShadowVisible: false }} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>

      <Animated.View 
        pointerEvents="none" 
        style={[styles.splashOverlay, { opacity: fadeAnim }]} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    zIndex: 99999,
  },
});

registerRootComponent(App);