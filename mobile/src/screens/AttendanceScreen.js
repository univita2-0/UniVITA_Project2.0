import React, { useState } from 'react';
import { View, Text, Alert, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(false);

  const captureSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission needed');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true });
    if (!result.canceled) return result.assets[0].uri;
    return null;
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location permission needed');
      return null;
    }
    const location = await Location.getCurrentPositionAsync({});
    return location.coords;
  };

  const handleClock = async (type) => {
    setLoading(true);
    try {
      // Always require selfie
      const selfieUri = await captureSelfie();
      if (!selfieUri) throw new Error('Selfie required');

      const coords = await getLocation();
      if (!coords) throw new Error('Location required');

      const formData = new FormData();
      formData.append('selfie', { uri: selfieUri, name: 'selfie.jpg', type: 'image/jpeg' });
      formData.append('latitude', coords.latitude);
      formData.append('longitude', coords.longitude);
      formData.append('biometric_verified', 'false'); // always false (no fingerprint)

      const endpoint = type === 'in' ? '/attendance/clock-in' : '/attendance/clock-out';
      const res = await api.post(endpoint, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      Alert.alert('Success', res.data.message);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <TouchableOpacity 
        style={{ backgroundColor: '#00897B', padding: 12, borderRadius: 8, marginBottom: 12 }}
        onPress={() => handleClock('in')} 
        disabled={loading}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Clock In</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={{ backgroundColor: '#EF4444', padding: 12, borderRadius: 8, marginBottom: 12 }}
        onPress={() => handleClock('out')} 
        disabled={loading}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Clock Out</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => alert('Request correction')}>
        <Text style={{ textAlign: 'center', color: '#00897B' }}>Forgot to clock?</Text>
      </TouchableOpacity>
    </View>
  );
}