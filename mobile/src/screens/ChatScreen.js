// src/screens/ChatScreen.js
import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Modal, Alert, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, themeColors } from '../context/ThemeContext';
import { ArrowLeft, Search, Plus, X, Users, MessageCircle, Send } from 'lucide-react-native';
import { API_URL } from './api';

const getWsUrl = (url) => {
  if (!url) return '';
  let wsUrl = String(url).trim();
  if (wsUrl.startsWith('https://')) wsUrl = 'wss://' + wsUrl.slice(8);
  else if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);
  return wsUrl.replace(/\/api\/?$/, '');
};

const getInitials = (name) => {
  if (!name || typeof name !== 'string') return '?';
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(' ');
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0][0].toUpperCase();
};

export default function ChatScreen({ onClose }) {
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try { insets = useSafeAreaInsets(); } catch (e) {}

  const themeContext = useContext(ThemeContext) || {};
  const isDark = themeContext.isDark || false;
  
  const colors = isDark 
    ? (themeColors?.dark || { background: '#020817', surface: '#0F172A', primary: '#0D9488', textPrimary: '#FFFFFF', textSecondary: '#94A3B8', border: '#1E293B', iconBg: '#1E293B', buttonBg: '#0D9488', buttonText: '#FFFFFF', danger: '#EF4444', overlay: 'rgba(0,0,0,0.5)' })
    : (themeColors?.light || { background: '#F8FAFC', surface: '#FFFFFF', primary: '#0D9488', textPrimary: '#0F172A', textSecondary: '#64748B', border: '#E2E8F0', iconBg: '#F1F5F9', buttonBg: '#0F172A', buttonText: '#FFFFFF', danger: '#EF4444', overlay: 'rgba(0,0,0,0.5)' });

  const isLight = !isDark;
  const styles = useMemo(() => getDynamicStyles(colors, isLight), [colors, isLight]);

  // Universal Safe Padding Calculation for Modals
  const safeTopPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 20) : Math.max(insets.top, 20);

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
      if (t) {
        setToken(t);
        fetchRooms(t);
        fetchAllUsers(t);
        fetchUnreadCounts(t);
      }
    });
    AsyncStorage.getItem('user_id').then(id => {
      if (id) setMyUserId(parseInt(id, 10));
    });
  }, []);

  const fetchRooms = async (authToken) => {
    try {
      const res = await fetch(`${API_URL}/chat/rooms`, { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) { setRooms([]); }
  };

  const fetchAllUsers = async (authToken) => {
    try {
      const res = await fetch(`${API_URL}/employees`, { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      setAllUsers(Array.isArray(data) ? data : []);
    } catch (err) { setAllUsers([]); }
  };

  const fetchUnreadCounts = async (authToken) => {
    try {
      const res = await fetch(`${API_URL}/chat/unread-counts`, { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      const counts = {};
      (Array.isArray(data) ? data : []).forEach(r => { counts[r.room_id] = r.unread; });
      setUnreadCounts(counts);
    } catch (err) {}
  };

  useEffect(() => {
    if (!token || !activeRoom) return;
    const WS_URL = getWsUrl(API_URL);
    if (!WS_URL) return;

    try {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'new_message') {
            setMessages((prev) => [...prev, data.message]);
            fetchUnreadCounts(token);
          }
        } catch (err) {}
      };
    } catch (wsErr) {}

    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [token, activeRoom]);

  useEffect(() => {
    if (!activeRoom || !token) return;
    fetch(`${API_URL}/chat/read/${activeRoom.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    fetchUnreadCounts(token);
  }, [activeRoom, token]);

  useEffect(() => {
    if (!activeRoom || !token) return;
    fetch(`${API_URL}/chat/history/${activeRoom.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setMessages(Array.isArray(data) ? data : []))
      .catch(() => setMessages([]));
  }, [activeRoom, token]);

  const handleSend = () => {
    if (!newMsg || !newMsg.trim()) return Alert.alert('Validation', 'Message cannot be empty.');
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return Alert.alert('Connection Error', 'Chat connection is inactive. Please re-open the conversation.');
    wsRef.current.send(JSON.stringify({ type: 'message', roomId: activeRoom.id, roomName: activeRoom.name, content: newMsg.trim() }));
    setNewMsg('');
  };

  const startDM = async (partner) => {
    try {
      const dmRes = await fetch(`${API_URL}/chat/dm-room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ partnerUserId: partner.id })
      });
      const dmData = await dmRes.json();
      if (dmData.roomId) {
        const newRoom = { id: dmData.roomId, name: dmData.roomName, display_name: partner.full_name, type: 'direct' };
        setRooms(prev => [newRoom, ...prev.filter(r => r.id !== newRoom.id)]);
        setActiveRoom(newRoom);
      }
      setSearchTerm(''); setShowUserList(false);
    } catch (err) { Alert.alert('Error', 'Could not open conversation.'); }
  };

  const createGroup = async () => {
    if (!groupName || groupName.trim().length < 2) return Alert.alert('Validation', 'Group name must be at least 2 characters.');
    if (selectedUsers.length < 1) return Alert.alert('Validation', 'Please choose at least one member.');
    try {
      const res = await fetch(`${API_URL}/chat/group-room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: groupName.trim(), memberIds: selectedUsers.map(u => u.id) })
      });
      const data = await res.json();
      if (data.success) {
        fetchRooms(token);
        setShowGroupModal(false); setGroupName(''); setSelectedUsers([]); setGroupSearch('');
      } else { Alert.alert('Error', data.error || 'Failed to create group'); }
    } catch (err) { Alert.alert('Network Error', 'Could not connect to server.'); }
  };

  const leaveRoom = async (roomId) => {
    try {
      await fetch(`${API_URL}/chat/rooms/${roomId}/leave`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoom?.id === roomId) setActiveRoom(null);
    } catch (err) {}
  };

  const deleteRoom = async (roomId) => {
    try {
      await fetch(`${API_URL}/chat/rooms/${roomId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoom?.id === roomId) setActiveRoom(null);
    } catch (err) {}
  };

  useEffect(() => {
    if (!searchTerm || !searchTerm.trim()) { setFilteredUsers([]); setShowUserList(false); return; }
    const lower = searchTerm.trim().toLowerCase();
    const safeUsers = Array.isArray(allUsers) ? allUsers : [];
    const filtered = safeUsers.filter(u => {
      if (!u || typeof u !== 'object') return false;
      const name = String(u.full_name || u.name || '').toLowerCase();
      return name.includes(lower) && u.id !== myUserId;
    });
    setFilteredUsers(filtered); setShowUserList(true);
  }, [searchTerm, allUsers, myUserId]);

  const renderRoom = ({ item }) => {
    const isGroup = item.type === 'group';
    const displayName = isGroup ? item.name : (item.display_name || item.name || 'Unknown');
    const unread = unreadCounts[item.id] || 0;
    
    return (
      <TouchableOpacity
        style={styles.roomItem} activeOpacity={0.7} onPress={() => setActiveRoom(item)}
        onLongPress={() => {
          if (isGroup) Alert.alert(displayName, 'Choose an action', [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave Group', style: 'destructive', onPress: () => leaveRoom(item.id) }]);
          else Alert.alert('Delete Conversation', `Delete your conversation with ${displayName}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteRoom(item.id) }]);
        }}
      >
        <View style={styles.avatarCircle}>{isGroup ? <Users size={20} color={colors.primary} /> : <Text style={styles.avatarText}>{getInitials(displayName)}</Text>}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomName}>{displayName}</Text>
          <Text style={styles.roomType}>{isGroup ? 'Group Chat' : 'Direct Message'}</Text>
        </View>
        {unread > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text></View>}
      </TouchableOpacity>
    );
  };

  const renderMessage = ({ item }) => {
    const isSent = item.user_id === myUserId;
    return (
      <View style={[styles.messageWrapper, isSent ? styles.messageWrapperSent : styles.messageWrapperReceived]}>
        {!isSent && <View style={styles.messageAvatar}><Text style={styles.messageAvatarText}>{getInitials(item.full_name || 'U')}</Text></View>}
        <View style={[styles.messageBubble, isSent ? styles.sentBubble : styles.receivedBubble]}>
          {!isSent && activeRoom?.type === 'group' && <Text style={styles.senderName}>{item.full_name}</Text>}
          <Text style={[styles.messageText, isSent && styles.sentMessageText]}>{item.message}</Text>
        </View>
      </View>
    );
  };

  if (!token) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{marginTop: 50}} color={colors.primary} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: safeTopPadding }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.surface} translucent={true} />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!activeRoom ? (
          <View style={{ flex: 1 }}>
            
            <View style={styles.chatHeaderBar}>
              <Text style={styles.chatHeaderTitle}>Communications</Text>
              {onClose && (
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <X size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.listHeaderRow}>
              <View style={styles.searchBar}>
                <Search size={18} color={isLight ? "#94A3B8" : colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search colleagues..."
                  placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
                  value={searchTerm} onChangeText={setSearchTerm}
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
              keyExtractor={item => item.id ? String(item.id) : Math.random().toString()}
              renderItem={renderRoom}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MessageCircle size={44} color={isLight ? "#CBD5E1" : colors.border} />
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
                <ArrowLeft size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.activeRoomHeaderInfo}>
                <Text style={styles.activeRoomTitle}>{activeRoom.type === 'group' ? activeRoom.name : (activeRoom.display_name || activeRoom.name)}</Text>
                <Text style={styles.activeRoomSubtitle}>{activeRoom.type === 'group' ? 'Group Chat' : 'Direct Message'}</Text>
              </View>
            </View>

            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id ? String(item.id) : Math.random().toString()}
              renderItem={renderMessage}
              style={styles.messageList}
              contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            <View style={styles.inputArea}>
              <TextInput
                style={styles.chatInput}
                value={newMsg} onChangeText={setNewMsg}
                placeholder="Type a message..."
                placeholderTextColor={isLight ? "#94A3B8" : colors.textSecondary}
                onSubmitEditing={handleSend} returnKeyType="send"
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
                <TouchableOpacity onPress={() => setShowGroupModal(false)}><X size={24} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <Text style={styles.label}>Group Name (Min 2 chars)</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. IT Department" placeholderTextColor={colors.textSecondary} value={groupName} onChangeText={setGroupName} />
              <Text style={styles.label}>Add Members</Text>
              <TextInput style={styles.modalInput} placeholder="Search colleagues..." placeholderTextColor={colors.textSecondary} value={groupSearch} onChangeText={setGroupSearch} />
              <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
                {(Array.isArray(allUsers) ? allUsers : [])
                  .filter(u => {
                    if (!u || typeof u !== 'object') return false;
                    const name = String(u.full_name || u.name || '').toLowerCase();
                    const q = String(groupSearch || '').trim().toLowerCase();
                    return name.includes(q) && u.id !== myUserId;
                  })
                  .map(u => {
                    const isSelected = selectedUsers.some(s => s.id === u.id);
                    return (
                      <TouchableOpacity key={u.id} style={[styles.memberItem, isSelected && styles.memberItemSelected]} onPress={() => { setSelectedUsers(prev => isSelected ? prev.filter(s => s.id !== u.id) : [...prev, u]); }}>
                        <View style={styles.avatarCircleSmall}><Text style={styles.avatarTextSmall}>{getInitials(u.full_name)}</Text></View>
                        <View style={{ flex: 1 }}><Text style={styles.memberItemName}>{u.full_name}</Text><Text style={styles.memberItemRole}>{u.role}</Text></View>
                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]} />
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
              <TouchableOpacity onPress={createGroup} style={styles.createBtn} activeOpacity={0.8}><Text style={styles.createBtnText}>Create Group</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const getDynamicStyles = (colors, isLight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  
  chatHeaderBar: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20, 
    paddingVertical: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border, 
    backgroundColor: colors.surface 
  },
  chatHeaderTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 20, color: colors.textPrimary, letterSpacing: -0.5 },
  closeBtn: { padding: 4 },

  listHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontFamily: 'Inter_18pt-Medium', fontSize: 14, color: colors.textPrimary },
  newGroupBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#0D9488', justifyContent: 'center', alignItems: 'center' },
  userListContainer: { backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, marginBottom: 12, maxHeight: 180, borderWidth: 1, borderColor: colors.border },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  userName: { fontFamily: 'Inter_18pt-Bold', fontSize: 13.5, color: colors.textPrimary },
  userRole: { fontFamily: 'Inter_18pt-Medium', fontSize: 11.5, color: colors.textSecondary },
  roomItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatarCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: isLight ? '#F1F5F9' : colors.iconBg, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: colors.primary },
  roomName: { fontFamily: 'Inter_18pt-Bold', fontSize: 15, color: colors.textPrimary, marginBottom: 2 },
  roomType: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: colors.textSecondary },
  unreadBadge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, height: 20, justifyContent: 'center', alignItems: 'center' },
  unreadText: { fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF', fontSize: 10 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  emptyText: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: colors.textPrimary, marginTop: 12, marginBottom: 4 },
  emptySubtext: { fontFamily: 'Inter_18pt-Regular', fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  activeRoomHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtnWrapper: { padding: 6, marginRight: 6 },
  activeRoomHeaderInfo: { flex: 1 },
  activeRoomTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 16, color: colors.textPrimary },
  activeRoomSubtitle: { fontFamily: 'Inter_18pt-Medium', fontSize: 12, color: colors.textSecondary },
  messageList: { flex: 1, backgroundColor: colors.background },
  messageWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  messageWrapperSent: { justifyContent: 'flex-end' },
  messageWrapperReceived: { justifyContent: 'flex-start' },
  messageAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  messageAvatarText: { fontFamily: 'Inter_18pt-Bold', fontSize: 11, color: colors.textSecondary },
  messageBubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  receivedBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 2, borderWidth: 1, borderColor: colors.border },
  sentBubble: { backgroundColor: '#0D9488', borderBottomRightRadius: 2 },
  senderName: { fontFamily: 'Inter_18pt-Bold', fontSize: 10, color: colors.primary, marginBottom: 2 },
  messageText: { fontFamily: 'Inter_18pt-Regular', fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  sentMessageText: { color: '#FFFFFF' },
  inputArea: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  chatInput: { flex: 1, minHeight: 40, maxHeight: 90, backgroundColor: colors.background, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 14, fontFamily: 'Inter_18pt-Medium', color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D9488', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_18pt-Bold', fontSize: 17, color: colors.textPrimary },
  label: { fontFamily: 'Inter_18pt-Bold', fontSize: 11, color: colors.textSecondary, marginBottom: 6, marginTop: 10, textTransform: 'uppercase' },
  modalInput: { fontFamily: 'Inter_18pt-Medium', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background },
  memberList: { maxHeight: 180, marginTop: 6, marginBottom: 16 },
  memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4, gap: 10 },
  memberItemSelected: { backgroundColor: isLight ? '#E0F2F1' : 'rgba(13, 148, 136, 0.15)' },
  avatarCircleSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center' },
  avatarTextSmall: { fontFamily: 'Inter_18pt-Bold', fontSize: 12, color: colors.primary },
  memberItemName: { fontFamily: 'Inter_18pt-Bold', fontSize: 13, color: colors.textPrimary },
  memberItemRole: { fontFamily: 'Inter_18pt-Medium', fontSize: 11, color: colors.textSecondary },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border },
  checkboxActive: { backgroundColor: '#0D9488', borderColor: '#0D9488' },
  createBtn: { backgroundColor: '#0D9488', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  createBtnText: { fontFamily: 'Inter_18pt-Bold', color: '#FFFFFF', fontSize: 14 }
});