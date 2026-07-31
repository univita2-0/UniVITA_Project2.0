
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';



// Set this to true to use the ngrok tunnel
const USE_REMOTE = true;
const REMOTE_URL = "https://fit-satirical-attire.ngrok-free.dev"; // your current ngrok URL
export const API_URL = USE_REMOTE ? `${REMOTE_URL}/api` : `http://${LOCAL_IP}:5000/api`;

const OFFLINE_QUEUE_KEY = '@attendance_queue';

// Helper: get auth headers (for JSON requests)
const getAuthHeaders = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Helper: handle API response (works for both JSON and text)
const handleResponse = async (response) => {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  } else {
    const errorText = await response.text();
    console.error("Server Error (non-JSON):", errorText.substring(0, 200));
    return { success: false, message: "Server returned an error page. Check backend connection." };
  }
};

// ==========================================
// OFFLINE QUEUE (kept for backward compatibility, but not used for FormData)
// ==========================================
const queueOfflineAction = async (action, payload) => {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = existing ? JSON.parse(existing) : [];
    queue.push({ action, payload, timestamp: Date.now() });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`Queued ${action} for offline sync`);
  } catch (e) {
    console.error("Failed to queue offline action", e);
  }
};

export const syncOfflineQueue = async () => {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!existing) return 0;
    const queue = JSON.parse(existing);
    if (queue.length === 0) return 0;

    const headers = await getAuthHeaders();
    let synced = 0;
    const remaining = [];
    for (const item of queue) {
      let response;
      try {
        if (item.action === 'clock-in') {
          response = await fetch(`${API_URL}/clock-in`, {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload)
          });
        } else if (item.action === 'clock-out') {
          response = await fetch(`${API_URL}/clock-out`, {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload)
          });
        }
        if (response && response.ok) {
          synced++;
          continue;
        }
      } catch (err) {
        console.error(`Sync failed for ${item.action}:`, err);
      }
      remaining.push(item);
    }
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    return synced;
  } catch (e) {
    console.error("Sync error:", e);
    return 0;
  }
};

export const setTrackingEnabled = async (enabled) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/user/tracking-enabled`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled })
    });
    return await response.json();
  } catch (error) {
    console.error("Set tracking enabled error:", error);
    return { success: false };
  }
};

// ==========================================
// AUTHENTICATION
// ==========================================
export const loginUser = async (email, password) => {
  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Login Error:", error.message);
    return { success: false, message: `Network Error: Cannot reach ${API_URL}` };
  }
};

export const sendOtp = async (email) => {
  try {
    const response = await fetch(`${API_URL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Send OTP Error:", error.message);
    return { success: false, message: 'Network error' };
  }
};

export const verifyOtp = async (email, otp) => {
  try {
    const response = await fetch(`${API_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Verify OTP Error:", error.message);
    return { success: false, message: 'Network error' };
  }
};

export const forgotPassword = async (email) => {
  try {
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Forgot Password Error:", error.message);
    return { success: false, message: 'Network error' };
  }
};

export const resetPassword = async (email, otp, newPassword) => {
  try {
    const response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, newPassword })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Reset Password Error:", error.message);
    return { success: false, message: 'Network error' };
  }
};

// ==========================================
// OVERTIME REQUESTS (Mobile)
// ==========================================

// Submit an overtime request with optional attachment
export const submitOvertimeRequest = async (formData) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_URL}/overtime-requests`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Submit Overtime Error:", error.message);
    return { success: false, message: "Network error" };
  }
};

// Fetch overtime request history for the logged‑in instructor
export const fetchOvertimeHistory = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/overtime-requests`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Overtime History Error:", error.message);
    return [];
  }
};
// Request attendance correction (forgot clock in/out)
export const requestAttendanceCorrection = async (formData) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/attendance/correction-request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Correction Request Error:", error.message);
    return { success: false, message: 'Network error' };
  }
};

// ==========================================
// ATTENDANCE WITH SELFIE + GEOTAG (no biometric)
// ==========================================

// Add this to api.js
export const sendLocationPing = async (latitude, longitude, location_enabled, location_name) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/instructor/location`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, location_enabled, location_name })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Location Ping Error:", error.message);
    return { success: false };
  }
};
// Clock In – accepts FormData with fields: employee_id, latitude, longitude, selfie (file)
export const clockIn = async (formData) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    
    // Note: Do NOT set 'Content-Type' header here. 
    // fetch will automatically set it to 'multipart/form-data' with the correct boundary.
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_URL}/attendance/clock-in`, {
      method: 'POST',
      headers,
      body: formData // Your formData now contains employee_id, lat, long, selfie, AND schedule_id
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error("Clock In API Error:", error.message);
    return { success: false, message: "Network error: " + error.message };
  }
};

export const clockOut = async (formData) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_URL}/attendance/clock-out`, {
      method: 'POST',
      headers,
      body: formData // Now includes schedule_id for targeted clock-out
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error("Clock Out API Error:", error.message);
    return { success: false, message: "Network error: " + error.message };
  }
};

// Fetch attendance history for a user (employeeId)
export const fetchAttendanceHistory = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/attendance/user/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Attendance History Error:", error.message);
    return [];
  }
};

// Legacy alias (keep for compatibility)
export const fetchAttendanceReport = fetchAttendanceHistory;

// ==========================================
// LEAVE REQUESTS
// ==========================================
export const submitLeaveRequest = async (payload) => {
  try {
    let headers = await getAuthHeaders();
    let response;
    if (payload instanceof FormData) {
      delete headers['Content-Type'];
      response = await fetch(`${API_URL}/leave-requests`, {
        method: 'POST',
        headers,
        body: payload,
      });
    } else {
      response = await fetch(`${API_URL}/leave-requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    }
    return await handleResponse(response);
  } catch (error) {
    console.error("Submit Leave Error:", error.message);
    return { success: false, message: "Server unreachable" };
  }
};

export const fetchMyLeaveRequests = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/leave-requests/user/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Leave Error:", error.message);
    return [];
  }
};

export const updateLeaveStatus = async (id, status) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/leave-requests/${id}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Status Update Error:", error.message);
    return { success: false };
  }
};

export const dismissLeaveRequest = async (id) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/leave-requests/${id}/dismiss`, {
      method: 'PUT',
      headers
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Dismiss Request Error:", error.message);
    return { success: false };
  }
};

// ==========================================
// SCHEDULES & EVENTS
// ==========================================
export const fetchUserSchedule = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/schedules/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch User Schedule Error:", error.message);
    return [];
  }
};

// ==========================================
// SCHEDULE REQUESTS
// ==========================================
export const submitScheduleRequest = async (requestData) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/schedule-requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    const result = await handleResponse(response);
    return result;
  } catch (error) {
    console.error("Schedule Request Error:", error.message);
    return { success: false, message: "Network error: " + error.message };
  }
};

export const fetchEvents = async () => {
  try {
    const response = await fetch(`${API_URL}/events`);
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Events Error:", error.message);
    return [];
  }
};

// ==========================================
// PAYROLL
// ==========================================
export const fetchEmployeePayrollHistory = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/payroll/employee-history/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Employee Payroll Error:", error.message);
    return [];
  }
};

// ==========================================
// LEAVE BALANCES
// ==========================================
export const fetchLeaveBalances = async (userId, year = new Date().getFullYear()) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/leave-balances/${userId}?year=${year}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Leave Balances Error:", error.message);
    return [];
  }
};

export const fetchLeaveTypes = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/leave-types`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Leave Types Error:", error.message);
    return [];
  }
};

// ==========================================
// EMERGENCY ALERTS
// ==========================================
export const fetchEmergencyAlerts = async (userId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/emergency-alerts/active?userId=${userId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Emergency Alerts Error:", error.message);
    return [];
  }
};

export const markAlertAsRead = async (alertId, userId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/emergency-alerts/${alertId}/read`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Mark Alert Read Error:", error.message);
    return { success: false, message: "Network error" };
  }
};

// ==========================================
// USER / PASSWORD
// ==========================================
export const updatePassword = async (identifier, data) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/users/${identifier}/update-password`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Update Password Error:", error.message);
    return { success: false, message: "Network error" };
  }
};