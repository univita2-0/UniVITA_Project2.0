// src/components/ChatPanel.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ChatPanel.css';
import {
  X, Send, Plus, ArrowLeft, MessageSquare, Search, Trash2,
  LogOut, Users, UserRound, AlertCircle, Check
} from 'lucide-react';
import { API_BASE } from '../api';

const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');
const WS_URL = SERVER_BASE.replace(/^http/, 'ws');

const ChatPanel = ({ token }) => {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [chatError, setChatError] = useState('');
  const [connectionState, setConnectionState] = useState('offline');
  const [reconnectKey, setReconnectKey] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pendingMessageRef = useRef(null);
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [myUserId, setMyUserId] = useState(null);
  const [unreadMap, setUnreadMap] = useState({});
  const unreadTotal = Object.values(unreadMap).reduce((total, value) => total + (Number(value) || 0), 0);
  const readRoom = useCallback(async (roomId) => {
    if (!token || !roomId) return;
    try {
      const response = await fetch(`${API_BASE}/chat/read/${roomId}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Read confirmation failed');
      setUnreadMap(previous => ({ ...previous, [roomId]: 0 }));
    } catch (error) {
      console.error('Unable to update conversation read status', error);
    }
  }, [token]);

  const activeRoomRef = useRef(activeRoom);
  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupError, setGroupError] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const [showDeleteRoomModal, setShowDeleteRoomModal] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState(null);
  const [showLeaveRoomModal, setShowLeaveRoomModal] = useState(false);
  const [roomToLeave, setRoomToLeave] = useState(null);

  const fetchUnreadCounts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/unread-counts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Unread counts request failed (${res.status})`);
      const data = await res.json();
      const map = {};
      (Array.isArray(data) ? data : []).forEach(r => {
        const count = Number(r.unread) || 0;
        map[r.room_id] = count;
      });
      setUnreadMap(map);
    } catch (err) {
      console.error('Failed to fetch unread counts', err);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      setMyUserId(payload.id);
    } catch (err) {
      console.error('Could not read chat user ID', err);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !open) {
      setConnectionState('offline');
      return;
    }

    setChatError('');
    setConnectionState('connecting');
    fetchUnreadCounts();
    let ws;
    try {
      ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    } catch (error) {
      setConnectionState('offline');
      setChatError('Unable to connect to messaging. Check your network and try again.');
      return undefined;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current === ws) setConnectionState('online');
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message' && data.message) {
          const incoming = data.message;
          const roomId = Number(incoming.room_id);
          const isMine = Number(incoming.user_id) === Number(myUserId);
          const isCurrentRoom = openRef.current &&
            Number(activeRoomRef.current?.id) === roomId;

          if (isCurrentRoom) {
            setMessages(previous => previous.some(message => Number(message.id) === Number(incoming.id))
              ? previous : [...previous, incoming]);
            if (!isMine) readRoom(roomId);
          } else if (!isMine) {
            setUnreadMap(previous => ({
              ...previous,
              [roomId]: Number(previous[roomId] || 0) + 1
            }));
          }

          if (isMine && pendingMessageRef.current &&
            Number(pendingMessageRef.current.roomId) === roomId &&
            pendingMessageRef.current.content === incoming.message) {
            pendingMessageRef.current = null;
            setNewMsg('');
            setIsSending(false);
          }
          fetchRooms();
          fetchUnreadCounts();
        } else if (data.type === 'error') {
          pendingMessageRef.current = null;
          setIsSending(false);
          setChatError(data.message || 'Your message could not be sent. Please try again.');
        }
      } catch (err) {
        console.error('Web WS message parse error:', err);
        setChatError('A chat update could not be read. Please reopen the conversation.');
      }
    };
    ws.onerror = () => {
      if (wsRef.current === ws) setConnectionState('offline');
      setChatError('Chat connection failed. Check your internet connection and try again.');
    };
    ws.onclose = () => {
      if (wsRef.current === ws) {
        setConnectionState('offline');
        setIsSending(false);
        pendingMessageRef.current = null;
        setChatError('Messages are disconnected. Select Reconnect to continue.');
      }
    };
    return () => {
      if (wsRef.current === ws) wsRef.current = null;
      ws.close();
    };
  }, [token, open, reconnectKey, myUserId, readRoom, fetchUnreadCounts]);

  useEffect(() => {
    if (!token) return undefined;
    const interval = setInterval(fetchUnreadCounts, 10000);
    return () => clearInterval(interval);
  }, [token, fetchUnreadCounts]);

  // Read acknowledgements are sent only when the user opens that specific room.

  const fetchRooms = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Rooms request failed (${res.status})`);
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch rooms error:', err);
    }
  }, [token]);

  useEffect(() => { if (token) fetchRooms(); }, [token, fetchRooms]);
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/employees`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (!res.ok) throw new Error('Colleague directory unavailable'); return res.json(); })
      .then(data => setAllUsers(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();
    if (!cleanSearch) {
      setFilteredUsers([]);
      setShowSearchResults(false);
      return;
    }
    setFilteredUsers(allUsers.filter(u =>
      String(u?.full_name || u?.name || '').toLowerCase().includes(cleanSearch) &&
      Number(u?.id) !== Number(myUserId) &&
      String(u?.status || 'active').toLowerCase() === 'active'
    ));
    setShowSearchResults(true);
  }, [searchTerm, allUsers, myUserId]);

  useEffect(() => {
    if (!activeRoom?.id || !token || !open) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    setHistoryLoading(true);
    setMessages([]);
    setChatError('');
    fetch(`${API_BASE}/chat/history/${activeRoom.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(data?.message || 'Could not load this conversation.');
        }
        return data;
      })
      .then(data => {
        if (!cancelled) {
          setMessages(previous => {
            const all = new Map([...data, ...previous].map(item => [Number(item.id), item]));
            return [...all.values()].sort((a, b) => Number(a.id) - Number(b.id));
          });
          readRoom(activeRoom.id);
          fetchUnreadCounts();
        }
      })
      .catch(error => {
        if (!cancelled && error.name !== 'AbortError') {
          setChatError(error.message || 'Unable to load messages.');
        }
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [activeRoom?.id, token, open, readRoom, fetchUnreadCounts]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const handleSend = () => {
    const content = newMsg.trim();
    if (!content) return setChatError('Enter a message before sending.');
    if (content.length > 2000) return setChatError('Messages can be up to 2,000 characters.');
    if (!activeRoom?.id) return setChatError('Choose a conversation before sending a message.');
    if (isSending) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return setChatError('Chat is reconnecting. Please wait a moment and try again.');
    }
    try {
      pendingMessageRef.current = { roomId: activeRoom.id, content };
      setIsSending(true);
      wsRef.current.send(JSON.stringify({ type: 'message', roomId: activeRoom.id, content }));
      setChatError('');
    } catch (err) {
      pendingMessageRef.current = null;
      setIsSending(false);
      console.error('Web chat send failed:', err);
      setChatError('Your message could not be sent. Please try again.');
    }
  };

  const startDM = async partner => {
    try {
      if (!partner?.id || Number(partner.id) === Number(myUserId)) {
        return setChatError('Choose a valid colleague to start a conversation.');
      }
      const dmRes = await fetch(`${API_BASE}/chat/dm-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partnerUserId: partner.id })
      });
      const dmData = await dmRes.json();
      if (!dmRes.ok || !dmData.roomId) {
        setChatError(dmData.error || 'Could not open this conversation. Refresh the colleague list and try again.');
        return;
      }
      const newRoom = {
        id: dmData.roomId, name: dmData.roomName,
        display_name: partner.full_name || partner.name, type: 'direct'
      };
      setRooms(prev => [newRoom, ...prev.filter(r => Number(r.id) !== Number(newRoom.id))]);
      setActiveRoom(newRoom);
      setSearchTerm('');
      setShowSearchResults(false);
      setChatError('');
    } catch (err) {
      console.error('Start DM error:', err);
      setChatError('Could not open this conversation. Check your connection and try again.');
    }
  };

  const createGroup = async () => {
    const cleanName = groupName.trim();
    if (cleanName.length < 2 || cleanName.length > 50) {
      return setGroupError('Enter a group name between 2 and 50 characters.');
    }
    if (selectedUsers.length < 1) {
      return setGroupError('Choose at least one colleague to add. You will be included automatically.');
    }
    setIsCreatingGroup(true);
    setGroupError('');
    try {
      const res = await fetch(`${API_BASE}/chat/group-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: cleanName, memberIds: selectedUsers.map(u => u.id) })
      });
      const data = await res.json();
      if (res.ok && data.success && Number.isSafeInteger(Number(data.roomId)) && Number(data.roomId) > 0) {
        await fetchRooms();
        setActiveRoom({ id: data.roomId, name: cleanName, type: 'group' });
        setShowGroupModal(false);
        setGroupName('');
        setSelectedUsers([]);
        setGroupSearch('');
      } else {
        setGroupError(data.error || data.message || 'Could not create the group. Please try again.');
      }
    } catch (err) {
      setGroupError('Connection problem. Check your internet and try again.');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const deleteRoom = async roomId => {
    try {
      const res = await fetch(`${API_BASE}/chat/rooms/${roomId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRooms(prev => prev.filter(r => Number(r.id) !== Number(roomId)));
        if (Number(activeRoom?.id) === Number(roomId)) setActiveRoom(null);
      } else {
        setChatError('Could not delete this conversation. Please try again.');
      }
    } catch (err) {
      console.error('Delete chat error:', err);
      setChatError('Could not delete this conversation. Please try again.');
    }
  };

  const leaveRoom = async roomId => {
    try {
      const res = await fetch(`${API_BASE}/chat/rooms/${roomId}/leave`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRooms(prev => prev.filter(r => Number(r.id) !== Number(roomId)));
        if (Number(activeRoom?.id) === Number(roomId)) setActiveRoom(null);
      } else {
        setChatError('Could not leave this group. Please try again.');
      }
    } catch (err) {
      console.error('Leave chat group error:', err);
      setChatError('Could not leave this group. Please try again.');
    }
  };

  const togglePanel = () => setOpen(prev => !prev);
  const toggleSelectedUser = user => {
    setSelectedUsers(prev => prev.some(s => s.id === user.id)
      ? prev.filter(s => s.id !== user.id) : [...prev, user]);
    setGroupError('');
  };

  const availableGroupUsers = allUsers.filter(u =>
    u && String(u.full_name || u.name || '').toLowerCase().includes(groupSearch.trim().toLowerCase()) &&
      Number(u.id) !== Number(myUserId) &&
      String(u.status || 'active').toLowerCase() === 'active'
  );
  const isSendDisabled = !newMsg.trim() || newMsg.length > 2000 || isSending || connectionState !== 'online';
  const isGroupCreateDisabled = isCreatingGroup || groupName.trim().length < 2 || groupName.trim().length > 50 || selectedUsers.length < 1;
  const roomTitle = activeRoom?.type === 'group'
    ? activeRoom.name : (activeRoom?.display_name || activeRoom?.name || 'Conversation');

  return (
    <>
      {!open && (
        <button type="button" className="cp-toggle" onClick={togglePanel} aria-label={`Open messages${unreadTotal ? `, ${unreadTotal} unread` : ''}`}>
          <MessageSquare size={18} aria-hidden="true" />
          <span>Messages</span>
          {unreadTotal > 0 && <span className="cp-badge-main">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
        </button>
      )}

      {open && (
        <section className="cp-panel" aria-label="UniVITA messaging panel">
          {chatError && (
            <div className="cp-validation cp-validation-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{chatError}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setChatError('')}><X size={15} /></button>
            </div>
          )}

          {!activeRoom ? (
            <div className="cp-view">
              <header className="cp-header">
                <div className="cp-header-heading">
                  
                  <div>
                    <h3>Messages</h3>
                   
                  </div>
                </div>
                <button type="button" className="cp-icon-btn cp-close-btn" aria-label="Close messages" onClick={togglePanel}><X size={19} /></button>
              </header>

              <div className="cp-search">
                <Search size={17} className="cp-search-icon" aria-hidden="true" />
                <input
                  type="search" placeholder="Search colleagues" value={searchTerm}
                  aria-label="Find a colleague to chat with"
                  onChange={e => { setSearchTerm(e.target.value); setChatError(''); }}
                  onFocus={() => searchTerm.trim() && setShowSearchResults(true)}
                  onBlur={() => setShowSearchResults(false)}
                />
                {showSearchResults && (
                  <div className="cp-search-results" role="listbox" aria-label="Matching colleagues">
                    {filteredUsers.length ? filteredUsers.map(user => (
                      <button type="button" role="option" aria-selected="false" key={user.id} className="cp-search-item"
                        onMouseDown={event => event.preventDefault()} onClick={() => startDM(user)}>
                        <span className="cp-mini-avatar"><UserRound size={15} /></span>
                        <span className="cp-search-person"><span className="cp-search-name">{user.full_name || user.name}</span><span className="cp-search-role">{user.role}</span></span>
                      </button>
                    )) : <div className="cp-search-empty">No colleagues found.</div>}
                  </div>
                )}
              </div>

              <div className="cp-list-heading">
                <span>Conversations</span>
                <span className="cp-conversation-count">{rooms.length}</span>
              </div>

              <div className="cp-room-list">
                {!rooms.length && (
                  <div className="cp-empty-state">
                    <MessageSquare size={24} strokeWidth={1.5} aria-hidden="true" />
                    <strong>No conversations yet</strong>
                    <span>Search for a colleague or create a group to get started.</span>
                  </div>
                )}
                {rooms.map(room => {
                  const isGroup = room.type === 'group';
                  const displayName = isGroup ? room.name : (room.display_name || 'Unknown');
                  const unread = unreadMap[room.id] || 0;
                  return (
                    <div key={room.id} className={`cp-room-item ${unread > 0 ? 'unread' : ''}`}>
                      <button type="button" className="cp-room-select" onClick={() => { setChatError(''); setActiveRoom(room); }}
                        aria-label={`Open conversation with ${displayName}`}>
                        <span className="cp-room-icon">{isGroup ? <Users size={17} /> : <UserRound size={17} />}</span>
                        <span className="cp-room-info">
                          <span className="cp-room-name">{displayName}</span>
                          <span className="cp-room-type">{isGroup ? 'Group conversation' : 'Direct message'}</span>
                        </span>
                        {unread > 0 && <span className="cp-badge-room">{unread > 99 ? '99+' : unread}</span>}
                      </button>
                      <div className="cp-room-actions">
                        {isGroup && (
                          <button type="button" aria-label={`Leave ${displayName}`} title="Leave group"
                            onClick={() => { setRoomToLeave(room); setShowLeaveRoomModal(true); }}><LogOut size={15} /></button>
                        )}
                        {!isGroup && (
                          <button type="button" aria-label={`Delete ${displayName}`} title="Delete conversation for both participants"
                            onClick={() => { setRoomToDelete(room); setShowDeleteRoomModal(true); }}><Trash2 size={15} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <footer className="cp-footer">
                <button type="button" className="cp-btn-create" onClick={() => { setGroupError(''); setShowGroupModal(true); }}>
                  <Plus size={17} /> New group conversation
                </button>
              </footer>
            </div>
          ) : (
            <div className="cp-view">
              <header className="cp-header cp-conversation-header">
                <button type="button" className="cp-icon-btn cp-back-btn" aria-label="Back to conversations" onClick={() => setActiveRoom(null)}><ArrowLeft size={19} /></button>
                <div className="cp-active-info">
                  <span className="cp-active-title" title={roomTitle}>{roomTitle}</span>
                  <span className="cp-connection-status">
                    <span className={`cp-status-dot ${connectionState}`} />
                    {connectionState === 'online' ? 'Connected' : connectionState === 'connecting' ? 'Connecting' : 'Disconnected'}
                  </span>
                </div>
                {connectionState === 'offline' && (
                  <button type="button" className="cp-reconnect" onClick={() => { setChatError(''); setReconnectKey(value => value + 1); }}>Reconnect</button>
                )}
                <button type="button" className="cp-icon-btn cp-close-btn" aria-label="Close messages" onClick={togglePanel}><X size={19} /></button>
              </header>

              <div className="cp-messages" role="log" aria-label="Conversation messages" aria-live="polite">
                {historyLoading ? <div className="cp-empty-state cp-empty-messages">Loading messages…</div> : !messages.length && (
                  <div className="cp-empty-state cp-empty-messages">
                    <MessageSquare size={25} strokeWidth={1.5} aria-hidden="true" />
                    <strong>No messages yet</strong>
                    <span>Start the conversation by sending a message.</span>
                  </div>
                )}
                {messages.map(msg => {
                  const isSent = Number(msg.user_id) === Number(myUserId);
                  return (
                    <div key={msg.id} className={`cp-bubble-wrapper ${isSent ? 'sent' : 'received'}`}>
                      {!isSent && <div className="cp-sender-name">{msg.full_name || msg.employee_id}</div>}
                      <div className="cp-bubble">{msg.message}</div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="cp-composer">
                <div className="cp-input-area">
                  <input type="text" placeholder={isSending ? 'Sending message…' : 'Write a message…'} value={newMsg} maxLength={2000} disabled={isSending}
                    aria-label="Chat message"
                    onChange={e => { setNewMsg(e.target.value); setChatError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend(); }} />
                  <button type="button" onClick={handleSend} className="cp-btn-send" disabled={isSendDisabled}
                    aria-label="Send message"><Send size={17} /></button>
                </div>
                <div className="cp-input-hint">{isSending ? 'Sending… · ' : ''}{newMsg.length} / 2,000</div>
              </div>
            </div>
          )}
        </section>
      )}

      {showGroupModal && (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal" role="dialog" aria-modal="true" aria-labelledby="cp-create-group-title">
            <div className="cp-modal-header">
              <div><h4 id="cp-create-group-title">Create group conversation</h4><p>Collaborate with multiple colleagues.</p></div>
              <button type="button" className="cp-icon-btn" aria-label="Close group dialog" onClick={() => setShowGroupModal(false)}><X size={18} /></button>
            </div>
            <div className="cp-modal-body">
              <div className="cp-form-group">
                <label htmlFor="chat-group-name">Group name</label>
                <input id="chat-group-name" placeholder="e.g. Operations Team" value={groupName} maxLength={50}
                  aria-invalid={Boolean(groupError)} onChange={e => { setGroupName(e.target.value); setGroupError(''); }} />
                <small>2–50 characters</small>
              </div>
              <div className="cp-form-group">
                <label htmlFor="chat-group-search">Add colleagues</label>
                <div className="cp-field-with-icon"><Search size={16} aria-hidden="true" />
                  <input id="chat-group-search" placeholder="Search team members" value={groupSearch}
                    onChange={e => { setGroupSearch(e.target.value); setGroupError(''); }} />
                </div>
              </div>
              <div className="cp-member-list" aria-label="Choose group members">
                {availableGroupUsers.map(u => {
                  const selected = selectedUsers.some(s => s.id === u.id);
                  return (
                    <button type="button" key={u.id} className={`cp-member-item ${selected ? 'selected' : ''}`}
                      role="checkbox" aria-checked={selected} onClick={() => toggleSelectedUser(u)}>
                      <span className={`cp-member-checkbox ${selected ? 'checked' : ''}`}>{selected && <Check size={12} strokeWidth={3} />}</span>
                      <span className="cp-member-info"><span className="cp-member-name">{u.full_name || u.name || 'Colleague'}</span><span className="cp-member-role">{u.role}</span></span>
                    </button>
                  );
                })}
                {!availableGroupUsers.length && <div className="cp-search-empty">{groupSearch.trim() ? 'No colleagues match your search.' : 'No colleagues are available to add.'}</div>}
              </div>
              <div className="cp-selection-hint">
                {selectedUsers.length === 0
                  ? 'Select at least one colleague. You will be included automatically.'
                  : `${selectedUsers.length} colleague${selectedUsers.length === 1 ? '' : 's'} selected. You will be included automatically.`}
              </div>
              {groupError && <div className="cp-validation cp-validation-error" role="alert"><AlertCircle size={16} />{groupError}</div>}
            </div>
            <div className="cp-modal-actions">
              <button type="button" className="cp-btn-cancel" onClick={() => setShowGroupModal(false)}>Cancel</button>
              <button type="button" className="cp-btn-confirm" onClick={createGroup} disabled={isGroupCreateDisabled}>
                {isCreatingGroup ? 'Creating…' : 'Create group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteRoomModal && (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal cp-confirmation-modal" role="alertdialog" aria-modal="true" aria-labelledby="cp-delete-title" aria-describedby="cp-delete-description">
            <div className="cp-modal-header"><h4 id="cp-delete-title">Delete conversation</h4></div>
            <div className="cp-modal-body"><p id="cp-delete-description">Permanently delete this conversation and its message history for both participants? This cannot be undone.</p></div>
            <div className="cp-modal-actions">
              <button type="button" className="cp-btn-cancel" onClick={() => setShowDeleteRoomModal(false)}>Cancel</button>
              <button type="button" className="cp-btn-danger" onClick={() => { if (roomToDelete?.id) deleteRoom(roomToDelete.id); setShowDeleteRoomModal(false); }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showLeaveRoomModal && (
        <div className="cp-modal-overlay" role="presentation">
          <div className="cp-modal cp-confirmation-modal" role="alertdialog" aria-modal="true" aria-labelledby="cp-leave-title" aria-describedby="cp-leave-description">
            <div className="cp-modal-header"><h4 id="cp-leave-title">Leave group</h4></div>
            <div className="cp-modal-body"><p id="cp-leave-description">You will be removed from “{roomToLeave?.name}”.</p></div>
            <div className="cp-modal-actions">
              <button type="button" className="cp-btn-cancel" onClick={() => setShowLeaveRoomModal(false)}>Cancel</button>
              <button type="button" className="cp-btn-danger" onClick={() => { if (roomToLeave?.id) leaveRoom(roomToLeave.id); setShowLeaveRoomModal(false); }}>Leave group</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatPanel;
