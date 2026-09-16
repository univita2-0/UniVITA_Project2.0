// src/screens/SecurityScreen.js
import React, { useState, useContext, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard, SafeAreaView, StatusBar, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react-native';
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

  const handleUpdatePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      return Alert.alert("Validation Error", "Please fill in all password fields.");
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert("Validation Error", "New passwords do not match.");
    }
    if (newPassword.trim().length < 8) {
      return Alert.alert("Validation Error", "New password must be at least 8 characters long.");
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
          "Password updated successfully. Please sign in again.",
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
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            style={styles.container} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.introBox}>
                
                <Text style={styles.introHeading}>Change Password</Text>
                <Text style={styles.introSub}>Ensure your account uses a secure password (min. 8 characters).</Text>
              </View>

              <View style={styles.formCard}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Current Password</Text>
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
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      secureTextEntry={!showNew}
                      placeholder="Enter new password (min. 8 chars)"
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

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm New Password</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      secureTextEntry={!showConfirm}
                      placeholder="Confirm new password"
                      placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                      {showConfirm ? <EyeOff size={18} color={isLight ? "#64748B" : colors.textSecondary} /> : <Eye size={18} color={isLight ? "#64748B" : colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
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
  scrollContent: { padding: 24 },
  introBox: { alignItems: 'center', marginBottom: 24, marginTop: 10 },
  introHeading: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary, marginTop: 10, marginBottom: 4 },
  introSub: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  formCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.03 : 0.1, shadowRadius: 8, elevation: 2 },
  inputGroup: { marginBottom: 16 },
  label: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, marginBottom: 6, color: isLight ? '#475569' : colors.textPrimary },
  inputWrapper: { flexDirection: 'row', backgroundColor: isLight ? '#F8FAFC' : colors.background, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 14, alignItems: 'center', overflow: 'hidden' },
  input: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  eyeBtn: { padding: 12 },
  btn: { backgroundColor: isLight ? '#0F172A' : colors.buttonBg, paddingVertical: 16, borderRadius: 24, alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.1 : 0.3, shadowRadius: 4, elevation: 2 },
  btnDisabled: { backgroundColor: isLight ? '#94A3B8' : colors.iconBg },
  btnText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText, fontSize: 14, letterSpacing: 0.5 }
});