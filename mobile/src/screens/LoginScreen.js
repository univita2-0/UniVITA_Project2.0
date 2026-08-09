// src/screens/LoginScreen.js
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Modal, Keyboard, KeyboardAvoidingView, Platform, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginUser, sendOtp, verifyOtp, forgotPassword, resetPassword } from './api';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [sendingOtpResend, setSendingOtpResend] = useState(false);
  const timerRef = useRef(null);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStep, setResetStep] = useState('email'); 
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetTimer, setResetTimer] = useState(0);
  const [resetError, setResetError] = useState('');

  const startResendTimer = (setterFn) => {
    setterFn(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setterFn(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const saveSession = async (user, token) => {
    if (token) await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify({
      id: user.id,
      employee_id: user.employee_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      monthly_salary: user.monthly_salary || 0,
      work_days_per_month: user.work_days_per_month || 22,
      biometric_enabled: false
    }));
    await AsyncStorage.setItem('user_id', String(user.id));
    await AsyncStorage.setItem('user_email', user.email);
    if (user.employee_id) await AsyncStorage.setItem('employee_id', user.employee_id);
    if (user.full_name) await AsyncStorage.setItem('user_name', user.full_name);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    setLoading(true);
    const result = await loginUser(email, password);
    setLoading(false);

    if (result.success) {
      if (result.requiresPasswordReset) {
        Alert.alert(
          'Password Expired',
          'Your password is over 365 days old. You must change it now.',
          [{
            text: 'Change Now',
            onPress: async () => {
              await saveSession(result.user, null);
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main', params: { screen: 'Profile', params: { screen: 'Security' } } }]
              });
            }
          }]
        );
        return;
      }

      const emailClean = email.trim().toLowerCase();
      setEmail(emailClean);

      const otpRes = await sendOtp(emailClean);
      if (otpRes.success) {
        setOtp('');
        setShowOtpModal(true);
        startResendTimer(setResendTimer);
      } else {
        Alert.alert('Error', otpRes.message || 'Failed to send OTP');
      }
    } else {
      Alert.alert('Login Failed', result.message || 'Invalid credentials');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP');
      return;
    }
    Keyboard.dismiss();
    setVerifyingOtp(true);
    try {
      const result = await verifyOtp(email, otp);
      if (result.success && result.user) {
        await saveSession(result.user, result.token);
        setShowOtpModal(false);
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        Alert.alert('Verification Failed', result.message || 'Invalid OTP');
      }
    } catch (error) {
      Alert.alert('Error', 'Connection failed. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    setSendingOtpResend(true);
    const result = await sendOtp(email);
    setSendingOtpResend(false);
    if (result.success) {
      startResendTimer(setResendTimer);
      Alert.alert('OTP Resent', `A new code has been sent to ${email}`);
    } else {
      Alert.alert('Error', result.message || 'Failed to resend OTP');
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) {
      setResetError('Email is required');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const result = await forgotPassword(resetEmail.trim().toLowerCase());
      if (result.success) {
        setResetStep('otp');
        startResendTimer(setResetTimer);
        Alert.alert('Code Sent', `An OTP has been sent to ${resetEmail}`);
      } else {
        setResetError(result.message || 'Failed to send reset code');
      }
    } catch (err) {
      setResetError('Network error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    if (!resetOtp || resetOtp.length !== 6) {
      setResetError('Please enter the 6-digit code');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const result = await verifyOtp(resetEmail, resetOtp);
      if (result.success) {
        setResetStep('password');
        setResetOtp('');
      } else {
        setResetError(result.message || 'Invalid OTP');
      }
    } catch (err) {
      setResetError('Verification failed');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const result = await resetPassword(resetEmail, resetOtp, resetNewPassword);
      if (result.success) {
        Alert.alert('Success', 'Your password has been reset. Please log in.');
        closeForgotModal();
      } else {
        setResetError(result.message || 'Password reset failed');
      }
    } catch (err) {
      setResetError('Network error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setResetStep('email');
    setResetEmail('');
    setResetOtp('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetError('');
    setResetTimer(0);
  };

  const resendResetOtp = async () => {
    if (resetTimer > 0) return;
    setResetLoading(true);
    try {
      const result = await forgotPassword(resetEmail);
      if (result.success) {
        startResendTimer(setResetTimer);
        Alert.alert('Code resent', `A new OTP was sent to ${resetEmail}`);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not resend code');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.header}>
          <Text style={styles.title}>UniVITA</Text>
          <Text style={styles.subtitle}></Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.welcome}>Personnel Login</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="employee@hct.edu.ph"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.forgotLink} onPress={() => setShowForgotModal(true)} activeOpacity={1}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.signInButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={1}
          >
            {loading ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.signInText}>Sign In</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Login OTP Modal */}
      <Modal visible={showOtpModal} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Authentication Required</Text>
            <Text style={styles.modalSubtitle}>We sent a 6‑digit code to {email}</Text>
            <TextInput
              style={styles.otpInput}
              placeholder="000000"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              autoFocus
              textAlign="center"
            />
            <TouchableOpacity
              style={[styles.modalButton, verifyingOtp && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={verifyingOtp}
              activeOpacity={1}
            >
              <Text style={styles.modalButtonText}>{verifyingOtp ? 'Verifying...' : 'Verify Identity'}</Text>
            </TouchableOpacity>
            
            <View style={styles.modalFooterActions}>
              {resendTimer > 0 ? (
                <Text style={styles.timerText}>Resend code in {resendTimer}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResendOtp} disabled={sendingOtpResend} activeOpacity={1}>
                  <Text style={styles.resendLink}>{sendingOtpResend ? 'Sending...' : 'Resend code'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowOtpModal(false)} activeOpacity={1}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Forgot Password Modal */}
      <Modal visible={showForgotModal} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Password Recovery</Text>

            {resetStep === 'email' && (
              <>
                <Text style={styles.modalSubtitle}>Enter your registered email address.</Text>
                <TextInput
                  style={styles.resetInput}
                  placeholder="employee@hct.edu.ph"
                  placeholderTextColor="#9CA3AF"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
                <TouchableOpacity style={styles.modalButton} onPress={handleForgotPassword} disabled={resetLoading} activeOpacity={1}>
                  <Text style={styles.modalButtonText}>{resetLoading ? 'Processing...' : 'Request Reset'}</Text>
                </TouchableOpacity>
              </>
            )}

            {resetStep === 'otp' && (
              <>
                <Text style={styles.modalSubtitle}>Enter the 6‑digit code sent to your email.</Text>
                <TextInput
                  style={styles.otpInput}
                  placeholder="000000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={resetOtp}
                  onChangeText={setResetOtp}
                  textAlign="center"
                />
                {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
                <TouchableOpacity style={styles.modalButton} onPress={handleVerifyResetOtp} disabled={resetLoading} activeOpacity={1}>
                  <Text style={styles.modalButtonText}>{resetLoading ? 'Verifying...' : 'Verify Code'}</Text>
                </TouchableOpacity>
                <View style={styles.modalFooterActions}>
                  {resetTimer > 0 ? (
                    <Text style={styles.timerText}>Resend code in {resetTimer}s</Text>
                  ) : (
                    <TouchableOpacity onPress={resendResetOtp} activeOpacity={1}>
                      <Text style={styles.resendLink}>Resend code</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {resetStep === 'password' && (
              <>
                <Text style={styles.modalSubtitle}>Create a new, secure password.</Text>
                <TextInput
                  style={styles.resetInput}
                  secureTextEntry
                  placeholder="New password (min. 6 chars)"
                  placeholderTextColor="#9CA3AF"
                  value={resetNewPassword}
                  onChangeText={setResetNewPassword}
                />
                <TextInput
                  style={styles.resetInput}
                  secureTextEntry
                  placeholder="Confirm new password"
                  placeholderTextColor="#9CA3AF"
                  value={resetConfirmPassword}
                  onChangeText={setResetConfirmPassword}
                />
                {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
                <TouchableOpacity style={styles.modalButton} onPress={handleResetPassword} disabled={resetLoading} activeOpacity={1}>
                  <Text style={styles.modalButtonText}>{resetLoading ? 'Resetting...' : 'Save Password'}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={closeForgotModal} style={{ marginTop: 20 }} activeOpacity={1}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0F172A' },
  keyboardView: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600' },
  
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 30, paddingHorizontal: 20 },
  welcome: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 24, textAlign: 'center' },
  
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrapper: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, backgroundColor: '#FFFFFF' },
  input: { height: 46, paddingHorizontal: 14, fontSize: 15, color: '#111827' },
  
  forgotLink: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 24 },
  forgotText: { color: '#0D9488', fontSize: 13, fontWeight: '600' },
  
  signInButton: { backgroundColor: '#0D9488', height: 46, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  signInText: { color: 'white', fontSize: 15, fontWeight: '700' },
  buttonDisabled: { backgroundColor: '#9CA3AF' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 24, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  
  otpInput: { width: '100%', height: 50, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 16, fontSize: 22, fontWeight: '700', letterSpacing: 8, backgroundColor: '#F9FAFB', marginBottom: 20, color: '#111827' },
  resetInput: { width: '100%', height: 46, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 14, fontSize: 14, backgroundColor: '#F9FAFB', color: '#111827', marginBottom: 16 },
  
  modalButton: { backgroundColor: '#0D9488', width: '100%', height: 46, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  modalButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  
  modalFooterActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, width: '100%' },
  timerText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  resendLink: { color: '#0D9488', fontSize: 13, fontWeight: '600' },
  cancelText: { color: '#6B7280', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  errorText: { color: '#DC2626', fontSize: 12, marginBottom: 12, textAlign: 'center', fontWeight: '500' },
});