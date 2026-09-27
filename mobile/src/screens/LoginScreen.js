// src/screens/LoginScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Modal, Keyboard, KeyboardAvoidingView, Platform, StatusBar, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import axios from 'axios';
import { loginUser, sendOtp, verifyOtp, verifyResetOtp, forgotPassword, resetPassword, API_URL } from './api';
import { AlertCircle, CheckCircle2, Eye, EyeOff, CheckSquare, Square } from 'lucide-react-native';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);

  // --- Custom Animated Toast State ---
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error'); 
  const toastAnim = useRef(new Animated.Value(-150)).current; 

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [sendingOtpResend, setSendingOtpResend] = useState(false);
  const timerRef = useRef(null);

  // --- Password Recovery Flow States ---
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStep, setResetStep] = useState('email'); 
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetTimer, setResetTimer] = useState(0);

  // Check remembered email on mount
  useEffect(() => {
    const loadRemembered = async () => {
      try {
        const rememberedEmail = await AsyncStorage.getItem('@remembered_email');
        if (rememberedEmail) {
          setEmail(rememberedEmail);
          setStayLoggedIn(true);
        }
      } catch (e) {}
    };
    loadRemembered();
  }, []);

  const showToast = (message, type = 'error') => {
    setToastMessage(message);
    setToastType(type);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: Platform.OS === 'ios' ? 65 : 45, duration: 400, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(toastAnim, { toValue: -150, duration: 400, useNativeDriver: true })
    ]).start();
  };

  const renderToast = () => (
    <Animated.View style={[styles.toastContainer, { 
        transform: [{ translateY: toastAnim }],
        backgroundColor: toastType === 'error' ? '#EF4444' : '#10B981'
      }]}>
      {toastType === 'error' ? <AlertCircle size={22} color="#FFF" /> : <CheckCircle2 size={22} color="#FFF" />}
      <Text style={styles.toastText}>{toastMessage}</Text>
    </Animated.View>
  );

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

  const registerDeviceForPushNotifications = async (authToken) => {
    try {
      if (typeof Notifications !== 'undefined') {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;

        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
        
        if (tokenData && tokenData.data) {
          await axios.put(`${API_URL}/users/save-push-token`, { token: tokenData.data }, {
            headers: { Authorization: `Bearer ${authToken}` }
          });
        }
      }
    } catch (error) {
      console.log("Push token registration error after login:", error);
    }
  };

  const saveSession = async (user, token) => {
    if (token) {
      await AsyncStorage.setItem('auth_token', token);
      await registerDeviceForPushNotifications(token);
    }
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

    if (stayLoggedIn) {
      await AsyncStorage.setItem('@remembered_email', user.email);
    } else {
      await AsyncStorage.removeItem('@remembered_email');
    }
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    
    // Enhanced Validation
    if (!email.trim() || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showToast('Please enter a valid email address format', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }

    setLoading(true);
    const result = await loginUser(email.trim(), password);
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
        showToast('OTP sent to your email', 'success');
      } else {
        showToast(otpRes.message || 'Failed to send OTP', 'error');
      }
    } else {
      showToast(result.message || 'Invalid credentials', 'error');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      showToast('Please enter the 6-digit OTP', 'error');
      return;
    }
    Keyboard.dismiss();
    setVerifyingOtp(true);
    try {
      const result = await verifyOtp(email, otp);
      if (result.success && result.user) {
        if (result.user.role !== 'instructor') {
          showToast('Mobile access is restricted to instructors only. Admin accounts are for web access only.', 'error');
          setVerifyingOtp(false);
          return;
        }

        await saveSession(result.user, result.token);
        setShowOtpModal(false);
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        showToast(result.message || 'Invalid OTP', 'error');
      }
    } catch (error) {
      showToast('Connection failed. Please try again.', 'error');
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
      showToast(`A new code has been sent`, 'success');
    } else {
      showToast(result.message || 'Failed to resend OTP', 'error');
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) {
      showToast('Email is required', 'error');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      showToast('Email invalid', 'error');
      return;
    }
    setResetLoading(true);
    try {
      const result = await forgotPassword(resetEmail.trim().toLowerCase());
      if (result.success) {
        setResetStep('otp');
        startResendTimer(setResetTimer);
        showToast('Verification code sent to your email', 'success');
      } else {
        showToast(result.message || 'No account found with this email', 'error');
      }
    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyRecoveryOtp = async () => {
    if (!resetOtp || resetOtp.length !== 6) {
      showToast('Please enter the 6-digit OTP code', 'error');
      return;
    }

    setResetLoading(true);
    try {
      const result = await verifyResetOtp(resetEmail, resetOtp);
      if (result.success) {
        setResetStep('new-password');
        showToast('OTP verified successfully', 'success');
      } else {
        showToast(result.message || 'Invalid OTP', 'error');
      }
    } catch (err) {
      showToast('Invalid OTP or network error', 'error');
    } finally {
      setResetLoading(false);
    }
  };
  
  const handleResetPassword = async () => {
    if (
      !resetNewPassword || 
      resetNewPassword.length < 8 || 
      !/[A-Z]/.test(resetNewPassword) || 
      !/[!@#$%^&*(),.?":{}|<>]/.test(resetNewPassword)
    ) {
      showToast('Password must be at least 8 chars, contain 1 uppercase & 1 special char', 'error');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    
    setResetLoading(true);
    try {
      const result = await resetPassword(resetEmail, resetOtp, resetNewPassword);
      if (result.success) {
        showToast('Password reset successfully!', 'success');
        closeForgotModal();
      } else {
        showToast(result.message || 'Password reset failed', 'error');
      }
    } catch (err) {
      showToast('Network error. Please try again.', 'error');
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
    setResetTimer(0);
  };

  const resendResetOtp = async () => {
    if (resetTimer > 0) return;
    setResetLoading(true);
    try {
      const result = await forgotPassword(resetEmail);
      if (result.success) {
        startResendTimer(setResetTimer);
        showToast('A new OTP was sent', 'success');
      } else {
        showToast(result.message, 'error');
      }
    } catch (err) {
      showToast('Could not resend code', 'error');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#060913" />

      {!(showOtpModal || showForgotModal) && renderToast()}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.containerInner}>
          
          <View style={styles.header}>
            <Text style={styles.brandTitle}>
              <Text style={{ color: '#FFFFFF' }}>Uni</Text>
              <Text style={{ color: '#0EA5E9' }}>VÍTA</Text>
            </Text>
            <Text style={styles.brandSubtitle}>Welcome back!</Text>
            <View style={styles.headerDivider} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeaderTitle}>LOGIN</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="employee@example.com"
                  placeholderTextColor="#475569"
                  value={email}
                  onChangeText={(text) => setEmail(text)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={[styles.inputWrapper, { flexDirection: 'row', alignItems: 'center' }]}>
                <TextInput
                  style={[styles.input, { flex: 1, height: 50, borderWidth: 0, backgroundColor: 'transparent' }]}
                  secureTextEntry={!showPassword}
                  placeholder="******"
                  placeholderTextColor="#475569"
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ paddingRight: 14 }} activeOpacity={0.7}>
                  {showPassword ? <EyeOff size={20} color="#64748B" /> : <Eye size={20} color="#64748B" />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Stay Logged In Checkbox & Forgot Password Row */}
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.checkboxRow} onPress={() => setStayLoggedIn(!stayLoggedIn)} activeOpacity={0.8}>
                {stayLoggedIn ? <CheckSquare size={18} color="#0EA5E9" /> : <Square size={18} color="#64748B" />}
                <Text style={styles.checkboxLabel}>Stay logged in</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowForgotModal(true)} activeOpacity={0.8}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.signInButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? <ActivityIndicator color="#060913" size="small" /> : <Text style={styles.signInText}>LOGIN</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Login OTP Modal */}
      <Modal visible={showOtpModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          {renderToast()}
          
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verification Required</Text>
            <Text style={styles.modalSubtitle}>Enter the 6-digit security code sent to your email.</Text>
            <TextInput
              style={styles.otpInput}
              placeholder="000000"
              placeholderTextColor="#64748B"
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
              activeOpacity={0.8}
            >
              <Text style={styles.modalButtonText}>{verifyingOtp ? 'Verifying...' : 'Verify Code'}</Text>
            </TouchableOpacity>
            
            <View style={styles.modalFooterActions}>
              {resendTimer > 0 ? (
                <Text style={styles.timerText}>Resend code in {resendTimer}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResendOtp} disabled={sendingOtpResend} activeOpacity={0.8}>
                  <Text style={styles.resendLink}>{sendingOtpResend ? 'Sending...' : 'Resend code'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowOtpModal(false)} activeOpacity={0.8}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Password Recovery Modal */}
      <Modal visible={showForgotModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          {renderToast()}

          <View style={styles.modalCard}>
            {resetStep === 'email' && (
              <>
                <Text style={styles.modalTitle}>Password Recovery</Text>
                <Text style={styles.modalSubtitle}>Enter your registered instructor email address.</Text>
                <TextInput
                  style={styles.resetInput}
                  placeholder="Enter your Email"
                  placeholderTextColor="#475569"
                  value={resetEmail}
                  onChangeText={(text) => setResetEmail(text.trim())}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                />
                <TouchableOpacity style={styles.modalButton} onPress={handleForgotPassword} disabled={resetLoading} activeOpacity={0.8}>
                  <Text style={styles.modalButtonText}>{resetLoading ? 'Sending...' : 'Send Code'}</Text>
                </TouchableOpacity>
              </>
            )}

            {resetStep === 'otp' && (
              <>
                <Text style={styles.modalTitle}>Enter OTP Code</Text>
                <Text style={styles.modalSubtitle}>
                  Enter the 6-digit code sent to <Text style={{ fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF' }}>{resetEmail}</Text>.
                </Text>
                <TextInput
                  style={styles.otpInput}
                  placeholder="000000"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={resetOtp}
                  onChangeText={setResetOtp}
                  autoFocus
                  textAlign="center"
                />
                <TouchableOpacity style={styles.modalButton} onPress={handleVerifyRecoveryOtp} disabled={resetLoading} activeOpacity={0.8}>
                  <Text style={styles.modalButtonText}>{resetLoading ? 'Validating...' : 'Verify Code'}</Text>
                </TouchableOpacity>

                <View style={styles.modalFooterActions}>
                  {resetTimer > 0 ? (
                    <Text style={styles.timerText}>Resend in {resetTimer}s</Text>
                  ) : (
                    <TouchableOpacity onPress={resendResetOtp} activeOpacity={0.8}>
                      <Text style={styles.resendLink}>Resend code</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {resetStep === 'new-password' && (
              <>
                <Text style={styles.modalTitle}>Create New Password</Text>
                <Text style={styles.modalSubtitle}>Enter and confirm your new secure password.</Text>
                <TextInput
                  style={styles.resetInput}
                  secureTextEntry
                  placeholder="New password (8+ chars, 1 upper, 1 special)"
                  placeholderTextColor="#475569"
                  value={resetNewPassword}
                  onChangeText={setResetNewPassword}
                  autoFocus
                />
                <TextInput
                  style={styles.resetInput}
                  secureTextEntry
                  placeholder="Confirm new password"
                  placeholderTextColor="#475569"
                  value={resetConfirmPassword}
                  onChangeText={setResetConfirmPassword}
                />
                <TouchableOpacity style={styles.modalButton} onPress={handleResetPassword} disabled={resetLoading} activeOpacity={0.8}>
                  <Text style={styles.modalButtonText}>{resetLoading ? 'Updating System...' : 'Update Password'}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={closeForgotModal} style={{ marginTop: 16 }} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#060913' },
  keyboardView: { flex: 1, justifyContent: 'center' },
  containerInner: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: 24 },
  
  toastContainer: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: '90%',
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    zIndex: 999999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 15, 
  },
  toastText: {
    fontFamily: 'Inter_18pt-Bold',
    color: '#FFF',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },

  header: { alignItems: 'center', marginBottom: 36 },
  brandTitle: { fontFamily: 'Sora_700Bold', fontSize: 36, color: '#FFFFFF', letterSpacing: 1.5, textAlign: 'center' },
  brandSubtitle: { fontFamily: 'Inter_18pt-Regular', fontSize: 15, color: '#94A3B8', marginTop: 6, letterSpacing: 0.5, textAlign: 'center' },
  headerDivider: { width: '85%', height: 1, backgroundColor: '#1E293B', marginTop: 24 },
  
  card: { width: '100%' },
  cardHeaderTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 22, color: '#FFFFFF', marginBottom: 28, textAlign: 'center', letterSpacing: 1 },
  
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: '#94A3B8', marginBottom: 8 },
  inputWrapper: { borderWidth: 1, borderColor: '#1E293B', borderRadius: 10, backgroundColor: '#0B132B' },
  input: { fontFamily: 'Inter_18pt-Regular', height: 52, paddingHorizontal: 16, fontSize: 15, color: '#FFFFFF' },
  
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, marginTop: 2 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxLabel: { fontFamily: 'Inter_18pt-Medium', color: '#94A3B8', fontSize: 13 },
  
  forgotText: { fontFamily: 'Inter_18pt-Medium', color: '#FFFFFF', fontSize: 13 },
  
  signInButton: { backgroundColor: '#FFFFFF', height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  signInText: { fontFamily: 'Inter_18pt-Black', color: '#060913', fontSize: 16, letterSpacing: 1 },
  buttonDisabled: { backgroundColor: '#475569', shadowOpacity: 0 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(6, 9, 19, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#0B132B', borderWidth: 1, borderColor: '#1E293B', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 15, elevation: 10 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  
  otpInput: { width: '100%', height: 52, borderWidth: 1, borderColor: '#1E293B', borderRadius: 12, paddingHorizontal: 16, fontFamily: 'Inter_18pt-Bold', fontSize: 24, letterSpacing: 8, backgroundColor: '#060913', marginBottom: 20, color: '#FFFFFF' },
  resetInput: { width: '100%', height: 48, borderWidth: 1, borderColor: '#1E293B', borderRadius: 12, paddingHorizontal: 16, fontFamily: 'Inter_18pt-Regular', fontSize: 14, backgroundColor: '#060913', color: '#FFFFFF', marginBottom: 16 },
  
  modalButton: { backgroundColor: '#FFFFFF', width: '100%', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalButtonText: { fontFamily: 'Inter_18pt-Bold', color: '#060913', fontSize: 14 },
  
  modalFooterActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, width: '100%' },
  timerText: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: '#94A3B8' },
  resendLink: { fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF', fontSize: 13 },
  cancelText: { fontFamily: 'Inter_18pt-Medium', color: '#94A3B8', fontSize: 13, textAlign: 'center', width: '100%' },
});