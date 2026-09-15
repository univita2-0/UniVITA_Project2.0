// src/screens/SecurityScreen.js
import React, { useState, useContext, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard, SafeAreaView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';
import { ThemeContext, themeColors } from '../context/ThemeContext';

const PasswordField = ({ label, value, onChange, placeholder, isVisible, toggleVisible, styles, colors, isLight }) => (
  <View style={styles.inputGroup}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputWrapper}>
      <TextInput
        style={styles.flexInput}
        secureTextEntry={!isVisible}
        placeholder={placeholder}
        placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
      />
      <TouchableOpacity onPress={toggleVisible} style={styles.eyeBtn} activeOpacity={0.7}>
        {isVisible ? <EyeOff size={20} color={isLight ? "#64748B" : colors.textSecondary} /> : <Eye size={20} color={isLight ? "#64748B" : colors.textSecondary} />}
      </TouchableOpacity>
    </View>
  </View>
);

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

  const handleUpdatePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      return Alert.alert("Validation Error", "Please fill in all password fields.");
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert("Validation Error", "Your new passwords do not match.");
    }
    if (newPassword.trim().length < 6) {
      return Alert.alert("Validation Error", "Your new password must be at least 6 characters.");
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
          "Success",
          "Your password has been updated. For security reasons, you will be signed out.",
          [
            {
              text: "OK",
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
      Alert.alert("Error", error.response?.data?.message || error.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView 
          style={styles.container} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <ShieldCheck size={28} color={isLight ? "#0F172A" : "#FFFFFF"} strokeWidth={1.5} />
            </View>
            <Text style={styles.title}>Account Security</Text>
            <Text style={styles.subtitle}>Update your password regularly to keep your UniVITA account secure.</Text>
          </View>

          <View style={styles.formContainer}>
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Enter current password"
              isVisible={showCurrent}
              toggleVisible={() => setShowCurrent(!showCurrent)}
              styles={styles}
              colors={colors}
              isLight={isLight}
            />

            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="Enter new password (min. 6 chars)"
              isVisible={showNew}
              toggleVisible={() => setShowNew(!showNew)}
              styles={styles}
              colors={colors}
              isLight={isLight}
            />

            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Re-type new password"
              isVisible={showConfirm}
              toggleVisible={() => setShowConfirm(!showConfirm)}
              styles={styles}
              colors={colors}
              isLight={isLight}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleUpdatePassword}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={isLight ? "#FFFFFF" : colors.background} />
            ) : (
              <Text style={styles.btnText}>Renew Password</Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: isLight ? '#E2E8F0' : colors.iconBg, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontFamily: 'Inter_18pt-Medium', fontSize: 24, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
  formContainer: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginBottom: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isLight ? 0.03 : 0.1, shadowRadius: 12, elevation: 2 },
  inputGroup: { marginBottom: 20 },
  label: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, marginBottom: 8, color: isLight ? '#475569' : colors.textPrimary },
  inputWrapper: { flexDirection: 'row', backgroundColor: isLight ? '#F8FAFC' : colors.background, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, alignItems: 'center', overflow: 'hidden' },
  flexInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, fontFamily: 'Inter_18pt-Regular', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary },
  eyeBtn: { padding: 14 },
  btn: { backgroundColor: isLight ? '#0F172A' : colors.buttonBg, paddingVertical: 18, borderRadius: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isLight ? 0.1 : 0.3, shadowRadius: 8, elevation: 4 },
  btnDisabled: { backgroundColor: isLight ? '#94A3B8' : colors.iconBg, shadowOpacity: 0, elevation: 0 },
  btnText: { fontFamily: 'Inter_18pt-Medium', color: isLight ? '#FFFFFF' : colors.buttonText, fontSize: 15, letterSpacing: 0.5 }
});