// src/components/ChatPanel.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ChatPanel.css';
import {
  X, Send, Plus, ArrowLeft, MessageSquare, Search, Trash2, LogOut, Users
} from 'lucide-react';

const API_BASE = 'http://localhost:5000';

const ChatPanel = ({ token }) => {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [myUserId, setMyUserId] = useState(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadMap, setUnreadMap] = useState({});

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Group
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupSearch, setGroupSearch] = useState('');

  // Delete / Leave modals
  const [showDeleteRoomModal, setShowDeleteRoomModal] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState(null);
  const [showLeaveRoomModal, setShowLeaveRoomModal] = useState(false);
  const [roomToLeave, setRoomToLeave] = useState(null);

  const fetchUnreadCounts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/chat/unread-counts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const map = {};
      let total = 0;
      data.forEach(r => {
        map[r.room_id] = r.unread || 0;
        total += r.unread || 0;
      });
      setUnreadMap(map);
      setUnreadTotal(total);
    } catch (err) {
      console.error('Failed to fetch unread counts', err);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setMyUserId(payload.id);
    } catch (e) {}

    fetchUnreadCounts();

    const ws = new WebSocket(`ws://localhost:5000?token=${token}`);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message') {
        setMessages((prev) => [...prev, data.message]);
        if (!open) {
          setUnreadMap(prev => ({
            ...prev,
            [data.message.room_id]: (prev[data.message.room_id] || 0) + 1
          }));
          setUnreadTotal(prev => prev + 1);
        }
      }
    };
    return () => ws.close();
  }, [token, open, fetchUnreadCounts]);

  useEffect(() => {
    const interval = setInterval(fetchUnreadCounts, 10000);
    return () => clearInterval(interval);
  }, [fetchUnreadCounts]);

  useEffect(() => {
    if (open) {
      rooms.forEach(room => {
        fetch(`${API_BASE}/api/chat/read/${room.id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      });
      setUnreadMap({});
      setUnreadTotal(0);
    }
  }, [open, rooms, token]);

  const fetchRooms = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/chat/rooms`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setRooms(data || []);
  }, [token]);

  useEffect(() => { if (token) fetchRooms(); }, [token, fetchRooms]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/employees`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setAllUsers(data || []))
      .catch(console.error);
  }, [token]);

  // Validation: Improved Search
  useEffect(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();
    if (cleanSearch.length === 0) {
      setFilteredUsers([]);
      setShowSearchResults(false);
      return;
    }
    const filtered = allUsers.filter(u =>
      u.full_name.toLowerCase().includes(cleanSearch) && u.id !== myUserId
    );
    setFilteredUsers(filtered);
    setShowSearchResults(true);
  }, [searchTerm, allUsers, myUserId]);

  useEffect(() => {
    if (!activeRoom) return;
    fetch(`${API_BASE}/api/chat/read/${activeRoom.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }).catch(console.error);
    fetchUnreadCounts();
  }, [activeRoom, token, fetchUnreadCounts]);

  useEffect(() => {
    if (!activeRoom) return;
    fetch(`${API_BASE}/api/chat/history/${activeRoom.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setMessages(data || []))
      .catch(console.error);
  }, [activeRoom, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Validation: Prevent empty send & check WS state
  const handleSend = () => {
    if (!newMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'message',
      roomId: activeRoom.id,
      roomName: activeRoom.name,
      content: newMsg.trim()
    }));
    setNewMsg('');
  };

  const startDM = async (partner) => {
    const dmRes = await fetch(`${API_BASE}/api/chat/dm-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ partnerUserId: partner.id })
    });
    const dmData = await dmRes.json();
    if (dmData.roomId) {
      const newRoom = {
        id: dmData.roomId,
        name: dmData.roomName,
        display_name: partner.full_name,
        type: 'direct'
      };
      setRooms(prev => [newRoom, ...prev.filter(r => r.id !== newRoom.id)]);
      setActiveRoom(newRoom);
    }
    setSearchTerm('');
    setShowSearchResults(false);
  };

  // Validation: Enforce constraints before creating group
  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length < 1) return;
    
    const res = await fetch(`${API_BASE}/api/chat/group-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: groupName.trim(), memberIds: selectedUsers.map(u => u.id) })
    });
    const data = await res.json();
    if (data.success) {
      fetchRooms();
      setShowGroupModal(false);
      setGroupName('');
      setSelectedUsers([]);
      setGroupSearch('');
    }
  };

  const deleteRoom = async (roomId) => {
    const res = await fetch(`${API_BASE}/api/chat/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoom?.id === roomId) setActiveRoom(null);
    }
  };

  const leaveRoom = async (roomId) => {
    const res = await fetch(`${API_BASE}/api/chat/rooms/${roomId}/leave`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoom?.id === roomId) setActiveRoom(null);
    }
  };

  const togglePanel = () => setOpen(!open);
  
  const isSendDisabled = !newMsg.trim();
  const isGroupCreateDisabled = !groupName.trim() || selectedUsers.length < 1;

  return (
    <>
      {!open && (
        <button className="cp-toggle" onClick={togglePanel}>
          <MessageSquare size={18} /> Chat
          {unreadTotal > 0 && <span className="cp-badge-main">{unreadTotal}</span>}
        </button>
      )}

      {open && (
        <div className="cp-panel">
          {!activeRoom ? (
            <div className="cp-view">
              <div className="cp-header">
                <h3>Messages</h3>
                <button className="cp-close-btn" onClick={togglePanel}><X size={18} /></button>
              </div>

              <div className="cp-search">
                <Search size={14} className="cp-search-icon" />
                <input
                  type="text"
                  placeholder="Find a colleague..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => searchTerm.trim() && setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                />
                {showSearchResults && filteredUsers.length > 0 && (
                  <div className="cp-search-results">
                    {filteredUsers.map(user => (
                      <div key={user.id} className="cp-search-item" onMouseDown={() => startDM(user)}>
                        <span className="cp-search-name">{user.full_name}</span>
                        <span className="cp-search-role">{user.role}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showSearchResults && filteredUsers.length === 0 && (
                  <div className="cp-search-results cp-search-empty">No users found.</div>
                )}
              </div>

              <div className="cp-room-list">
                {rooms.length === 0 && (
                  <div className="cp-empty-state">No conversations yet.</div>
                )}
                {rooms.map(room => {
                  const isGroup = room.type === 'group';
                  const displayName = isGroup ? room.name : (room.display_name || 'Unknown');
                  const unread = unreadMap[room.id] || 0;
                  return (
                    <div
                      key={room.id}
                      className={`cp-room-item ${unread > 0 ? 'unread' : ''}`}
                      onClick={() => setActiveRoom(room)}
                    >
                      <div className="cp-room-icon">
                        {isGroup ? <Users size={16} /> : <MessageSquare size={16} />}
                      </div>
                      <div className="cp-room-info">
                        <span className="cp-room-name">{displayName}</span>
                        <span className="cp-room-type">{isGroup ? 'Group' : 'Direct'}</span>
                      </div>
                      {unread > 0 && <span className="cp-badge-room">{unread}</span>}
                      <div className="cp-room-actions">
                        {isGroup && (
                          <button title="Leave Group" onClick={(e) => { e.stopPropagation(); setRoomToLeave(room); setShowLeaveRoomModal(true); }}>
                            <LogOut size={14} />
                          </button>
                        )}
                        <button title="Delete Thread" onClick={(e) => { e.stopPropagation(); setRoomToDelete(room); setShowDeleteRoomModal(true); }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cp-footer">
                <button className="cp-btn-create" onClick={() => setShowGroupModal(true)}>
                  <Plus size={16} /> Create Group
                </button>
              </div>
            </div>
          ) : (
            <div className="cp-view">
              <div className="cp-header">
                <button className="cp-back-btn" onClick={() => setActiveRoom(null)}><ArrowLeft size={18} /></button>
                <div className="cp-active-info">
                  <span className="cp-active-title">
                    {activeRoom.type === 'group' ? activeRoom.name : (activeRoom.display_name || activeRoom.name)}
                  </span>
                </div>
              </div>

              <div className="cp-messages">
                {messages.length === 0 && <div className="cp-empty-state">No messages yet. Say hi!</div>}
                {messages.map(msg => {
                  const isSent = msg.user_id === myUserId;
                  return (
                    <div key={msg.id} className={`cp-bubble-wrapper ${isSent ? 'sent' : 'received'}`}>
                      {!isSent && <div className="cp-sender-name">{msg.full_name || msg.employee_id}</div>}
                      <div className="cp-bubble">{msg.message}</div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="cp-input-area">
                <input
                  type="text"
                  placeholder="Type your message..."
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button 
                  onClick={handleSend} 
                  className="cp-btn-send"
                  disabled={isSendDisabled}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showGroupModal && (
        <div className="cp-modal-overlay">
          <div className="cp-modal">
            <h4>Create Group Chat</h4>
            <div className="cp-form-group">
              <label>Group Name</label>
              <input placeholder="e.g. Project Alpha" value={groupName} onChange={e => setGroupName(e.target.value)} />
            </div>
            <div className="cp-form-group">
              <label>Search Members</label>
              <input placeholder="Search to add..." value={groupSearch} onChange={e => setGroupSearch(e.target.value)} />
            </div>
            
            <div className="cp-member-list">
              {allUsers
                .filter(u => u.full_name.toLowerCase().includes(groupSearch.trim().toLowerCase()) && u.id !== myUserId)
                .map(u => (
                  <div key={u.id} className="cp-member-item" onClick={() => {
                    setSelectedUsers(prev => prev.some(s => s.id === u.id) ? prev.filter(s => s.id !== u.id) : [...prev, u]);
                  }}>
                    <input type="checkbox" checked={selectedUsers.some(s => s.id === u.id)} readOnly />
                    <div className="cp-member-info">
                      <span className="cp-member-name">{u.full_name}</span>
                      <span className="cp-member-role">{u.role}</span>
                    </div>
                  </div>
                ))}
            </div>
            
            <div className="cp-modal-actions">
              <button className="cp-btn-cancel" onClick={() => setShowGroupModal(false)}>Cancel</button>
              <button className="cp-btn-confirm" onClick={createGroup} disabled={isGroupCreateDisabled}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteRoomModal && (
        <div className="cp-modal-overlay">
          <div className="cp-modal">
            <h4>Delete Conversation</h4>
            <p>Delete "{roomToDelete?.display_name || roomToDelete?.name}" entirely? This cannot be undone.</p>
            <div className="cp-modal-actions">
              <button className="cp-btn-cancel" onClick={() => setShowDeleteRoomModal(false)}>Cancel</button>
              <button className="cp-btn-danger" onClick={() => { deleteRoom(roomToDelete.id); setShowDeleteRoomModal(false); }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showLeaveRoomModal && (
        <div className="cp-modal-overlay">
          <div className="cp-modal">
            <h4>Leave Group</h4>
            <p>You will be removed from "{roomToLeave?.name}".</p>
            <div className="cp-modal-actions">
              <button className="cp-btn-cancel" onClick={() => setShowLeaveRoomModal(false)}>Cancel</button>
              <button className="cp-btn-danger" onClick={() => { leaveRoom(roomToLeave.id); setShowLeaveRoomModal(false); }}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatPanel;