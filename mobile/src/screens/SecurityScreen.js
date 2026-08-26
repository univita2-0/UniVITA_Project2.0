// src/screens/SecurityScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator
} from 'react-native';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';

// FIX: Moved outside the main component so it doesn't unmount and hide the keyboard on every keystroke
const PasswordField = ({ label, value, onChange, placeholder, isVisible, toggleVisible }) => (
  <View style={styles.inputGroup}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputWrapper}>
      <TextInput
        style={styles.flexInput}
        secureTextEntry={!isVisible}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
      />
      <TouchableOpacity onPress={toggleVisible} style={styles.eyeBtn} activeOpacity={0.7}>
        {isVisible ? <EyeOff size={20} color="#6B7280" /> : <Eye size={20} color="#6B7280" />}
      </TouchableOpacity>
    </View>
  </View>
);

export default function SecurityScreen({ navigation }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async () => {
    // FIX: Strict Validations
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
    <View style={styles.container}>
      <View style={styles.infoBox}>
        <Lock size={18} color="#00695C" />
        <Text style={styles.instruction}>
          Update your password regularly to keep your UniVITA account secure.
        </Text>
      </View>

      <PasswordField
        label="Current Password"
        value={currentPassword}
        onChange={setCurrentPassword}
        placeholder="Enter current password"
        isVisible={showCurrent}
        toggleVisible={() => setShowCurrent(!showCurrent)}
      />

      <PasswordField
        label="New Password"
        value={newPassword}
        onChange={setNewPassword}
        placeholder="Enter new password (min. 6 chars)"
        isVisible={showNew}
        toggleVisible={() => setShowNew(!showNew)}
      />

      <PasswordField
        label="Confirm New Password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Re-type new password"
        isVisible={showConfirm}
        toggleVisible={() => setShowConfirm(!showConfirm)}
      />

      <TouchableOpacity
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleUpdatePassword}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.btnText}>Renew Password</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 25, backgroundColor: '#F9FAFB' },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E0F2F1',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center'
  },
  instruction: { fontSize: 13, color: '#00695C', marginLeft: 8, flex: 1 },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, color: '#374151' },
  inputWrapper: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    alignItems: 'center'
  },
  flexInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#111827'
  },
  eyeBtn: {
    padding: 12
  },
  btn: {
    backgroundColor: '#00897B',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    elevation: 2
  },
  btnDisabled: { backgroundColor: '#99CBC6' },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});