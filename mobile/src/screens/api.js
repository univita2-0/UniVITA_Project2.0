import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';

const LOCAL_IP = "192.168.86.5"; 

const USE_REMOTE = true;
const REMOTE_URL = "https://api.univitahct.tech"; 

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
    return { success: false, message: "Server connection failed. Please check your network." };
  }
};

// Helper: parse FileSystem.uploadAsync response string
const parseUploadResult = (uploadResult) => {
  try {
    const data = JSON.parse(uploadResult.body);
    return data;
  } catch (e) {
    return { 
      success: uploadResult.status >= 200 && uploadResult.status < 300, 
      message: uploadResult.body || 'Server upload error' 
    };
  }
};

// Enforce GPS / Location Services Enabled Check
export const checkLocationServicesEnabled = async () => {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      Alert.alert(
        "GPS Required",
        "Location services are disabled. Please turn on your GPS/Location to clock in.",
        [{ text: "OK" }]
      );
      return false;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        "Permission Denied",
        "Location permission is required to verify your attendance location.",
        [{ text: "OK" }]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Location Check Error:", error);
    return false;
  }
};

// ==========================================
// OFFLINE QUEUE
// ==========================================
const queueOfflineAction = async (action, payload) => {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = existing ? JSON.parse(existing) : [];
    queue.push({ action, payload, timestamp: Date.now() });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[Offline] Action '${action}' queued for sync.`);
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

    const token = await AsyncStorage.getItem('auth_token');
    let synced = 0;
    const remaining = [];
    
    for (const item of queue) {
      try {
        const data = item.payload;
        const endpoint = item.action === 'clock-in' ? '/attendance/clock-in' : '/attendance/clock-out';
        const selfieUri = data.selfie ? (typeof data.selfie === 'string' ? data.selfie : data.selfie.uri) : null;

        if (selfieUri) {
          const uploadResult = await FileSystem.uploadAsync(`${API_URL}${endpoint}`, selfieUri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'selfie',
            headers: { Authorization: `Bearer ${token || ''}`, Accept: 'application/json' },
            parameters: {
              employee_id: String(data.employee_id || ''),
              latitude: String(data.latitude || ''),
              longitude: String(data.longitude || ''),
              schedule_id: String(data.schedule_id || '')
            }
          });
          const res = parseUploadResult(uploadResult);
          if (res.success) {
            synced++;
            continue;
          }
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

// Fetch correction history for the logged-in user
export const fetchCorrectionHistory = async () => {
  try {
    const headers = await getAuthHeaders();
    const employeeId = await AsyncStorage.getItem('employee_id');
    
    if (!employeeId) return [];

    const response = await fetch(`${API_URL}/attendance/corrections/user/${employeeId}`, { 
      method: 'GET',
      headers 
    });
    
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch Correction History Error:", error.message);
    return [];
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
// PROFILE PICTURE UPLOAD (File-System Multipart)
// ==========================================
export const updateProfile = async (userId, data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const pic = data.profile_picture;
    const fileUri = pic ? (typeof pic === 'string' ? pic : pic.uri) : null;

    if (fileUri) {
      const uploadResult = await FileSystem.uploadAsync(`${API_URL}/users/${userId}/profile`, fileUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'profile_picture',
        headers: {
          Authorization: `Bearer ${token || ''}`,
          Accept: 'application/json',
        },
        parameters: {
          full_name: String(data.full_name || ''),
          email: String(data.email || ''),
          phone_number: String(data.phone_number || '')
        }
      });
      return parseUploadResult(uploadResult);
    } else {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/users/${userId}/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          full_name: data.full_name,
          email: data.email,
          phone_number: data.phone_number
        })
      });
      return await handleResponse(response);
    }
  } catch (error) {
    console.error("Update Profile Error:", error);
    return { success: false, message: error.message || 'Failed to update profile.' };
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
      body: JSON.stringify({ email, password, isMobile: true })
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
      body: JSON.stringify({ email, isMobile: true })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Forgot Password Error:", error.message);
    return { success: false, message: 'Network error' };
  }
};

export const verifyResetOtp = async (email, otp) => {
  try {
    const response = await fetch(`${API_URL}/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    return await handleResponse(response);
  } catch (error) {
    console.error("Verify Reset OTP Error:", error.message);
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
export const submitOvertimeRequest = async (data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const att = data.attachment;
    const attUri = att ? (typeof att === 'string' ? att : att.uri) : null;

    if (attUri) {
      const uploadResult = await FileSystem.uploadAsync(`${API_URL}/overtime-requests`, attUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'attachment',
        headers: { Authorization: `Bearer ${token || ''}`, Accept: 'application/json' },
        parameters: {
          date: String(data.date || ''),
          start_time: String(data.start_time || ''),
          end_time: String(data.end_time || ''),
          reason: String(data.reason || ''),
          scenario_type: String(data.scenario_type || 'normal_ot'),
          overtime_type: String(data.overtime_type || 'Regular Overtime'),
          schedule_id: String(data.schedule_id || '')
        }
      });
      return parseUploadResult(uploadResult);
    } else {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/overtime-requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      return await handleResponse(response);
    }
  } catch (error) {
    console.error("Submit Overtime Error:", error.message);
    return { success: false, message: "Network error" };
  }
};

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

export const requestAttendanceCorrection = async (data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const selfie = data.selfie;
    const selfieUri = selfie ? (typeof selfie === 'string' ? selfie : selfie.uri) : null;

    if (selfieUri) {
      const uploadResult = await FileSystem.uploadAsync(`${API_URL}/attendance/correction-request`, selfieUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'selfie',
        headers: { Authorization: `Bearer ${token || ''}`, Accept: 'application/json' },
        parameters: {
          employee_id: String(data.employee_id || ''),
          date: String(data.date || ''),
          type: String(data.type || ''),
          time: String(data.time || ''),
          reason: String(data.reason || ''),
          schedule_id: String(data.schedule_id || '')
        }
      });
      return parseUploadResult(uploadResult);
    } else {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/attendance/correction-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      return await handleResponse(response);
    }
  } catch (error) {
    console.error("Correction Request Error:", error.message);
    return { success: false, message: 'Network error' };
  }
};

// ==========================================
// ATTENDANCE WITH SELFIE + GEOTAG
// ==========================================
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

export const clockIn = async (data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const selfie = data.selfie;
    const selfieUri = selfie ? (typeof selfie === 'string' ? selfie : selfie.uri) : null;

    if (selfieUri) {
      const uploadResult = await FileSystem.uploadAsync(`${API_URL}/attendance/clock-in`, selfieUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'selfie',
        headers: { Authorization: `Bearer ${token || ''}`, Accept: 'application/json' },
        parameters: {
          employee_id: String(data.employee_id || ''),
          latitude: String(data.latitude || ''),
          longitude: String(data.longitude || ''),
          schedule_id: String(data.schedule_id || '')
        }
      });
      return parseUploadResult(uploadResult);
    } else {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/attendance/clock-in`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      return await handleResponse(response);
    }
  } catch (error) {
    console.error("Clock In API Error:", error.message);
    await queueOfflineAction('clock-in', data);
    return { success: true, message: "Network unavailable. Saved offline and will sync when connection is restored." };
  }
};

export const clockOut = async (data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const selfie = data.selfie;
    const selfieUri = selfie ? (typeof selfie === 'string' ? selfie : selfie.uri) : null;

    if (selfieUri) {
      const uploadResult = await FileSystem.uploadAsync(`${API_URL}/attendance/clock-out`, selfieUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'selfie',
        headers: { Authorization: `Bearer ${token || ''}`, Accept: 'application/json' },
        parameters: {
          employee_id: String(data.employee_id || ''),
          latitude: String(data.latitude || ''),
          longitude: String(data.longitude || ''),
          schedule_id: String(data.schedule_id || '')
        }
      });
      return parseUploadResult(uploadResult);
    } else {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/attendance/clock-out`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      return await handleResponse(response);
    }
  } catch (error) {
    console.error("Clock Out API Error:", error.message);
    await queueOfflineAction('clock-out', data);
    return { success: true, message: "Network unavailable. Saved offline and will sync when connection is restored." };
  }
};

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

export const fetchAttendanceReport = fetchAttendanceHistory;

// ==========================================
// LEAVE REQUESTS
// ==========================================
export const submitLeaveRequest = async (payload) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    
    // If payload is already FormData (unlikely here since RequestsScreen loops and fetches directly), 
    // but if passed as object:
    const imageObj = payload.image || payload.attachment;
    const imageUri = imageObj ? (typeof imageObj === 'string' ? imageObj : imageObj.uri) : null;

    if (imageUri) {
      const uploadResult = await FileSystem.uploadAsync(`${API_URL}/leave-requests`, imageUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'image',
        headers: { Authorization: `Bearer ${token || ''}`, Accept: 'application/json' },
        parameters: {
          type: String(payload.type || ''),
          reason: String(payload.reason || ''),
          request_date: String(payload.request_date || ''),
          duration: String(payload.duration || 'Whole Day'),
          is_paid: String(payload.is_paid || '1')
        }
      });
      return parseUploadResult(uploadResult);
    } else {
      let headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/leave-requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return await handleResponse(response);
    }
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
// PAYROLL & BALANCES
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