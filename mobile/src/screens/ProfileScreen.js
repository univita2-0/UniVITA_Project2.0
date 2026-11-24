// src/screens/ProfileScreen.js
import React, { useState, useEffect, useMemo, useContext, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  Modal, TextInput, Alert, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform, DeviceEventEmitter 
} from 'react-native';
import { Image } from 'expo-image'; // 👈 Using expo-image for better rendering
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { 
  User, Shield, ChevronRight, LogOut, ArrowLeft, Sun, Moon, Lock, Check, X, 
  Eye, EyeOff, Camera, FileText, CreditCard, Briefcase, MapPin, ShieldCheck, HelpCircle
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 
import { API_URL, updateProfile } from './api';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
// Offline queue is retained across logout/account switches for later reconciliation.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileScreen({ navigation }) {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);
  
  const [loading, setLoading] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(null);
  const [userData, setUserData] = useState({ id: '', name: 'Loading...', email: '', role: '' });
  
  // Profile Picture States
  const [profileImage, setProfileImage] = useState(null);
  const [localFallback, setLocalFallback] = useState(null); 
  const [imageError, setImageError] = useState(false); 
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Full Read-Only Record Details
  const [fullDetails, setFullDetails] = useState({
    employee_id: '—', full_name: '—', email: '—', phone: '—', position: 'Simulationist',
    contract_type: 'Full-time', date_of_joining: '—', date_of_birth: '—', gender: 'Prefer not to say',
    emergency_contact_name: '—', emergency_contact_phone: '—', street: '—', city: '—', state: '—',
    postal_code: '—', country: 'Philippines', sss_number: 'Not Provided', pagibig_number: 'Not Provided',
    philhealth_number: 'Not Provided', tin_number: 'Not Provided',
  });

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
  const hasProfileChanges = editName.trim() !== userData.name || editEmail.trim().toLowerCase() !== String(userData.email || '').toLowerCase();
  const validProfileName = editName.trim().length >= 2 && editName.trim().length <= 150;
  const validProfileEmail = EMAIL_REGEX.test(editEmail.trim()) && editEmail.trim().length <= 254;
  const canSaveProfile = hasProfileChanges && validProfileName && validProfileEmail && !loading;

  // Reset imageError whenever profileImage changes
  useEffect(() => {
    if (profileImage) {
      setImageError(false);
    }
  }, [profileImage]);

  // Helper: Safely build the image URL
  const getFullImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    
    // Safely remove /api from the end of the URL if it exists
    const baseUrl = API_URL.replace(/\/api\/?$/, '').replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  useFocusEffect(
    useCallback(() => {
      const fetchRealProfile = async () => {
        try {
          const token = await AsyncStorage.getItem('auth_token');
          const userId = await AsyncStorage.getItem('user_id');
          if (!token || !userId) return;

          const savedImage = await AsyncStorage.getItem(`@profile_picture_${userId}`);
          if (savedImage && savedImage !== 'null' && savedImage !== 'undefined') {
            setProfileImage(savedImage);
            setImageError(false);
          }

          const response = await axios.get(`${API_URL}/employees/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const freshUser = response.data;
          setUserData({ 
            id: freshUser.id, name: freshUser.full_name || freshUser.name, 
            email: freshUser.email, role: freshUser.role 
          });

          let parsedAdditional = {};
          if (freshUser.additional_info) {
            try {
              parsedAdditional = typeof freshUser.additional_info === 'string'
                ? JSON.parse(freshUser.additional_info) : freshUser.additional_info;
            } catch (e) { parsedAdditional = {}; }
          }

          setFullDetails({
            employee_id: freshUser.employee_id || '—', full_name: freshUser.full_name || freshUser.name || '—',
            email: freshUser.email || '—', phone: freshUser.phone_number || freshUser.phone || '—',
            position: freshUser.position_level || freshUser.position || 'Simulationist',
            contract_type: freshUser.contract_type || freshUser.employment_type || 'Full-time',
            date_of_joining: freshUser.date_of_joining ? freshUser.date_of_joining.split('T')[0] : '—',
            date_of_birth: freshUser.date_of_birth ? freshUser.date_of_birth.split('T')[0] : '—',
            gender: freshUser.gender || 'Prefer not to say',
            emergency_contact_name: freshUser.emergency_contact_name || '—',
            emergency_contact_phone: freshUser.emergency_contact_phone || '—',
            street: freshUser.street_address || freshUser.street || '—', city: freshUser.city || '—',
            state: freshUser.state_province || freshUser.state || '—', postal_code: freshUser.postal_code || '—',
            country: freshUser.country || 'Philippines',
            sss_number: freshUser.sss_number || parsedAdditional.sss_number || 'Not Provided',
            pagibig_number: freshUser.pagibig_number || parsedAdditional.pagibig_number || 'Not Provided',
            philhealth_number: freshUser.philhealth_number || parsedAdditional.philhealth_number || 'Not Provided',
            tin_number: freshUser.tin_number || parsedAdditional.tin_number || 'Not Provided',
          });

          if (freshUser.profile_picture) {
            const fullUrl = getFullImageUrl(freshUser.profile_picture);
            console.log("🖼️ FETCHED PROFILE URL:", fullUrl); // 👈 CHECK YOUR TERMINAL FOR THIS
            setProfileImage(fullUrl);
            setImageError(false);
            await AsyncStorage.setItem(`@profile_picture_${userId}`, fullUrl);
          }

          // Only display a deadline if the authenticated endpoint supplies one.
          // Password-expiry policy is configurable in System Configuration.
          const expiryValue = freshUser.password_expires_at || freshUser.password_expiry_date;
          const expiryMs = expiryValue ? Date.parse(expiryValue) : NaN;
          setDaysRemaining(Number.isFinite(expiryMs)
            ? Math.max(0, Math.ceil((expiryMs - Date.now()) / 86400000))
            : null);
        } catch (error) {
          console.log("Profile fetch error:", error);
          const id = await AsyncStorage.getItem('user_id');
          const name = await AsyncStorage.getItem('user_name');
          const email = await AsyncStorage.getItem('user_email');
          const role = await AsyncStorage.getItem('user_role');
          const empId = await AsyncStorage.getItem('employee_id');
          setUserData({ id: id || '', name: name || 'Employee', email: email || '', role: role || '' });
          setFullDetails(prev => ({ ...prev, employee_id: empId || '—', full_name: name || '—', email: email || '—' }));
        }
      };
      fetchRealProfile();
    }, [])
  );

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied', 'Photo library access is required.');

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, exif: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const asset = result.assets[0];

    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      return Alert.alert('Image Too Large', `Max size is 5MB.`);
    }

    if (!userData.id) return Alert.alert('Not Signed In', 'Please sign in again.');

    const previousImage = profileImage;
    setProfileImage(asset.uri); 
    setImageError(false); 
    setIsUploadingImage(true);

    try {
      const manipResult = await manipulateAsync(
        asset.uri, [{ resize: { width: 800 } }], { compress: 0.7, format: SaveFormat.JPEG }
      );

      setLocalFallback(manipResult.uri); 
      setProfileImage(manipResult.uri);

      const res = await updateProfile(userData.id, {
        full_name: userData.name, email: userData.email,
        profile_picture: { uri: manipResult.uri, name: `profile_${Date.now()}.jpg`, mimeType: 'image/jpeg' },
      });

      if (!res || !res.success) throw new Error(res?.message || 'Server rejected the profile picture.');

      if (res.profile_picture) {
        const fullUrl = getFullImageUrl(res.profile_picture);
        console.log("🖼️ UPLOADED PROFILE URL:", fullUrl); // 👈 CHECK YOUR TERMINAL FOR THIS
        setProfileImage(fullUrl);
        setImageError(false);
        await AsyncStorage.setItem(`@profile_picture_${userData.id}`, fullUrl);
      }
      
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (err) {
      console.error('Profile picture upload error:', err);
      setProfileImage(previousImage);
      Alert.alert('Upload Failed', err.message || 'Could not save profile picture.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!hasProfileChanges) return setShowEditModal(false); 
    if (!validProfileName) return Alert.alert('Invalid name', 'Enter a name between 2 and 150 characters.');
    if (!validProfileEmail) return Alert.alert('Invalid email', 'Enter a valid email address (maximum 254 characters).');

    setLoading(true);
    try {
      const res = await updateProfile(userData.id, { full_name: editName.trim(), email: editEmail.trim() });
      if (!res.success) throw new Error(res.message || "Could not update profile.");
      
      await AsyncStorage.setItem('user_name', editName.trim());
      await AsyncStorage.setItem('user_email', editEmail.trim());
      setUserData({ ...userData, name: editName.trim(), email: editEmail.trim() });
      setFullDetails(prev => ({ ...prev, full_name: editName.trim(), email: editEmail.trim() }));
      
      Alert.alert("Success", "Profile updated successfully");
      setShowEditModal(false);
    } catch (err) { 
      Alert.alert("Error", err.response?.data?.message || err.message || "Could not update profile."); 
    } finally { setLoading(false); }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) return Alert.alert("Validation Error", "Please complete all password fields.");
    if (!hasLength || !hasUppercase || !hasSpecial) return Alert.alert("Security Requirement", "New password must meet all security criteria.");
    if (currentPassword === newPassword) return Alert.alert("Validation Error", "New password must differ from current.");
    if (!passwordsMatch) return Alert.alert("Validation Error", "New passwords do not match.");

    setLoadingPwd(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const empIdentifier = (fullDetails.employee_id && fullDetails.employee_id !== '—') ? fullDetails.employee_id : userData.id;

      const res = await axios.put(`${API_URL}/users/${empIdentifier}/update-password`,
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        setShowPasswordModal(false);
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        Alert.alert("Security Updated", "Your password has been changed.", [
          {
            text: "Sign In",
            onPress: async () => {
              await AsyncStorage.multiRemove([
                'auth_token', 'user', 'employee_id', 'user_id',
                'user_email', 'user_name', 'user_role'
              ]);
              await AsyncStorage.setItem('@stay_logged_in', 'false');
              DeviceEventEmitter.emit('univita:logout');
            }
          }
        ]);
      } else {
        Alert.alert("Error", res.data.message || "Password update failed.");
      }
    } catch (error) {
      Alert.alert("Error", error.response?.data?.message || "Network error occurred.");
    } finally {
      setLoadingPwd(false);
    }
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
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          
          <View style={styles.topBar}>
            <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} activeOpacity={0.7}>
              {isDark ? <Sun size={20} color={colors.textSecondary} /> : <Moon size={20} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={styles.headerSection}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                {/* 👈 Using expo-image for better rendering */}
                {profileImage && !imageError ? (
                  <Image 
                    key={profileImage}
                    source={{ uri: profileImage }} 
                    style={styles.avatarImage} 
                    contentFit="cover"
                    transition={200}
                    onError={(e) => {
                      console.log("Image Load Error:", e);
                      setImageError(true);
                    }} 
                  />
                ) : localFallback ? (
                  <Image 
                    source={{ uri: localFallback }} 
                    style={styles.avatarImage} 
                    contentFit="cover"
                  />
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
            <View style={[styles.expiryBadge, (daysRemaining === null || daysRemaining > 30) && styles.expiryBadgeNeutral]}>
              <Text style={[styles.expiryText, (daysRemaining === null || daysRemaining > 30) && styles.expiryTextNeutral]}>
                {daysRemaining === null ? 'Password policy managed by HR' : daysRemaining === 0 ? 'Password expired' : `Password expires in ${daysRemaining} days`}
              </Text>
            </View>
          </View>

          <View style={styles.menuSection}>
            <Text style={styles.sectionHeader}>ACCOUNT</Text>
            <View style={styles.menuCard}>
              <MenuItem icon={FileText} title="Personal & Employment Details" subtitle="Official HR records, statutory IDs & address" onPress={() => setShowDetailsModal(true)} />
              <View style={styles.divider} />
              <MenuItem icon={User} title="Edit Profile" subtitle="Update your name and email" onPress={() => { setEditName(userData.name); setEditEmail(userData.email); setShowEditModal(true); }} />
              <View style={styles.divider} />
              <MenuItem icon={Shield} title="Change Password" subtitle="Update your login credentials" onPress={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowPasswordModal(true); }} />
              <View style={styles.divider} />
              <MenuItem icon={HelpCircle} title="Help Center & Terms" subtitle="Read app instructions and privacy policy" onPress={() => navigation.navigate('HelpAndTerms')} />
            </View>
          </View>

          <TouchableOpacity 
            style={styles.logoutBtn} 
            onPress={() => Alert.alert("Logout", "Are you sure you want to log out?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Logout",
                onPress: async () => {
                  await AsyncStorage.multiRemove([
                    'auth_token', 'user', 'employee_id', 'user_id',
                    'user_email', 'user_name', 'user_role'
                  ]);
                  await AsyncStorage.setItem('@stay_logged_in', 'false');
                  DeviceEventEmitter.emit('univita:logout');
                },
                style: 'destructive'
              }
            ])} 
            activeOpacity={0.8}
          >
            <LogOut size={18} color={isLight ? "#FFFFFF" : colors.buttonText} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* --- MODALS --- */}
        <Modal visible={showDetailsModal} animationType="slide" transparent={false} onRequestClose={() => setShowDetailsModal(false)}>
          <SafeAreaView style={styles.detailModalSafeArea} edges={['top', 'bottom']}>
            <View style={styles.detailModalHeader}>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)} style={styles.detailBackBtn}>
                <ArrowLeft size={22} color={isLight ? "#0F172A" : colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.detailModalTitle}>Employment Record</Text>
              <View style={{ width: 40 }} />
            </View>
            <ScrollView contentContainerStyle={styles.detailModalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.verifiedNoticeBanner}>
                <ShieldCheck size={20} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.verifiedNoticeTitle}>Official HR Personnel Record</Text>
                  <Text style={styles.verifiedNoticeSub}>These verified credentials cannot be edited directly. To request corrections, please contact HR Administration.</Text>
                </View>
              </View>
              <View style={styles.detailsGroupCard}>
                <View style={styles.groupHeaderRow}>
                  <Briefcase size={16} color="#00897B" />
                  <Text style={styles.groupHeaderTitle}>Employment Information</Text>
                </View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Employee ID</Text><Text style={styles.infoValueBold}>{fullDetails.employee_id}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Position / Role</Text><Text style={styles.infoValue}>{fullDetails.position}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Employment Contract</Text><Text style={styles.infoValue}>{fullDetails.contract_type}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Date of Joining</Text><Text style={styles.infoValue}>{fullDetails.date_of_joining}</Text></View>
              </View>
              <View style={styles.detailsGroupCard}>
                <View style={styles.groupHeaderRow}><CreditCard size={16} color="#00897B" /><Text style={styles.groupHeaderTitle}>Government Statutory IDs (Philippines)</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Social Security System (SSS)</Text><Text style={styles.infoValueMono}>{fullDetails.sss_number}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Pag-IBIG / HDMF MID</Text><Text style={styles.infoValueMono}>{fullDetails.pagibig_number}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>PhilHealth PIN</Text><Text style={styles.infoValueMono}>{fullDetails.philhealth_number}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Tax Identification No. (TIN)</Text><Text style={styles.infoValueMono}>{fullDetails.tin_number}</Text></View>
              </View>
              <View style={styles.detailsGroupCard}>
                <View style={styles.groupHeaderRow}><User size={16} color="#00897B" /><Text style={styles.groupHeaderTitle}>Personal & Emergency Details</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Full Name</Text><Text style={styles.infoValue}>{fullDetails.full_name}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Date of Birth</Text><Text style={styles.infoValue}>{fullDetails.date_of_birth}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Gender</Text><Text style={styles.infoValue}>{fullDetails.gender}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone Number</Text><Text style={styles.infoValue}>{fullDetails.phone}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Emergency Contact</Text><Text style={styles.infoValue}>{fullDetails.emergency_contact_name}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Emergency Contact Phone</Text><Text style={styles.infoValue}>{fullDetails.emergency_contact_phone}</Text></View>
              </View>
              <View style={styles.detailsGroupCard}>
                <View style={styles.groupHeaderRow}><MapPin size={16} color="#00897B" /><Text style={styles.groupHeaderTitle}>Registered Address</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Street Address</Text><Text style={styles.infoValue}>{fullDetails.street}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>City / Province</Text><Text style={styles.infoValue}>{fullDetails.city && fullDetails.state ? `${fullDetails.city}, ${fullDetails.state}` : fullDetails.city}</Text></View><View style={styles.infoDivider} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Postal Code / Country</Text><Text style={styles.infoValue}>{fullDetails.postal_code ? `${fullDetails.postal_code}, ` : ''}{fullDetails.country}</Text></View>
              </View>
              <TouchableOpacity style={styles.detailCloseBtn} onPress={() => setShowDetailsModal(false)} activeOpacity={0.8}>
                <Text style={styles.detailCloseBtnText}>Close Window</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>

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
                  {editName.length > 0 && !validProfileName && <Text style={styles.fieldError}>Name must be 2–150 characters.</Text>}
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput style={styles.inputField} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="Enter your email" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} />
                  {editEmail.length > 0 && !validProfileEmail && <Text style={styles.fieldError}>Enter a valid email address.</Text>}
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalBtnOutline} onPress={() => setShowEditModal(false)}>
                      <Text style={styles.modalBtnTextOutline}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalBtnFill, (!canSaveProfile) && { opacity: 0.6 }]} onPress={handleUpdateProfile} disabled={!canSaveProfile}>
                      {loading ? <ActivityIndicator color={isLight ? "#FFFFFF" : colors.buttonText} size="small" /> : <Text style={styles.modalBtnTextFill}>Save Changes</Text>}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal visible={showPasswordModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !loadingPwd && setShowPasswordModal(false)}>
          <SafeAreaView style={styles.passwordSheet} edges={['top', 'bottom']}>
            <View style={styles.passwordSheetHeader}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close change password" disabled={loadingPwd} onPress={() => setShowPasswordModal(false)} style={styles.sheetClose}>
                <ArrowLeft size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Change Password</Text>
              <View style={styles.sheetClose} />
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.passwordSheetBody}>
                <Text style={styles.passwordDescription}>Use a unique password to protect your UniVITA account.</Text>
                <View style={styles.secInputGroup}>
                  <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
                  <View style={styles.secInputWrapper}>
                    <Lock size={16} color={colors.textSecondary} style={{ marginLeft: 14 }} />
                    <TextInput style={styles.secInput} secureTextEntry={!showCurrent} placeholder="Enter current password" placeholderTextColor={colors.textSecondary} value={currentPassword} onChangeText={setCurrentPassword} autoCapitalize="none" autoCorrect={false} textContentType="password" />
                    <TouchableOpacity accessibilityLabel={showCurrent ? 'Hide current password' : 'Show current password'} onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeButton}>
                      {showCurrent ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.secInputGroup}>
                  <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                  <View style={styles.secInputWrapper}>
                    <Lock size={16} color={colors.textSecondary} style={{ marginLeft: 14 }} />
                    <TextInput style={styles.secInput} secureTextEntry={!showNew} placeholder="Enter new password" placeholderTextColor={colors.textSecondary} value={newPassword} onChangeText={setNewPassword} autoCapitalize="none" autoCorrect={false} textContentType="newPassword" />
                    <TouchableOpacity accessibilityLabel={showNew ? 'Hide new password' : 'Show new password'} onPress={() => setShowNew(!showNew)} style={styles.eyeButton}>
                      {showNew ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.secChecklistCard}>
                  <View style={styles.secCheckRow}>{hasLength ? <Check size={16} color="#059669" /> : <X size={16} color={colors.textSecondary} />}<Text style={[styles.secCheckText, hasLength && styles.secCheckPassed]}>At least 8 characters</Text></View>
                  <View style={styles.secCheckRow}>{hasUppercase ? <Check size={16} color="#059669" /> : <X size={16} color={colors.textSecondary} />}<Text style={[styles.secCheckText, hasUppercase && styles.secCheckPassed]}>At least one uppercase letter</Text></View>
                  <View style={styles.secCheckRow}>{hasSpecial ? <Check size={16} color="#059669" /> : <X size={16} color={colors.textSecondary} />}<Text style={[styles.secCheckText, hasSpecial && styles.secCheckPassed]}>At least one special character</Text></View>
                </View>
                <View style={styles.secInputGroup}>
                  <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
                  <View style={styles.secInputWrapper}>
                    <Lock size={16} color={colors.textSecondary} style={{ marginLeft: 14 }} />
                    <TextInput style={styles.secInput} secureTextEntry={!showConfirm} placeholder="Re-enter new password" placeholderTextColor={colors.textSecondary} value={confirmPassword} onChangeText={setConfirmPassword} autoCapitalize="none" autoCorrect={false} textContentType="newPassword" />
                    <TouchableOpacity accessibilityLabel={showConfirm ? 'Hide confirmed password' : 'Show confirmed password'} onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeButton}>
                      {showConfirm ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                  {confirmPassword.length > 0 && <Text style={[styles.matchIndicator, passwordsMatch ? styles.matchPassed : styles.matchFailed]}>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</Text>}
                </View>
              </ScrollView>
              <View style={styles.passwordSheetFooter}>
                <TouchableOpacity style={styles.modalBtnOutline} disabled={loadingPwd} onPress={() => setShowPasswordModal(false)}><Text style={styles.modalBtnTextOutline}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnFill, (!currentPassword || !newPassword || !confirmPassword || !hasLength || !hasUppercase || !hasSpecial || !passwordsMatch || loadingPwd) && styles.disabledButton]} disabled={!currentPassword || !newPassword || !confirmPassword || !hasLength || !hasUppercase || !hasSpecial || !passwordsMatch || loadingPwd} onPress={handleUpdatePassword}>
                  {loadingPwd ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.modalBtnTextFill}>Update Password</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 130, paddingTop: 8 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 0 },
  themeToggle: { padding: 12, borderRadius: 24, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.2, shadowRadius: 8, elevation: 2 },
  
  headerSection: { alignItems: 'center', marginBottom: 24 },
  avatarContainer: { position: 'relative', marginBottom: 14 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: isLight ? '#0F172A' : colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isLight ? 0.1 : 0.3, shadowRadius: 10, elevation: 4, overflow: 'hidden' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', borderRadius: 50 },
  editAvatarBtn: { position: 'absolute', bottom: 0, right: -4, backgroundColor: '#0D9488', padding: 10, borderRadius: 24, borderWidth: 3, borderColor: isLight ? '#F8FAFC' : colors.background, elevation: 5 },
  
  userName: { fontFamily: 'Inter_18pt-Bold', fontSize: 24, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 6 },
  userEmail: { fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 16 },
  expiryBadge: { backgroundColor: isLight ? '#FEF3C7' : 'rgba(251, 191, 36, 0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: isLight ? '#FDE68A' : 'rgba(251, 191, 36, 0.2)' },
  expiryText: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#D97706' : '#FBBF24' },
  expiryBadgeNeutral: { backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, borderColor: isLight ? '#E2E8F0' : colors.border },
  expiryTextNeutral: { color: isLight ? '#64748B' : colors.textSecondary },
  
  menuSection: { marginBottom: 28 },
  sectionHeader: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 12, marginLeft: 4, letterSpacing: 1.2 },
  menuCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 24, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isLight ? 0.05 : 0.15, shadowRadius: 10, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, minHeight: 76 },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  menuTextContainer: { flex: 1, marginLeft: 16 },
  menuTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary },
  menuSub: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, marginTop: 3 },
  divider: { height: 1, backgroundColor: isLight ? '#F1F5F9' : colors.border, marginLeft: 80 },
  
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: isLight ? '#0F172A' : colors.buttonBg, paddingVertical: 16, borderRadius: 16, marginTop: 2, marginBottom: 12, gap: 10 },
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

  fieldError: { fontFamily: 'Inter_18pt-Medium', color: '#DC2626', fontSize: 12, marginTop: -12, marginBottom: 14 },
  passwordSheet: { flex: 1, backgroundColor: isLight ? '#FFFFFF' : colors.surface },
  passwordSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: isLight ? '#E2E8F0' : colors.border, paddingHorizontal: 20, paddingVertical: 14 },
  sheetClose: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  passwordSheetBody: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 32 },
  passwordDescription: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, lineHeight: 20, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 22 },
  eyeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  passwordSheetFooter: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: isLight ? '#E2E8F0' : colors.border, backgroundColor: isLight ? '#FFFFFF' : colors.surface },
  disabledButton: { opacity: 0.45 },
  secInputGroup: { marginBottom: 16 },
  secInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: isLight ? '#F8FAFC' : colors.background, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, overflow: 'hidden' },
  secInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  secChecklistCard: { backgroundColor: isLight ? '#F8FAFC' : colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, gap: 8, marginBottom: 16 },
  secCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secCheckText: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  secCheckPassed: { color: '#059669', fontFamily: 'Inter_18pt-Bold' },

  detailModalSafeArea: {
    flex: 1,
    backgroundColor: isLight ? '#F8FAFC' : colors.background
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? '#E2E8F0' : colors.border
  },
  detailBackBtn: { padding: 6 },
  detailModalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  detailModalBody: { padding: 20, paddingBottom: 40 },
  verifiedNoticeBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 16, padding: 14, marginBottom: 20 },
  verifiedNoticeTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: '#065F46', marginBottom: 2 },
  verifiedNoticeSub: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: '#047857', lineHeight: 18 },
  detailsGroupCard: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, marginBottom: 16 },
  groupHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border },
  groupHeaderTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: '#00897B', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  infoLabel: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },
  infoValue: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary, textAlign: 'right', flexShrink: 1, marginLeft: 14 },
  infoValueBold: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: '#00897B' },
  infoValueMono: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#0F172A' : colors.textPrimary, letterSpacing: 0.5 },
  infoDivider: { height: 1, backgroundColor: isLight ? '#F8FAFC' : colors.border },
  detailCloseBtn: { backgroundColor: isLight ? '#0F172A' : '#334155', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  detailCloseBtnText: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: '#FFFFFF' }
});