// src/screens/SecurityScreen.js
import React, { useState, useContext, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard, SafeAreaView, StatusBar, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, ShieldCheck, Lock, Check, X } from 'lucide-react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';
import { ThemeContext, themeColors } from '../context/ThemeContext';

export default function SecurityScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleUpdatePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      return Alert.alert("Validation Error", "Please complete all password fields.");
    }
    
    if (!hasLength || !hasUppercase || !hasSpecial) {
      return Alert.alert(
        "Security Requirement", 
        "New password must meet all security criteria: at least 8 characters, 1 uppercase letter, and 1 special character."
      );
    }
    if (currentPassword === newPassword) {
      return Alert.alert("Validation Error", "New password must differ from your current password.");
    }
    if (!passwordsMatch) {
      return Alert.alert("Validation Error", "New passwords do not match.");
    }

    setLoading(true);
    try {
      let id = await AsyncStorage.getItem('employee_id');
      if (!id) id = await AsyncStorage.getItem('user_id');

      const token = await AsyncStorage.getItem('auth_token');
      const res = await axios.put(`${API_URL}/users/${id}/update-password`, {
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim()
      }, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });

      if (res.data.success) {
        Alert.alert(
          "Security Updated",
          "Your password has been changed successfully. Please sign in again with your new credentials.",
          [
            {
              text: "Sign In",
              onPress: async () => {
                await AsyncStorage.clear();
                navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
              }
            }
          ]
        );
      } else {
        Alert.alert("Error", res.data.message || "Password update failed.");
      }
    } catch (error) {
      Alert.alert("Error", error.response?.data?.message || error.message || "Network error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            style={styles.container} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              
              

              {/* Form Card */}
              <View style={styles.formCard}>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>CURRENT PASSWORD</Text>
                  <View style={styles.inputWrapper}>
                    
                    <TextInput
                      style={styles.input}
                      secureTextEntry={!showCurrent}
                      placeholder="Enter current password"
                      placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
                      {showCurrent ? <EyeOff size={18} color={isLight ? "#64748B" : colors.textSecondary} /> : <Eye size={18} color={isLight ? "#64748B" : colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>NEW PASSWORD</Text>
                  <View style={styles.inputWrapper}>
                    
                    <TextInput
                      style={styles.input}
                      secureTextEntry={!showNew}
                      placeholder="Enter new secure password"
                      placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
                      {showNew ? <EyeOff size={18} color={isLight ? "#64748B" : colors.textSecondary} /> : <Eye size={18} color={isLight ? "#64748B" : colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.checklistContainer}>
                  <View style={styles.checkItem}>
                    {hasLength ? <Check size={14} color="#059669" /> : <X size={14} color="#94A3B8" />}
                    <Text style={[styles.checkText, hasLength && styles.checkTextPassed]}>Minimum 8 characters</Text>
                  </View>
                  <View style={styles.checkItem}>
                    {hasUppercase ? <Check size={14} color="#059669" /> : <X size={14} color="#94A3B8" />}
                    <Text style={[styles.checkText, hasUppercase && styles.checkTextPassed]}>At least 1 uppercase letter</Text>
                  </View>
                  <View style={styles.checkItem}>
                    {hasSpecial ? <Check size={14} color="#059669" /> : <X size={14} color="#94A3B8" />}
                    <Text style={[styles.checkText, hasSpecial && styles.checkTextPassed]}>At least 1 special character (!@#$%^&*...)</Text>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
                  <View style={styles.inputWrapper}>
                    
                    <TextInput
                      style={styles.input}
                      secureTextEntry={!showConfirm}
                      placeholder="Re-enter new password"
                      placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                      {showConfirm ? <EyeOff size={18} color={isLight ? "#64748B" : colors.textSecondary} /> : <Eye size={18} color={isLight ? "#64748B" : colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                  {confirmPassword.length > 0 && (
                    <Text style={[styles.matchIndicator, passwordsMatch ? styles.matchPassed : styles.matchFailed]}>
                      {passwordsMatch ? '✓ Passwords match' : '✕ Passwords do not match'}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.btn, loading && styles.btnDisabled]}
                  onPress={handleUpdatePassword}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={isLight ? "#FFFFFF" : colors.buttonText} />
                  ) : (
                    <Text style={styles.btnText}>Update Password</Text>
                  )}
                </TouchableOpacity>

              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  container: { flex: 1 },
  scrollContent: { padding: 22, paddingBottom: 40 },
  
  introBox: { alignItems: 'flex-start', marginBottom: 20, marginTop: 8, paddingHorizontal: 4 },
  shieldIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: isLight ? '#F0FDFA' : 'rgba(13, 148, 136, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isLight ? '#CCFBF1' : 'rgba(13, 148, 136, 0.3)',
    marginBottom: 10
  },
  introHeading: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 4, letterSpacing: -0.4 },
  introSub: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary, lineHeight: 18 },
  
  formCard: { 
    backgroundColor: isLight ? '#FFFFFF' : colors.surface, 
    padding: 22, 
    borderRadius: 22, 
    borderWidth: 1, 
    borderColor: isLight ? '#E2E8F0' : colors.border, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 3 }, 
    shadowOpacity: isLight ? 0.04 : 0.15, 
    shadowRadius: 10, 
    elevation: 3 
  },
  
  inputGroup: { marginBottom: 16 },
  label: { fontFamily: 'Inter_18pt-Bold', fontSize: 11, marginBottom: 6, color: isLight ? '#475569' : colors.textSecondary, letterSpacing: 0.8 },
  
  inputWrapper: { 
    flexDirection: 'row', 
    backgroundColor: isLight ? '#F8FAFC' : colors.background, 
    borderWidth: 1, 
    borderColor: isLight ? '#CBD5E1' : colors.border, 
    borderRadius: 12, 
    alignItems: 'center', 
    overflow: 'hidden' 
  },
  leftIcon: { paddingLeft: 14 },
  input: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  eyeBtn: { padding: 12 },
  
  checklistContainer: {
    backgroundColor: isLight ? '#F8FAFC' : colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    gap: 6
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  checkText: {
    fontFamily: 'Inter_18pt-Medium',
    fontSize: 12,
    color: isLight ? '#64748B' : colors.textSecondary
  },
  checkTextPassed: {
    color: isLight ? '#059669' : '#34D399',
    fontFamily: 'Inter_18pt-Bold'
  },
  
  matchIndicator: {
    fontFamily: 'Inter_18pt-Medium',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4
  },
  matchPassed: { color: isLight ? '#059669' : '#34D399' },
  matchFailed: { color: isLight ? '#DC2626' : '#F87171' },

  btn: { 
    backgroundColor: isLight ? '#0F172A' : colors.buttonBg, 
    paddingVertical: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginTop: 6, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 3 }, 
    shadowOpacity: isLight ? 0.12 : 0.3, 
    shadowRadius: 5, 
    elevation: 3 
  },
  btnDisabled: { backgroundColor: isLight ? '#94A3B8' : colors.iconBg },
  btnText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText, fontSize: 14, letterSpacing: 0.5 }
});