import React, { useRef, useState } from 'react';
import { View, Text, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../services/api';

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  const captureSelfie = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Camera permission is required to record attendance.');
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: 'front',
      quality: 0.5,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    return result.assets[0].uri;
  };

  const getLocation = async () => {
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new Error('Enable GPS to record attendance.');
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Location permission is required to record attendance.');
    }
    const reading = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, accuracy } = reading.coords || {};
    const age = Date.now() - Number(reading.timestamp);
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      (latitude === 0 && longitude === 0) ||
      !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50 ||
      !Number.isFinite(age) || age < -30000 || age > 120000 ||
      reading.mocked === true
    ) {
      throw new Error('GPS reading is invalid, inaccurate, or outdated. Try again in an open area.');
    }
    return reading;
  };

  const handleClock = async type => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const selfie = await captureSelfie();
      if (!selfie) return;
      const reading = await getLocation();
      const data = new FormData();
      data.append('selfie', { uri: selfie, name: 'attendance-selfie.jpg', type: 'image/jpeg' });
      data.append('latitude', String(reading.coords.latitude));
      data.append('longitude', String(reading.coords.longitude));
      data.append('gps_accuracy', String(reading.coords.accuracy));
      data.append('gps_timestamp', new Date(reading.timestamp).toISOString());

      const endpoint = type === 'in' ? '/attendance/clock-in' : '/attendance/clock-out';
      const response = await api.post(endpoint, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data?.success === false) {
        throw new Error(response.data.message || 'Attendance could not be recorded.');
      }
      Alert.alert('Attendance', response.data?.message || 'Attendance saved.');
    } catch (error) {
      Alert.alert('Attendance unavailable',
        error.response?.data?.message || error.response?.data?.error || error.message || 'Please try again.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <TouchableOpacity
        accessibilityRole="button"
        style={{ backgroundColor: '#0D9488', padding: 12, borderRadius: 8, marginBottom: 12, opacity: loading ? 0.6 : 1 }}
        onPress={() => handleClock('in')}
        disabled={loading}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Clock In</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        style={{ backgroundColor: '#B91C1C', padding: 12, borderRadius: 8, marginBottom: 12, opacity: loading ? 0.6 : 1 }}
        onPress={() => handleClock('out')}
        disabled={loading}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Clock Out</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator color="#0D9488" />}
      <Text style={{ textAlign: 'center', color: '#64748B', fontSize: 12 }}>
        Attendance requires a valid schedule, GPS verification, and a selfie. Approved leave restrictions are enforced by the server.
      </Text>
    </View>
  );
}
