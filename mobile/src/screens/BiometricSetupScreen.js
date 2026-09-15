// src/screens/BiometricSetupScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export default function BiometricSetupScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [hasHardware, setHasHardware] = useState(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setHasHardware(compatible);
    })();
  }, []);

  const enrollFingerprint = async () => {
    setLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Register your fingerprint for attendance',
        disableDeviceFallback: true,
      });
      if (result.success) {
        // In a real app, you would get a template hash from the device's secure hardware.
        // Here we simulate with a dummy hash.
        const dummyHash = `fp_${Date.now()}_${Math.random()}`;
        const token = await AsyncStorage.getItem('auth_token');
        const res = await api.post('/auth/biometric/enroll', { fingerprint_hash: dummyHash }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success) {
          // Update stored user
          const userStr = await AsyncStorage.getItem('user');
          const user = JSON.parse(userStr);
          user.biometric_enabled = true;
          await AsyncStorage.setItem('user', JSON.stringify(user));
          Alert.alert('Success', 'Fingerprint registered. You can now use it for clock in/out.');
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } else {
          Alert.alert('Error', res.data.message || 'Enrollment failed on server.');
        }
      } else {
        Alert.alert('Failed', 'Fingerprint not registered. You can still use selfie mode.');
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } catch (err) {
      Alert.alert('Error', 'Could not enroll fingerprint. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const skip = () => {
    Alert.alert(
      'Skip Fingerprint',
      'You can still clock in/out using live selfie. You can enable fingerprint later in Profile > Security.',
      [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }]
    );
  };

  if (!hasHardware) {
    return (
      <LinearGradient colors={['#0F2027', '#203A43', '#2C5364']} style={styles.gradient}>
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>No Fingerprint Sensor</Text>
          <Text style={styles.message}>Your device does not support fingerprint authentication. You can use selfie verification for attendance.</Text>
          <TouchableOpacity style={styles.button} onPress={skip}>
            <Text style={styles.buttonText}>Continue to App</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0F2027', '#203A43', '#2C5364']} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Set Up Fingerprint</Text>
        <Text style={styles.message}>Use your fingerprint to securely clock in/out. This will be required every time you mark attendance.</Text>
        <TouchableOpacity style={styles.button} onPress={enrollFingerprint} disabled={loading}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Register Fingerprint</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipLink} onPress={skip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: '700', color: 'white', marginBottom: 16, textAlign: 'center' },
  message: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  button: { backgroundColor: '#00897B', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 30, width: '100%', alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  skipLink: { marginTop: 24 },
  skipText: { color: '#94A3B8', fontSize: 14, textDecorationLine: 'underline' },
});