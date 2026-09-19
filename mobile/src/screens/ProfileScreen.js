// src/screens/ProfileScreen.js
import React, { useState, useMemo, useContext, useCallback } from 'react';
import { 
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, 
  Modal, TextInput, Alert, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { User, Shield, ChevronRight, LogOut, ArrowLeft, Bell, Sun, Moon, Lock, Check, X, Eye, EyeOff, Camera } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 
import { API_URL } from './api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);
  
  const [loading, setLoading] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(365);
  const [userData, setUserData] = useState({ id: '', name: 'Loading...', email: 'loading@gmail.com', role: '' });
  
  // Profile Picture States
  const [profileImage, setProfileImage] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Edit Profile States
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // Password States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);

  // Validations
  const hasLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const hasProfileChanges = editName.trim() !== userData.name || editEmail.trim() !== userData.email;

  useFocusEffect(
    useCallback(() => {
      const fetchRealProfile = async () => {
        try {
          const token = await AsyncStorage.getItem('auth_token');
          const userId = await AsyncStorage.getItem('user_id');
          if (!token || !userId) return;

          const savedImage = await AsyncStorage.getItem(`@profile_picture_${userId}`);
          if (savedImage) setProfileImage(savedImage);

          const response = await axios.get(`${API_URL}/employees/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const freshUser = response.data;
          setUserData({ id: freshUser.id, name: freshUser.full_name || freshUser.name, email: freshUser.email, role: freshUser.role });

          if (freshUser.profile_picture) {
            const baseUrl = API_URL.replace('/api', '');
            const fullImageUrl = `${baseUrl}${freshUser.profile_picture}`;
            setProfileImage(fullImageUrl);
            await AsyncStorage.setItem(`@profile_picture_${userId}`, fullImageUrl);
          }

          const lastChangedStr = freshUser.password_last_changed || freshUser.password_updated_at;
          if (lastChangedStr) {
            const updatedDate = new Date(lastChangedStr);
            const today = new Date();
            updatedDate.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((today - updatedDate) / (1000 * 60 * 60 * 24)); 
            const remaining = 365 - diffDays;
            setDaysRemaining(remaining > 0 ? remaining : 0);
          } else { setDaysRemaining(365); }
        } catch (error) {
          const id = await AsyncStorage.getItem('user_id');
          const name = await AsyncStorage.getItem('user_name');
          const email = await AsyncStorage.getItem('user_email');
          const role = await AsyncStorage.getItem('user_role');
          setUserData({ id: id || '', name: name || 'Employee', email: email || 'user@hct.com', role: role || '' });
        }
      };
      fetchRealProfile();
    }, [])
  );

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return Alert.alert('Permission Denied', 'Camera roll access is required to update your profile picture.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setProfileImage(uri);
      setIsUploadingImage(true);

      try {
        const token = await AsyncStorage.getItem('auth_token');
        const formData = new FormData();
        
        formData.append('full_name', String(userData.name || 'User'));
        formData.append('email', String(userData.email || ''));

        const filename = uri.split('/').pop() || 'profile.jpg';
        let fileType = 'image/jpeg';
        if (filename.toLowerCase().endsWith('.png')) fileType = 'image/png';
        
        formData.append('profile_picture', {
          uri: uri,
          name: filename,
          type: fileType
        });

        const response = await fetch(`${API_URL}/users/${userData.id}/profile`, {
          method: 'PUT',
          headers: { 
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || "Failed to upload image");

        if (userData.id) {
          await AsyncStorage.setItem(`@profile_picture_${userData.id}`, uri);
        }
      } catch (err) {
        const savedImage = await AsyncStorage.getItem(`@profile_picture_${userData.id}`);
        setProfileImage(savedImage || null);
        Alert.alert("Upload Error", err.message || "Could not save profile picture to server.");
      } finally {
        setIsUploadingImage(false);
      }
    }
  };

  const handleUpdateProfile = async () => {
    if (!hasProfileChanges) {
      setShowEditModal(false);
      return; 
    }

    if (!editName.trim() || !editEmail.trim()) return Alert.alert("Validation Error", "Name and Email cannot be empty.");
    if (!EMAIL_REGEX.test(editEmail.trim())) return Alert.alert("Validation Error", "Please enter a valid email address.");

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      
      const formData = new FormData();
      formData.append('full_name', String(editName.trim()));
      formData.append('email', String(editEmail.trim()));

      const response = await fetch(`${API_URL}/users/${userData.id}/profile`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Could not update profile information.");
      
      await AsyncStorage.setItem('user_name', editName.trim());
      await AsyncStorage.setItem('user_email', editEmail.trim());
      setUserData({ ...userData, name: editName.trim(), email: editEmail.trim() });
      
      Alert.alert("Success", "Profile updated successfully");
      setShowEditModal(false);
    } catch (err) { 
      Alert.alert("Error", err.message || "Could not update profile information."); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) return Alert.alert("Validation Error", "Please complete all password fields.");
    if (!hasLength || !hasUppercase || !hasSpecial) return Alert.alert("Security Requirement", "New password must meet all security criteria.");
    if (currentPassword === newPassword) return Alert.alert("Validation Error", "New password must differ from your current password.");
    if (!passwordsMatch) return Alert.alert("Validation Error", "New passwords do not match.");

    setLoadingPwd(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const res = await axios.put(`${API_URL}/users/${userData.id}/update-password`, { currentPassword: currentPassword.trim(), newPassword: newPassword.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) {
        setShowPasswordModal(false);
        Alert.alert("Security Updated", "Your password has been changed successfully. Please sign in again.", [{ text: "Sign In", onPress: async () => { await AsyncStorage.clear(); navigation.replace('Login'); } }]);
      } else { Alert.alert("Error", res.data.message || "Password update failed."); }
    } catch (error) { Alert.alert("Error", error.response?.data?.message || "Network error occurred."); } 
    finally { setLoadingPwd(false); }
  };

  const MenuItem = ({ icon: Icon, title, subtitle, onPress }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconBox}><Icon size={20} color={isLight ? "#334155" : colors.primary} /></View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={isLight ? "#94A3B8" : colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={styles.safeArea.backgroundColor} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          
          <View style={styles.topBar}>
            <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} activeOpacity={0.7}>
              {isDark ? <Sun size={20} color={colors.textSecondary} /> : <Moon size={20} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={styles.headerSection}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <User size={44} color={isLight ? "#FFFFFF" : colors.primary} />
                )}
                {isUploadingImage && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.editAvatarBtn} onPress={handlePickImage} activeOpacity={0.8} disabled={isUploadingImage}>
                <Camera size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.userName}>{userData.name}</Text>
            <Text style={styles.userEmail}>{userData.email}</Text>
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryText}>Password expires in {daysRemaining} days</Text>
            </View>
          </View>

          <View style={styles.menuSection}>
            <Text style={styles.sectionHeader}>ACCOUNT</Text>
            <View style={styles.menuCard}>
              <MenuItem icon={User} title="Edit Profile" subtitle="Update your information" onPress={() => { setEditName(userData.name); setEditEmail(userData.email); setShowEditModal(true); }} />
              <View style={styles.divider} />
              <MenuItem icon={Shield} title="Change Password" subtitle="Update your login credentials" onPress={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowPasswordModal(true); }} />
              <View style={styles.divider} />
              <MenuItem icon={Bell} title="Emergency Alerts" subtitle="View active broadcasts" onPress={() => navigation.navigate('Alerts')} />
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={() => Alert.alert("Logout", "Are you sure you want to log out?", [{ text: "Cancel", style: "cancel" }, { text: "Logout", onPress: async () => { await AsyncStorage.clear(); navigation.replace('Login'); }, style: 'destructive' }])} activeOpacity={0.8}>
            <LogOut size={18} color={isLight ? "#FFFFFF" : colors.buttonText} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Edit Profile Modal */}
        <Modal visible={showEditModal} animationType="fade" transparent={true} onRequestClose={() => setShowEditModal(false)}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity onPress={() => setShowEditModal(false)}><ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} /></TouchableOpacity>
                  <Text style={styles.modalTitle}>Edit Profile</Text>
                  <View style={{ width: 24 }} />
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <TextInput style={styles.inputField} value={editName} onChangeText={setEditName} placeholder="Enter your full name" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} />
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput style={styles.inputField} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Enter your email" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} />
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalBtnOutline} onPress={() => setShowEditModal(false)}>
                      <Text style={styles.modalBtnTextOutline}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.modalBtnFill, (!hasProfileChanges || loading) && { opacity: 0.6 }]} 
                      onPress={handleUpdateProfile} 
                      disabled={!hasProfileChanges || loading}
                    >
                      {loading ? <ActivityIndicator color={isLight ? "#FFFFFF" : colors.buttonText} size="small" /> : <Text style={styles.modalBtnTextFill}>Save Changes</Text>}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Floating Change Password Modal */}
        <Modal visible={showPasswordModal} animationType="fade" transparent={true} onRequestClose={() => setShowPasswordModal(false)}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
              <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity onPress={() => setShowPasswordModal(false)}><ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} /></TouchableOpacity>
                  <Text style={styles.modalTitle}>Change Password</Text>
                  <View style={{ width: 24 }} />
                </View>
                
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
                  <View style={styles.secInputGroup}>
                    <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
                    <View style={styles.secInputWrapper}>
                      <Lock size={16} color={colors.textSecondary} style={{ marginLeft: 14 }} />
                      <TextInput style={styles.secInput} secureTextEntry={!showCurrent} placeholder="Enter current password" placeholderTextColor={colors.textSecondary} value={currentPassword} onChangeText={setCurrentPassword} autoCapitalize="none" />
                      <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={{ padding: 14 }}>
                        {showCurrent ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.secInputGroup}>
                    <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                    <View style={styles.secInputWrapper}>
                      <Lock size={16} color={colors.textSecondary} style={{ marginLeft: 14 }} />
                      <TextInput style={styles.secInput} secureTextEntry={!showNew} placeholder="Enter new password" placeholderTextColor={colors.textSecondary} value={newPassword} onChangeText={setNewPassword} autoCapitalize="none" />
                      <TouchableOpacity onPress={() => setShowNew(!showNew)} style={{ padding: 14 }}>
                        {showNew ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.secChecklistCard}>
                    <View style={styles.secCheckRow}>{hasLength ? <Check size={14} color="#059669" /> : <X size={14} color={colors.textSecondary} />}<Text style={[styles.secCheckText, hasLength && styles.secCheckPassed]}>At least 8 characters</Text></View>
                    <View style={styles.secCheckRow}>{hasUppercase ? <Check size={14} color="#059669" /> : <X size={14} color={colors.textSecondary} />}<Text style={[styles.secCheckText, hasUppercase && styles.secCheckPassed]}>At least 1 uppercase letter</Text></View>
                    <View style={styles.secCheckRow}>{hasSpecial ? <Check size={14} color="#059669" /> : <X size={14} color={colors.textSecondary} />}<Text style={[styles.secCheckText, hasSpecial && styles.secCheckPassed]}>At least 1 special character (!@#$...)</Text></View>
                  </View>

                  <View style={styles.secInputGroup}>
                    <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
                    <View style={styles.secInputWrapper}>
                      <Lock size={16} color={colors.textSecondary} style={{ marginLeft: 14 }} />
                      <TextInput style={styles.secInput} secureTextEntry={!showConfirm} placeholder="Re-enter new password" placeholderTextColor={colors.textSecondary} value={confirmPassword} onChangeText={setConfirmPassword} autoCapitalize="none" />
                      <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={{ padding: 14 }}>
                        {showConfirm ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                      </TouchableOpacity>
                    </View>
                    {confirmPassword.length > 0 && (
                      <Text style={{ fontSize: 11, marginTop: 6, marginLeft: 4, color: passwordsMatch ? '#059669' : '#DC2626', fontFamily: 'Inter_18pt-Medium' }}>
                        {passwordsMatch ? '✓ Passwords match' : '✕ Passwords do not match'}
                      </Text>
                    )}
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalBtnOutline} onPress={() => setShowPasswordModal(false)}>
                      <Text style={styles.modalBtnTextOutline}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtnFill, loadingPwd && { opacity: 0.6 }]} onPress={handleUpdatePassword} disabled={loadingPwd}>
                      {loadingPwd ? <ActivityIndicator color={isLight ? "#FFFFFF" : colors.buttonText} size="small" /> : <Text style={styles.modalBtnTextFill}>Save Password</Text>}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  scroll: { paddingHorizontal: 22, paddingBottom: 120, paddingTop: 10 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  themeToggle: { padding: 12, borderRadius: 24, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.2, shadowRadius: 8, elevation: 2 },
  
  headerSection: { alignItems: 'center', marginBottom: 36 },
  avatarContainer: { position: 'relative', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: isLight ? '#0F172A' : colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isLight ? 0.1 : 0.3, shadowRadius: 10, elevation: 4, overflow: 'hidden' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', borderRadius: 50 },
  editAvatarBtn: { position: 'absolute', bottom: 0, right: -4, backgroundColor: isLight ? '#A78BFA' : colors.primary, padding: 10, borderRadius: 24, borderWidth: 3, borderColor: isLight ? '#F8FAFC' : colors.background, elevation: 5 },
  
  userName: { fontFamily: 'Inter_18pt-Bold', fontSize: 24, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 6 },
  userEmail: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 16 },
  expiryBadge: { backgroundColor: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: isLight ? '#FDE68A' : 'rgba(251, 191, 36, 0.2)' },
  expiryText: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#D97706' : '#FBBF24' },
  
  menuSection: { marginBottom: 28 },
  sectionHeader: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 12, marginLeft: 4, letterSpacing: 1.2 },
  menuCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.15, shadowRadius: 10, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20 },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  menuTextContainer: { flex: 1, marginLeft: 16 },
  menuTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary },
  menuSub: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, marginTop: 3 },
  divider: { height: 1, backgroundColor: isLight ? '#F1F5F9' : colors.border, marginLeft: 80 },
  
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: isLight ? '#0F172A' : colors.buttonBg, paddingVertical: 18, borderRadius: 30, marginTop: 10, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  logoutText: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText, fontSize: 15, letterSpacing: 0.5 },
  
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 28, padding: 24, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  
  inputLabel: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputField: { fontFamily: 'Inter_18pt-Medium', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, padding: 16, fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, backgroundColor: isLight ? '#F8FAFC' : colors.background, marginBottom: 20 },
  
  modalActions: { flexDirection: 'row', gap: 14, marginTop: 10 },
  modalBtnOutline: { flex: 1, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, alignItems: 'center', backgroundColor: isLight ? '#FFFFFF' : colors.background },
  modalBtnFill: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: isLight ? '#0F172A' : colors.buttonBg, alignItems: 'center' },
  modalBtnTextOutline: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary },
  modalBtnTextFill: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText },

  // Password Modal Specific
  secInputGroup: { marginBottom: 16 },
  secInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, overflow: 'hidden' },
  secInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  secChecklistCard: { backgroundColor: isLight ? '#F8FAFC' : colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, gap: 8, marginBottom: 16 },
  secCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secCheckText: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  secCheckPassed: { color: '#059669', fontFamily: 'Inter_18pt-Bold' }
});