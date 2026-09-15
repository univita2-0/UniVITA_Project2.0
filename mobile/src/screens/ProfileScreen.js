// src/screens/ProfileScreen.js
import React, { useState, useEffect, useMemo, useContext, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { User, Shield, HelpCircle, ChevronRight, LogOut, ArrowLeft, Bell, Edit2, Sun, Moon } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { ThemeContext, themeColors } from '../context/ThemeContext'; 
import { API_URL } from './api';

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(365);
  const [userData, setUserData] = useState({ id: '', name: 'Loading...', email: 'loading@gmail.com' });
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  useFocusEffect(
    useCallback(() => {
      const fetchRealProfile = async () => {
        try {
          const token = await AsyncStorage.getItem('auth_token');
          if (!token) return;

          const response = await axios.get(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const freshUser = response.data;
          
          setUserData({
            id: freshUser.id,
            name: freshUser.full_name || freshUser.name,
            email: freshUser.email
          });

          if (freshUser.password_updated_at) {
            const updatedDate = new Date(freshUser.password_updated_at);
            const today = new Date();
            const diffTime = Math.abs(today - updatedDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            const remaining = 365 - diffDays;
            setDaysRemaining(remaining > 0 ? remaining : 0);
          } else {
            setDaysRemaining(365);
          }

        } catch (error) {
          const id = await AsyncStorage.getItem('user_id');
          const name = await AsyncStorage.getItem('user_name');
          const email = await AsyncStorage.getItem('user_email');
          setUserData({ id: id || '', name: name || 'Employee', email: email || 'user@hct.com' });
        }
      };

      fetchRealProfile();
    }, [])
  );

  // FIX: Pre-fill data immediately when modal opens
  const handleOpenEditModal = () => {
    setEditName(userData.name);
    setEditEmail(userData.email);
    setShowEditModal(true);
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", onPress: async () => { await AsyncStorage.clear(); navigation.replace('Login'); }, style: 'destructive' }
    ]);
  };

  const handleUpdateProfile = async () => {
    // FIX: Strict Validation
    if (!editName.trim() || !editEmail.trim()) {
      return Alert.alert("Validation Error", "Full Name and Email Address cannot be empty.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail.trim())) {
      return Alert.alert("Validation Error", "Please enter a valid email address.");
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      await axios.put(`${API_URL}/users/profile`, 
        { full_name: editName.trim(), email: editEmail.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await AsyncStorage.setItem('user_name', editName.trim());
      await AsyncStorage.setItem('user_email', editEmail.trim());
      setUserData({ ...userData, name: editName.trim(), email: editEmail.trim() });
      
      Alert.alert("Success", "Profile updated successfully");
      setShowEditModal(false);
    } catch (err) {
      Alert.alert("Error", "Could not update profile information.");
    } finally { 
      setLoading(false); 
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
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          
          <View style={styles.topBar}>
            <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} activeOpacity={0.7}>
              {isDark ? <Sun size={20} color={colors.textSecondary} /> : <Moon size={20} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={styles.headerSection}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}><User size={44} color={isLight ? "#FFFFFF" : colors.primary} /></View>
              <TouchableOpacity style={styles.editAvatarBtn} onPress={handleOpenEditModal} activeOpacity={0.8}>
                <Edit2 size={14} color="#FFFFFF" />
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
              <MenuItem icon={User} title="Edit Profile" subtitle="Update your information" onPress={handleOpenEditModal} />
              <View style={styles.divider} />
              <MenuItem icon={Shield} title="Security" subtitle="Password and authentication" onPress={() => navigation.navigate('Security')} />
              <View style={styles.divider} />
              <MenuItem icon={Bell} title="Emergency Alerts" subtitle="View active alerts" onPress={() => navigation.navigate('Alerts')} />
            </View>
          </View>

          <View style={styles.menuSection}>
            <Text style={styles.sectionHeader}>SUPPORT</Text>
            <View style={styles.menuCard}>
              <MenuItem icon={HelpCircle} title="Help Center" subtitle="FAQs and support" onPress={() => Alert.alert("Support", "Contact: help@hctacademy.com")} />
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <LogOut size={18} color={isLight ? "#FFFFFF" : colors.buttonText} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={showEditModal} animationType="fade" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowEditModal(false)}><ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} /></TouchableOpacity>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <View style={{ width: 24 }} />
              </View>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Enter your full name" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} />
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput style={styles.input} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Enter your email" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnOutline} onPress={() => setShowEditModal(false)}>
                  <Text style={styles.modalBtnTextOutline}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnFill} onPress={handleUpdateProfile} disabled={loading}>
                  {loading ? <ActivityIndicator color={isLight ? "#FFFFFF" : colors.buttonText} size="small" /> : <Text style={styles.modalBtnTextFill}>Save Changes</Text>}
                </TouchableOpacity>
              </View>
            </View>
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
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: isLight ? '#0F172A' : colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isLight ? 0.1 : 0.3, shadowRadius: 10, elevation: 4 },
  editAvatarBtn: { position: 'absolute', bottom: 0, right: -4, backgroundColor: isLight ? '#A78BFA' : colors.primary, padding: 10, borderRadius: 24, borderWidth: 3, borderColor: isLight ? '#F8FAFC' : colors.background },
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  inputLabel: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontFamily: 'Inter_18pt-Medium', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, padding: 16, fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, backgroundColor: isLight ? '#F8FAFC' : colors.background, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 14, marginTop: 10 },
  modalBtnOutline: { flex: 1, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, alignItems: 'center', backgroundColor: isLight ? '#FFFFFF' : colors.background },
  modalBtnFill: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: isLight ? '#0F172A' : colors.buttonBg, alignItems: 'center' },
  modalBtnTextOutline: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#0F172A' : colors.textPrimary },
  modalBtnTextFill: { fontFamily: 'Inter_18pt-Bold', color: isLight ? '#FFFFFF' : colors.buttonText },
});