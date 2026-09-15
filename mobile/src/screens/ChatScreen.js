// src/screens/ChatScreen.js
import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, Modal, Alert, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { ArrowLeft, Search, Plus, X, Users, MessageCircle, Send, Trash2, LogOut } from 'lucide-react-native';
import { API_URL } from './api';

// Derive WebSocket URL from API_URL (e.g., https://api.univitahct.tech/api -> wss://api.univitahct.tech)
const getWsUrl = (url) => {
  if (!url) return '';
  return url.replace(/^http/, 'ws').replace(/\/api\/?$/, ''); 
};

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0][0].toUpperCase();
};

export default function ChatScreen() {
  const { isDark } = useContext(ThemeContext);
  const colors = isDark ? themeColors.dark : themeColors.light;
  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [token, setToken] = useState('');
  const [myUserId, setMyUserId] = useState(null);
  const wsRef = useRef(null);
  const flatListRef = useRef(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showUserList, setShowUserList] = useState(false);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);

  const [unreadCounts, setUnreadCounts] = useState({});

  useEffect(() => {
    AsyncStorage.getItem('auth_token').then((t) => {
      setToken(t);
      fetchRooms(t);
      fetchAllUsers(t);
      fetchUnreadCounts(t);
    });
    AsyncStorage.getItem('user_id').then(id => setMyUserId(parseInt(id)));
  }, []);

  const fetchRooms = async (authToken) => {
    try {
      const res = await fetch(`${API_URL}/chat/rooms`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      setRooms(data || []);
    } catch (err) {}
  };

  const fetchAllUsers = async (authToken) => {
    try {
      const res = await fetch(`${API_URL}/employees`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      setAllUsers(data || []);
    } catch (err) {}
  };

  const fetchUnreadCounts = async (authToken) => {
    try {
      const res = await fetch(`${API_URL}/chat/unread-counts`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      const counts = {};
      data.forEach(r => { counts[r.room_id] = r.unread; });
      setUnreadCounts(counts);
    } catch (err) {}
  };

  useEffect(() => {
    if (!token || !activeRoom) return;
    const WS_URL = getWsUrl(API_URL);
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;
    
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'new_message') {
        setMessages((prev) => [...prev, data.message]);
        fetchUnreadCounts(token);
      }
    };
    return () => ws.close();
  }, [token, activeRoom]);

  useEffect(() => {
    if (!activeRoom || !token) return;
    fetch(`${API_URL}/chat/read/${activeRoom.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
    fetchUnreadCounts(token);
  }, [activeRoom, token]);

  useEffect(() => {
    if (!activeRoom || !token) return;
    fetch(`${API_URL}/chat/history/${activeRoom.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setMessages(data || []))
      .catch(() => {});
  }, [activeRoom, token]);

  const handleSend = () => {
    if (!newMsg.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: 'message',
      roomId: activeRoom.id,
      roomName: activeRoom.name,
      content: newMsg.trim()
    }));
    setNewMsg('');
  };

  const startDM = async (partner) => {
    try {
      const dmRes = await fetch(`${API_URL}/chat/dm-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partnerUserId: partner.id })
      });
      const dmData = await dmRes.json();
      if (dmData.roomId) {
        const newRoom = { id: dmData.roomId, name: dmData.roomName, display_name: partner.full_name, type: 'direct' };
        setRooms(prev => [newRoom, ...prev.filter(r => r.id !== newRoom.id)]);
        setActiveRoom(newRoom);
      }
      setSearchTerm('');
      setShowUserList(false);
    } catch (err) {
      Alert.alert('Error', 'Could not start conversation.');
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length < 1) {
      Alert.alert('Error', 'Group name and at least 1 other member required.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/chat/group-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: groupName, memberIds: selectedUsers.map(u => u.id) })
      });
      const data = await res.json();
      if (data.success) {
        fetchRooms(token);
        setShowGroupModal(false);
        setGroupName(''); setSelectedUsers([]); setGroupSearch('');
      } else {
        Alert.alert('Error', data.error || 'Failed to create group');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    }
  };

  const leaveRoom = async (roomId) => {
    try {
      await fetch(`${API_URL}/chat/rooms/${roomId}/leave`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoom?.id === roomId) setActiveRoom(null);
    } catch (err) {}
  };

  const deleteRoom = async (roomId) => {
    try {
      await fetch(`${API_URL}/chat/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoom?.id === roomId) setActiveRoom(null);
    } catch (err) {}
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers([]); setShowUserList(false); return;
    }
    const lower = searchTerm.toLowerCase();
    const filtered = allUsers.filter(u => u.full_name.toLowerCase().includes(lower) && u.id !== myUserId);
    setFilteredUsers(filtered);
    setShowUserList(true);
  }, [searchTerm, allUsers, myUserId]);

  const renderRoom = ({ item }) => {
    const isGroup = item.type === 'group';
    const displayName = isGroup ? item.name : (item.display_name || item.name);
    const unread = unreadCounts[item.id] || 0;
    
    return (
      <TouchableOpacity
        style={styles.roomItem}
        activeOpacity={0.7}
        onPress={() => setActiveRoom(item)}
        onLongPress={() => {
          if (isGroup) {
            Alert.alert(displayName, 'Choose an action', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Leave Group', style: 'destructive', onPress: () => leaveRoom(item.id) }
            ]);
          } else {
            Alert.alert('Delete Conversation', `Delete your conversation with ${displayName}?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteRoom(item.id) }
            ]);
          }
        }}
      >
        <View style={styles.avatarCircle}>
          {isGroup ? <Users size={20} color={colors.primary} /> : <Text style={styles.avatarText}>{getInitials(displayName)}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomName}>{displayName}</Text>
          <Text style={styles.roomType}>{isGroup ? 'Group Chat' : 'Direct Message'}</Text>
        </View>
        {unread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderMessage = ({ item }) => {
    const isSent = item.user_id === myUserId;
    return (
      <View style={[styles.messageWrapper, isSent ? styles.messageWrapperSent : styles.messageWrapperReceived]}>
        {!isSent && (
          <View style={styles.messageAvatar}>
            <Text style={styles.messageAvatarText}>{getInitials(item.full_name || 'U')}</Text>
          </View>
        )}
        <View style={[styles.messageBubble, isSent ? styles.sentBubble : styles.receivedBubble]}>
          {!isSent && activeRoom?.type === 'group' && <Text style={styles.senderName}>{item.full_name}</Text>}
          <Text style={[styles.messageText, isSent && styles.sentMessageText]}>{item.message}</Text>
        </View>
      </View>
    );
  };

  if (!token) return <View style={styles.container}><ActivityIndicator style={{marginTop: 50}} color={colors.primary} /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {!activeRoom ? (
        <View style={{ flex: 1 }}>
          <View style={styles.listHeaderRow}>
            <View style={styles.searchBar}>
              <Search size={18} color={isLight ? "#94A3B8" : colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search colleagues..."
                placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
                value={searchTerm}
                onChangeText={setSearchTerm}
                onFocus={() => searchTerm.length > 0 && setShowUserList(true)}
                onBlur={() => setTimeout(() => setShowUserList(false), 200)}
              />
            </View>
            <TouchableOpacity style={styles.newGroupBtn} onPress={() => setShowGroupModal(true)} activeOpacity={0.8}>
              <Plus size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {showUserList && filteredUsers.length > 0 && (
            <View style={styles.userListContainer}>
              {filteredUsers.map(user => (
                <TouchableOpacity key={user.id} style={styles.userItem} onPress={() => startDM(user)}>
                  <View style={styles.avatarCircleSmall}><Text style={styles.avatarTextSmall}>{getInitials(user.full_name)}</Text></View>
                  <View>
                    <Text style={styles.userName}>{user.full_name}</Text>
                    <Text style={styles.userRole}>{user.role}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <FlatList
            data={rooms}
            keyExtractor={item => item.id.toString()}
            renderItem={renderRoom}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MessageCircle size={48} color={isLight ? "#E2E8F0" : colors.border} />
                <Text style={styles.emptyText}>No conversations yet</Text>
                <Text style={styles.emptySubtext}>Search for a colleague above to start chatting.</Text>
              </View>
            }
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.activeRoomHeader}>
            <TouchableOpacity onPress={() => setActiveRoom(null)} style={styles.backBtnWrapper}>
              <ArrowLeft size={24} color={isLight ? "#0F172A" : colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.activeRoomHeaderInfo}>
              <Text style={styles.activeRoomTitle}>{activeRoom.type === 'group' ? activeRoom.name : (activeRoom.display_name || activeRoom.name)}</Text>
              <Text style={styles.activeRoomSubtitle}>{activeRoom.type === 'group' ? 'Group Chat' : 'Direct Message'}</Text>
            </View>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id.toString()}
            renderItem={renderMessage}
            style={styles.messageList}
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />

          <View style={styles.inputArea}>
            <TextInput
              style={styles.chatInput}
              value={newMsg}
              onChangeText={setNewMsg}
              placeholder="Type a message..."
              placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={handleSend} style={styles.sendBtn} activeOpacity={0.8} disabled={!newMsg.trim()}>
              <Send size={18} color={newMsg.trim() ? "#FFFFFF" : "rgba(255,255,255,0.5)"} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Group Creation Modal */}
      <Modal visible={showGroupModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Group Chat</Text>
              <TouchableOpacity onPress={() => setShowGroupModal(false)}><X size={24} color={isLight ? "#64748B" : colors.textSecondary} /></TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Group Name</Text>
            <TextInput style={styles.modalInput} placeholder="e.g. IT Department" placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} value={groupName} onChangeText={setGroupName} />
            
            <Text style={styles.label}>Add Members</Text>
            <TextInput style={styles.modalInput} placeholder="Search members..." placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary} value={groupSearch} onChangeText={setGroupSearch} />
            
            <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
              {allUsers.filter(u => u.full_name.toLowerCase().includes(groupSearch.toLowerCase()) && u.id !== myUserId).map(u => {
                const isSelected = selectedUsers.some(s => s.id === u.id);
                return (
                  <TouchableOpacity key={u.id} style={[styles.memberItem, isSelected && styles.memberItemSelected]} onPress={() => {
                    setSelectedUsers(prev => isSelected ? prev.filter(s => s.id !== u.id) : [...prev, u]);
                  }}>
                    <View style={styles.avatarCircleSmall}><Text style={styles.avatarTextSmall}>{getInitials(u.full_name)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberItemName}>{u.full_name}</Text>
                      <Text style={styles.memberItemRole}>{u.role}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            
            <TouchableOpacity onPress={createGroup} style={styles.createBtn} activeOpacity={0.8}>
              <Text style={styles.createBtnText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  
  // List Header (Search & Add Group)
  listHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 20, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  searchInput: { flex: 1, fontFamily: 'Inter_18pt-Medium', fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary },
  newGroupBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#00897B', justifyContent: 'center', alignItems: 'center', shadowColor: '#00897B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  
  // User Search Dropdown
  userListContainer: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 16, marginHorizontal: 20, marginBottom: 12, maxHeight: 200, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border, gap: 12 },
  userName: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  userRole: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  
  // Room List
  roomItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: isLight ? '#F1F5F9' : colors.border },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: colors.primary },
  roomName: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: isLight ? '#0F172A' : colors.textPrimary, marginBottom: 4 },
  roomType: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },
  unreadBadge: { backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 8, height: 24, justifyContent: 'center', alignItems: 'center' },
  unreadText: { fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF', fontSize: 11 },
  
  // Empty State
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  emptyText: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#64748B' : colors.textSecondary, marginTop: 16, marginBottom: 8 },
  emptySubtext: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: isLight ? '#94A3B8' : colors.textSecondary, textAlign: 'center' },
  
  // Active Chat Header
  activeRoomHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderBottomWidth: 1, borderBottomColor: isLight ? '#E2E8F0' : colors.border },
  backBtnWrapper: { padding: 8, marginRight: 8 },
  activeRoomHeaderInfo: { flex: 1 },
  activeRoomTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 18, color: isLight ? '#0F172A' : colors.textPrimary },
  activeRoomSubtitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary },
  
  // Chat Area
  messageList: { flex: 1, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  messageWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  messageWrapperSent: { justifyContent: 'flex-end' },
  messageWrapperReceived: { justifyContent: 'flex-start' },
  messageAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: isLight ? '#E2E8F0' : colors.iconBg, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  messageAvatarText: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  messageBubble: { maxWidth: '75%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  receivedBubble: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  sentBubble: { backgroundColor: '#00897B', borderBottomRightRadius: 4 },
  senderName: { fontFamily: 'Inter_18pt-Bold', fontSize: 11, color: colors.primary, marginBottom: 4 },
  messageText: { fontFamily: 'Inter_18pt-Regular', fontSize: 15, color: isLight ? '#334155' : colors.textPrimary, lineHeight: 22 },
  sentMessageText: { color: '#FFFFFF' },
  
  inputArea: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderTopWidth: 1, borderTopColor: isLight ? '#E2E8F0' : colors.border },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 100, backgroundColor: isLight ? '#F1F5F9' : colors.background, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, fontFamily: 'Inter_18pt-Medium', color: isLight ? '#0F172A' : colors.textPrimary, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00897B', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: isLight ? '#FFFFFF' : colors.surface, borderRadius: 28, padding: 24, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: isLight ? '#0F172A' : colors.textPrimary },
  label: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: isLight ? '#64748B' : colors.textSecondary, marginBottom: 8, marginTop: 12 },
  modalInput: { fontFamily: 'Inter_18pt-Medium', borderWidth: 1, borderColor: isLight ? '#E2E8F0' : colors.border, borderRadius: 16, padding: 16, fontSize: 15, color: isLight ? '#0F172A' : colors.textPrimary, backgroundColor: isLight ? '#F8FAFC' : colors.background },
  memberList: { maxHeight: 200, marginTop: 8, marginBottom: 20 },
  memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, marginBottom: 4, gap: 12 },
  memberItemSelected: { backgroundColor: isLight ? '#E0F2F1' : 'rgba(0, 137, 123, 0.15)' },
  avatarCircleSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: isLight ? '#E2E8F0' : colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  avatarTextSmall: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: colors.primary },
  memberItemName: { fontFamily: 'Inter_18pt-Bold', fontSize: 14, color: isLight ? '#0F172A' : colors.textPrimary },
  memberItemRole: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: isLight ? '#64748B' : colors.textSecondary },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: isLight ? '#CBD5E1' : colors.border },
  checkboxActive: { backgroundColor: '#00897B', borderColor: '#00897B' },
  createBtn: { backgroundColor: '#00897B', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  createBtnText: { fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF', fontSize: 15 },
});