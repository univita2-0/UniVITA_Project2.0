// src/pages/SharedCalendar.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './SharedCalendar.css';
import {
  ChevronLeft, ChevronRight, Trash2, Edit3, Calendar as CalIcon,
  MapPin, Clock, Plus, Check, X, History, Bell, CalendarDays
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const SharedCalendar = () => {
  const userRole = localStorage.getItem('user_role') || 'admin';
  const isReadOnly = userRole === 'security';

  const [events, setEvents] = useState([]);
  const [activeDate, setActiveDate] = useState(new Date().getDate());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEventId, setCurrentEventId] = useState(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState({ id: null, status: null });

  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  
  // NEW: State for the specific date events modal
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState(null);

  const [hoveredDateStr, setHoveredDateStr] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const [newEvent, setNewEvent] = useState({
    title: '', date: '', place: '', start_time: '', end_time: '',
    type: 'School Event', description: ''
  });

  const legendItems = [
    { label: 'School Event', className: 'school-event' },
    { label: 'Holiday', className: 'holiday' },
    { label: 'Meeting', className: 'meeting' },
    { label: 'Note/Reminder', className: 'note' },
    { label: 'Leave', className: 'leave-event' }
  ];

  const leaveCategories = ['Sick Leave', 'Vacation', 'Emergency', 'Other', 'Leave'];

  const getPHHolidays = (year) => [
    { id: `ph-${year}-1`, title: "New Year's Day", date: `${year}-01-01`, type: 'Holiday', description: 'Regular Holiday' },
    { id: `ph-${year}-2`, title: "Araw ng Kagitingan", date: `${year}-04-09`, type: 'Holiday', description: 'Regular Holiday' },
    { id: `ph-${year}-3`, title: "Labor Day", date: `${year}-05-01`, type: 'Holiday', description: 'Regular Holiday' },
    { id: `ph-${year}-4`, title: "Independence Day", date: `${year}-06-12`, type: 'Holiday', description: 'Regular Holiday' },
    { id: `ph-${year}-5`, title: "Ninoy Aquino Day", date: `${year}-08-21`, type: 'Holiday', description: 'Special Non-Working Day' },
    { id: `ph-${year}-6`, title: "National Heroes Day", date: `${year}-08-31`, type: 'Holiday', description: 'Regular Holiday' },
    { id: `ph-${year}-7`, title: "All Saints Day", date: `${year}-11-01`, type: 'Holiday', description: 'Special Non-Working Day' },
    { id: `ph-${year}-8`, title: "Bonifacio Day", date: `${year}-11-30`, type: 'Holiday', description: 'Regular Holiday' },
    { id: `ph-${year}-9`, title: "Immaculate Conception", date: `${year}-12-08`, type: 'Holiday', description: 'Special Non-Working Day' },
    { id: `ph-${year}-10`, title: "Christmas Day", date: `${year}-12-25`, type: 'Holiday', description: 'Regular Holiday' },
    { id: `ph-${year}-11`, title: "Rizal Day", date: `${year}-12-30`, type: 'Holiday', description: 'Regular Holiday' },
  ];

  const loadAllData = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/events`, getAuthHeaders());
      const phHolidays = getPHHolidays(currentDate.getFullYear());
      setEvents([...res.data, ...phHolidays]);
    } catch (err) {
      console.error("Sync Error:", err);
      toast.error('Failed to load calendar data');
    }
  }, [currentDate]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  const handleUpdateStatus = (id, newStatus) => {
    if (isReadOnly) return;
    setPendingAction({ id, status: newStatus });
    setShowConfirmModal(true);
  };

  const confirmUpdateStatus = async () => {
    if (isReadOnly) return;
    const { id, status } = pendingAction;
    try {
      await axios.put(`${API_BASE}/leave-requests/${id}/status`, { status }, getAuthHeaders());
      toast.success(`Leave request ${status} successfully!`);
      loadAllData();
    } catch (err) {
      toast.error("Failed to update status.");
    } finally {
      setShowConfirmModal(false);
      setPendingAction({ id: null, status: null });
    }
  };

  const handleSaveEvent = async () => {
    if (isReadOnly) return;
    if (!newEvent.title || !newEvent.date) {
      toast.warning("Required fields missing");
      return;
    }
    try {
      if (isEditing) {
        await axios.put(`${API_BASE}/events/${currentEventId}`, newEvent, getAuthHeaders());
      } else {
        await axios.post(`${API_BASE}/events`, newEvent, getAuthHeaders());
      }
      toast.success(isEditing ? 'Event updated' : 'Event created');
      setShowModal(false);
      resetForm();
      loadAllData();
    } catch (err) {
      toast.error("Error saving event");
    }
  };

  const handleDeleteEvent = async (id) => {
    if (isReadOnly) return;
    if (String(id).startsWith('ph-')) {
      toast.info("Cannot delete official holidays.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    try {
      await axios.delete(`${API_BASE}/events/${id}`, getAuthHeaders());
      toast.success('Event deleted');
      
      // If deleting from within the specific date modal, refresh or close it
      if (showDateModal && selectedDateStr) {
        const remainingForDate = events.filter(e => e.date === selectedDateStr && e.id !== id);
        if (remainingForDate.length === 0) setShowDateModal(false);
      }
      
      loadAllData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete event');
    }
  };

  const handleEditClick = (event) => {
    if (isReadOnly) return;
    if (leaveCategories.includes(event.type) || String(event.id).startsWith('ph-')) return;
    setNewEvent({
      title: event.title, date: event.date, place: event.place || '',
      start_time: event.start_time || '', end_time: event.end_time || '',
      type: event.type, description: event.description || ''
    });
    setCurrentEventId(event.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const resetForm = () => {
    setNewEvent({ title: '', date: '', place: '', start_time: '', end_time: '', type: 'School Event', description: '' });
    setIsEditing(false);
    setCurrentEventId(null);
  };

  const handleDayClick = (day, dateStr, dayEvents) => {
    setActiveDate(day);
    if (dayEvents.length > 0) {
      setHoveredDateStr(null); // Hide the tooltip immediately
      setSelectedDateStr(dateStr);
      setShowDateModal(true);
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1);
  const startDay = new Date(year, month, 1).getDay();
  // Adjust so Monday is the first day of the week (if preferred), here using Sunday as 0
  const emptySlots = Array(startDay === 0 ? 6 : startDay - 1).fill(null);
  const todayDateStr = new Date().toISOString().split('T')[0];

  const upcomingData = events.filter(e => e.date >= todayDateStr);
  const passedData = events.filter(e => e.date < todayDateStr).sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredHistory = passedData.filter(item => {
    const [itemYear, itemMonth] = item.date.split('-');
    const matchMonth = filterMonth === '' || itemMonth === filterMonth;
    const matchYear = filterYear === '' || itemYear === filterYear;
    return matchMonth && matchYear;
  });

  const schoolEvents = upcomingData.filter(e =>
    !leaveCategories.includes(e.type) &&
    (e.type !== 'Holiday' || !String(e.id).startsWith('ph-'))
  );

  const getEventClass = (type) => {
    if (type === 'Holiday') return 'holiday';
    if (type === 'Sick Leave' || type === 'Vacation' || type === 'Emergency') return 'leave-event';
    return 'school-event';
  };

  const leaveRequests = upcomingData.filter(e => leaveCategories.includes(e.type) && e.status === 'Pending');
  const phHolidaysList = upcomingData.filter(e => e.type === 'Holiday' && String(e.id).startsWith('ph-'));

  const handleMouseEnter = (dateStr, e) => {
    setHoveredDateStr(dateStr);
    setTooltipPos({ x: e.clientX + 15, y: e.clientY + 15 });
  };

  const handleMouseMove = (e) => {
    if (hoveredDateStr) {
      setTooltipPos({ x: e.clientX + 15, y: e.clientY + 15 });
    }
  };

  const handleMouseLeave = () => {
    setHoveredDateStr(null);
  };

  const hoveredEvents = hoveredDateStr ? events.filter(e => e.date === hoveredDateStr) : [];

  const renderEventItem = (event) => {
    const legend = legendItems.find(l => l.label === event.type);
    const isLeave = leaveCategories.includes(event.type);
    return (
      <div className={`upcoming-event-item ${isLeave ? 'leave-request-item' : ''}`} key={event.id}>
        <div className="event-header">
          <span className="event-title">{event.title}</span>
          {!isReadOnly && !isLeave && !String(event.id).startsWith('ph-') && (
            <div className="event-actions">
              <button className="icon-action-btn" onClick={() => handleEditClick(event)} title="Edit">
                <Edit3 size={14} />
              </button>
              <button className="icon-action-btn danger" onClick={() => handleDeleteEvent(event.id)} title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="event-details-grid">
          <div className="event-detail"><CalIcon size={14} /> <span>{event.date}</span></div>
          {event.start_time && (
            <div className="event-detail"><Clock size={14} /> <span>{event.start_time.substring(0,5)} - {event.end_time ? event.end_time.substring(0,5) : '?'}</span></div>
          )}
          {event.place && (
            <div className="event-detail"><MapPin size={14} /> <span>{event.place}</span></div>
          )}
        </div>
        <div className="event-meta-footer">
          <span className={`event-type-tag ${legend?.className || 'school-event'}`}>{event.type}</span>
          {event.description && <span className="event-description-text">{event.description}</span>}
        </div>
        
        {isLeave && event.status === 'Pending' && !isReadOnly && (
          <div className="leave-action-btns">
            <button className="btn-approve" onClick={() => handleUpdateStatus(event.id, 'Approved')}>
              <Check size={14} /> Approve
            </button>
            <button className="btn-reject" onClick={() => handleUpdateStatus(event.id, 'Rejected')}>
              <X size={14} /> Reject
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="calendar-layout">
      <div className="calendar-main">
        <div className="cal-header">
          <button className="cal-nav-btn" onClick={() => {
            const prev = new Date(currentDate);
            prev.setMonth(prev.getMonth() - 1);
            setCurrentDate(prev);
          }}><ChevronLeft size={20} /></button>
          <span className="cal-title">{monthName} {year}</span>
          <button className="cal-nav-btn" onClick={() => {
            const next = new Date(currentDate);
            next.setMonth(next.getMonth() + 1);
            setCurrentDate(next);
          }}><ChevronRight size={20} /></button>
        </div>

        <div className="cal-grid-wrapper">
          <div className="cal-grid-header">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <div key={d} className="cal-day-name">{d}</div>)}
          </div>
          <div className="cal-grid-body">
            {emptySlots.map((_, i) => <div key={`e-${i}`} className="cal-date empty"></div>)}
            {days.map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayDateStr;
              const dayEvents = events.filter(e => e.date === dateStr);
              return (
                <div
                  key={day}
                  className={`cal-date ${day === activeDate ? 'active' : ''} ${isToday ? 'current-today' : ''}`}
                  onClick={() => handleDayClick(day, dateStr, dayEvents)}
                  onMouseEnter={(e) => handleMouseEnter(dateStr, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="date-number">{day}</span>
                  <div className="dot-container">
                    {dayEvents.map((e, i) => {
                      const legend = legendItems.find(l => l.label === e.type || (leaveCategories.includes(e.type) && l.label === 'Leave'));
                      return <div key={i} className={`dot ${legend?.className || 'event'}`} title={e.title}></div>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="cal-legend">
          {legendItems.map(item => (
            <div key={item.label} className="legend-item">
              <span className={`dot ${item.className}`}></span>
              <span className="legend-text">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="calendar-sidebar">
        {!isReadOnly && (
          <button className="sidebar-btn btn-add" onClick={() => { resetForm(); setShowModal(true); }}>
            <div className="sidebar-btn-content"><Plus size={16} /> Add New Event</div>
          </button>
        )}

        <button className="sidebar-btn btn-history" onClick={() => setShowHistoryModal(true)}>
          <div className="sidebar-btn-content"><History size={16} /> View History Log</div>
        </button>

        <div className="sidebar-divider"></div>

        <button className="sidebar-btn btn-upcoming" onClick={() => setShowUpcomingModal(true)}>
          <div className="sidebar-btn-content"><CalIcon size={16} /> Upcoming Events</div>
          <span className="badge">{schoolEvents.length}</span>
        </button>

        <button className="sidebar-btn btn-leave" onClick={() => setShowLeaveModal(true)}>
          <div className="sidebar-btn-content"><Bell size={16} /> Leave Requests</div>
          <span className="badge">{leaveRequests.length}</span>
        </button>

        <button className="sidebar-btn btn-holiday" onClick={() => setShowHolidaysModal(true)}>
          <div className="sidebar-btn-content"><CalendarDays size={16} /> PH Holidays</div>
          <span className="badge">{phHolidaysList.length}</span>
        </button>
      </div>

      {/* Hover Tooltip (Only shows if modal is NOT open) */}
      {!showDateModal && hoveredEvents.length > 0 && hoveredDateStr && (
        <div className="calendar-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y, position: 'fixed' }}>
          {hoveredEvents.map((event, idx) => {
            const legend = legendItems.find(l => l.label === event.type);
            return (
              <div key={idx} className="tooltip-event">
                <div className="tooltip-title">{event.title}</div>
                {event.start_time && (
                  <div className="tooltip-time">{event.start_time?.substring(0,5)} - {event.end_time ? event.end_time.substring(0,5) : '?'}</div>
                )}
                {event.place && <div className="tooltip-place">{event.place}</div>}
                <span className={`event-type-tag inline ${legend?.className || 'school-event'}`}>{event.type}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Specific Date Events Modal */}
      <FormalModal 
        show={showDateModal} 
        onClose={() => setShowDateModal(false)} 
        title={selectedDateStr ? `Events for ${new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Events'} 
        footer={<button className="btn-modal-cancel" onClick={() => setShowDateModal(false)}>Close Window</button>}
      >
        <div className="event-list-scroll">
          {selectedDateStr && events.filter(e => e.date === selectedDateStr).map(renderEventItem)}
        </div>
      </FormalModal>

      {/* Add/Edit Event Modal */}
      {!isReadOnly && (
        <FormalModal
          show={showModal}
          onClose={() => { setShowModal(false); resetForm(); }}
          title={isEditing ? 'Edit Event Details' : 'Create New Event'}
          wide
          footer={
            <>
              <button className="btn-modal-cancel" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="btn-modal-submit" onClick={handleSaveEvent}>
                {isEditing ? 'Save Changes' : 'Create Event'}
              </button>
            </>
          }
        >
          <div className="modal-form-group">
            <label className="modal-label">Event Title *</label>
            <input type="text" className="modal-input" placeholder="e.g. Department Meeting" value={newEvent.title}
              onChange={(e) => setNewEvent({...newEvent, title: e.target.value})} />
          </div>
          <div className="form-row-grid">
            <div className="modal-form-group">
              <label className="modal-label">Date *</label>
              <input type="date" className="modal-input" min={todayDateStr} value={newEvent.date}
                onChange={(e) => setNewEvent({...newEvent, date: e.target.value})} />
            </div>
            <div className="modal-form-group">
              <label className="modal-label">Location</label>
              <input type="text" className="modal-input" placeholder="e.g. Room 101" value={newEvent.place}
                onChange={(e) => setNewEvent({...newEvent, place: e.target.value})} />
            </div>
          </div>
          <div className="form-row-grid">
            <div className="modal-form-group">
              <label className="modal-label">Start Time</label>
              <input type="time" className="modal-input" value={newEvent.start_time}
                onChange={(e) => setNewEvent({...newEvent, start_time: e.target.value})} />
            </div>
            <div className="modal-form-group">
              <label className="modal-label">End Time</label>
              <input type="time" className="modal-input" value={newEvent.end_time}
                onChange={(e) => setNewEvent({...newEvent, end_time: e.target.value})} />
            </div>
          </div>
          <div className="modal-form-group">
            <label className="modal-label">Event Type</label>
            <select className="modal-select" value={newEvent.type}
              onChange={(e) => setNewEvent({...newEvent, type: e.target.value})}>
              {legendItems.filter(l => !leaveCategories.includes(l.label)).map(item => (
                <option key={item.label} value={item.label}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="modal-form-group">
            <label className="modal-label">Description (Optional)</label>
            <textarea className="modal-input" rows={3} placeholder="Add any additional notes here..." value={newEvent.description}
              onChange={(e) => setNewEvent({...newEvent, description: e.target.value})} />
          </div>
        </FormalModal>
      )}

      {/* History Modal */}
      <FormalModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Event History Log"
        wide
        footer={<button className="btn-modal-cancel" onClick={() => setShowHistoryModal(false)}>Close Window</button>}
      >
        <div className="history-filters">
          <div className="history-filter-group">
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="modal-select">
              <option value="">All Months</option>
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => (
                <option key={m} value={m}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
              ))}
            </select>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="modal-select">
              <option value="">All Years</option>
              {Array.from({length:5}, (_,i) => new Date().getFullYear()-i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button className="btn-modal-cancel" onClick={() => { setFilterMonth(''); setFilterYear(''); }}>Clear Filters</button>
        </div>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Event Title</th>
                <th className="text-right">Type</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr><td colSpan="3" className="no-history">No historical records found.</td></tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td className="history-date-cell">{item.date} </td>
                    <td className="history-title-cell">
                      <div className="font-medium text-gray-900">{item.title}</div>
                      {item.description && <div className="history-desc">{item.description}</div>}
                     </td>
                    <td className="history-type-cell text-right">
                      <span className={`event-type-tag ${getEventClass(item.type)}`}>
                        {item.type === 'Holiday' ? 'HOLIDAY' : item.type}
                      </span>
                     </td>
                   </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </FormalModal>

      {/* Upcoming Events Modal */}
      <FormalModal show={showUpcomingModal} onClose={() => setShowUpcomingModal(false)} title="Upcoming Events" footer={<button className="btn-modal-cancel" onClick={() => setShowUpcomingModal(false)}>Close</button>}>
        <div className="event-list-scroll">
          {schoolEvents.length === 0 ? <div className="no-history">No upcoming events scheduled.</div> : schoolEvents.map(renderEventItem)}
        </div>
      </FormalModal>

      {/* Leave Requests Modal */}
      <FormalModal show={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Pending Leave Requests" footer={<button className="btn-modal-cancel" onClick={() => setShowLeaveModal(false)}>Close</button>}>
        <div className="event-list-scroll">
          {leaveRequests.length === 0 ? <div className="no-history">No pending leave requests.</div> : leaveRequests.map(renderEventItem)}
        </div>
      </FormalModal>

      {/* Holidays Modal */}
      <FormalModal show={showHolidaysModal} onClose={() => setShowHolidaysModal(false)} title="Philippine Holidays" footer={<button className="btn-modal-cancel" onClick={() => setShowHolidaysModal(false)}>Close</button>}>
        <div className="event-list-scroll">
          {phHolidaysList.length === 0 ? <div className="no-history">No upcoming holidays recorded.</div> : phHolidaysList.map(renderEventItem)}
        </div>
      </FormalModal>

      {/* Leave Confirmation Modal */}
      {!isReadOnly && (
        <FormalModal
          show={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="Confirm Leave Action"
          small
          footer={
            <>
              <button className="btn-modal-cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className={`btn-modal-submit ${pendingAction.status === 'Rejected' ? 'danger' : ''}`} onClick={confirmUpdateStatus}>
                Confirm {pendingAction.status === 'Approved' ? 'Approval' : 'Rejection'}
              </button>
            </>
          }
        >
          <p>Are you sure you want to <strong>{pendingAction.status === 'Approved' ? 'approve' : 'reject'}</strong> this leave request?</p>
        </FormalModal>
      )}
    </div>
  );
};

export default SharedCalendar;