// src/screens/api.js
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, DeviceEventEmitter } from 'react-native';

// Safe legacy import for Expo SDK 54+ compatibility
let FileSystem;
try {
  FileSystem = require('expo-file-system/legacy');
} catch (e) {
  FileSystem = require('expo-file-system');
}

const LOCAL_IP = "192.168.86.5"; 
const USE_REMOTE = true;
const REMOTE_URL = "https://api.univitahct.tech"; 

export const API_URL = USE_REMOTE ? `${REMOTE_URL}/api` : `http://${LOCAL_IP}:5000/api`;

export const OFFLINE_QUEUE_KEY = '@attendance_queue';


const OFFLINE_SELFIE_FOLDER = 'offline_attendance_selfies/';

const saveOfflineSelfie = async (selfieUri, eventId) => {
  if (!selfieUri || typeof selfieUri !== 'string') {
    throw new Error('A valid selfie is required.');
  }

  const baseDir = FileSystem.documentDirectory;

  if (!baseDir) {
    throw new Error('Persistent storage is unavailable.');
  }

  const folderUri = baseDir + OFFLINE_SELFIE_FOLDER;
  const destinationUri = `${folderUri}${eventId}.jpg`;

  await FileSystem.makeDirectoryAsync(folderUri, {
    intermediates: true
  });

  await FileSystem.copyAsync({
    from: selfieUri,
    to: destinationUri
  });

  const fileInfo = await FileSystem.getInfoAsync(
    destinationUri
  );

  if (!fileInfo.exists || fileInfo.size === 0) {
    await FileSystem.deleteAsync(destinationUri, {
      idempotent: true
    });

    throw new Error('Unable to save the attendance selfie.');
  }

  return destinationUri;
};

const deleteOfflineSelfie = async (selfieUri) => {
  if (!selfieUri || typeof selfieUri !== 'string') {
    return;
  }

  // Only delete copies created for offline attendance.
  const folderUri =
    FileSystem.documentDirectory + OFFLINE_SELFIE_FOLDER;

  if (!selfieUri.startsWith(folderUri)) {
    return;
  }

  try {
    await FileSystem.deleteAsync(selfieUri, {
      idempotent: true
    });
  } catch (error) {
    console.warn(
      'Offline selfie cleanup failed:',
      error?.message || error
    );
  }
};


// ==========================================
// FIX B4: GLOBAL TIMEOUT & EXPONENTIAL BACKOFF
// ==========================================
const DEFAULT_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 30000;

const formatPHTime12h = (dateObj = new Date()) =>
  dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const fetchWithTimeout = async (resource, options = {}) => {
  const { timeout = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
};

const apiFetch = async (url, options = {}, retries = 3, backoff = 1000) => {
  try {
    const response = await fetchWithTimeout(url, options);

    // Retry on Server Errors (5xx) or Rate Limiting (429)
    if ((response.status >= 500 || response.status === 429) && retries > 0) {
      let delay = backoff;
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        delay = parseInt(retryAfter, 10) * 1000 || backoff;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiFetch(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (error) {
    // Retry on Network failures or Aborts (Timeouts)
    const isNetworkError = error.name === 'AbortError' || error.message.includes('Network request failed');
    if (retries > 0 && isNetworkError) {
      await new Promise(resolve => setTimeout(resolve, backoff));
      return apiFetch(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
};

const uploadWithTimeout = async (url, fileUri, options = {}) => {
  return Promise.race([
    FileSystem.uploadAsync(url, fileUri, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Upload timeout exceeded')), UPLOAD_TIMEOUT_MS)
    )
  ]);
};


 // C09 STEP 9: Identify transport errors that may
 // require an offline attendance record.
 const isAttendanceTransportError = (error) => {
   if (error?.name === 'AbortError') {
     return true;
   }

   const message = String(
     error?.message || error || ''
   ).toLowerCase();

   return [
     'upload timeout exceeded',
     'network request failed',
     'network error',
     'network is unreachable',
     'network connection lost',
     'internet connection appears to be offline',
     'failed to connect',
     'connection refused',
     'connection reset',
     'connection timed out',
     'socket timeout',
     'sockettimeoutexception',
     'unable to resolve host',
     'host unreachable',
     'dns lookup failed'
   ].some(text => message.includes(text));
 };

// ==========================================

// ==========================================
// C11.3: Notify the app only for definitive HTTP 401 responses.
// Do not erase the offline attendance queue or persistent selfie files.
// ==========================================
let c11LastExpiredToken = null;
export const resetC11SessionNotification = () => {
  c11LastExpiredToken = null;
};
const c11NotifyExpiredSession = token => {
  if (c11LastExpiredToken === token) return;
  c11LastExpiredToken = token;
  DeviceEventEmitter.emit('univita:session-expired');
};
const c11CodeFromHttp = status => {
  if (status === 401) return 'AUTH_SESSION_EXPIRED';
  if (status === 403) return 'ATTENDANCE_FORBIDDEN';
  if (status === 409) return 'ATTENDANCE_CONFLICT';
  if (status === 429) return 'ATTENDANCE_RATE_LIMITED';
  if (status >= 500) return 'ATTENDANCE_SERVER_ERROR';
  return 'ATTENDANCE_REQUEST_FAILED';
};

// Helper: get auth headers (for JSON requests)
const getAuthHeaders = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Helper: handle API response
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

// Helper: parse FileSystem.uploadAsync response safely
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


const getMimeTypeFromUri = (uri, customName = null) => {
  const filename = customName || uri?.split('/')?.pop() || '';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'jpeg':
    case 'jpg':
    default:
      return 'image/jpeg';
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


// C09: Serialize all offline attendance queue updates.
let offlineQueueLock = Promise.resolve();

const withOfflineQueueLock = async (operation) => {
  const previousOperation = offlineQueueLock;

  let releaseLock;

  offlineQueueLock = new Promise(resolve => {
    releaseLock = resolve;
  });

  await previousOperation;

  try {
    return await operation();
  } finally {
    releaseLock();
  }
};


// ==========================================
// OFFLINE QUEUE
// ==========================================



const queueOfflineAction = async (action, payload) => {
  return withOfflineQueueLock(async () => {
    let savedSelfieUri = null;

    try {
      const existing = await AsyncStorage.getItem(
        OFFLINE_QUEUE_KEY
      );

      const queue = existing ? JSON.parse(existing) : [];

      if (!Array.isArray(queue)) {
        throw new Error('Invalid offline queue data');
      }

      if (queue.length >= 20) {
        return false;
      }

      if (!payload.occurredAt) {
        return false;
      }

      const originalSelfieUri =
        typeof payload.selfie === 'string'
          ? payload.selfie
          : payload.selfie?.uri;

      if (!originalSelfieUri) {
        console.warn('Offline attendance has no selfie.');
        return false;
      }

      // Prevent duplicate events for the same shift.
      const duplicate = queue.some(item =>
        item.action === action &&
        String(item.payload?.employee_id) ===
          String(payload.employee_id) &&
        String(item.payload?.schedule_id) ===
          String(payload.schedule_id)
      );

      if (duplicate) {
        console.warn(
          'C09: Duplicate offline attendance prevented.'
        );
        return false;
      }

      const eventId =
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 12);

      // Save selfie to persistent document storage.
      savedSelfieUri = await saveOfflineSelfie(
        originalSelfieUri,
        eventId
      );

      const savedPayload = {
        ...payload,
        selfie: savedSelfieUri
      };

      queue.push({
        id: eventId,
        action,
        payload: savedPayload,
        timestamp: Date.now()
      });

      await AsyncStorage.setItem(
        OFFLINE_QUEUE_KEY,
        JSON.stringify(queue)
      );

      console.log(
        `C09: ${action} saved safely in offline queue.`
      );

      return true;

    } catch (error) {
      console.error(
        'Offline attendance queue error:',
        error
      );

      if (savedSelfieUri) {
        await deleteOfflineSelfie(savedSelfieUri);
      }

      return false;
    }
  });
};





// C11.4: Read-only queue status for support and UI diagnostics.
// No employee data, selfie URIs or authentication tokens are returned.
export const getOfflineAttendanceQueueStatus = async () => {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(queue)) throw new Error('Invalid queue');
    const rawUser = await AsyncStorage.getItem('user');
    const employeeId = rawUser ? String(JSON.parse(rawUser)?.employee_id || '') : '';
    return {
      success: true,
      pending: queue.filter(item =>
        employeeId && String(item.payload?.employee_id) === employeeId
      ).length,
      hasOtherAccountEvents: queue.some(item =>
        !employeeId || String(item.payload?.employee_id) !== employeeId
      ),
      synchronizing: offlineSyncInProgress
    };
  } catch (error) {
    return { success: false, pending: null, synchronizing: offlineSyncInProgress };
  }
};

let offlineSyncInProgress = false;

export const syncOfflineQueue = async () => {
  if (offlineSyncInProgress) return 0;

  offlineSyncInProgress = true;

  try {
    const rawQueue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!rawQueue) return 0;

    const queue = JSON.parse(rawQueue);
    if (!Array.isArray(queue) || queue.length === 0) return 0;

    const token = await AsyncStorage.getItem('auth_token');
    const rawUser = await AsyncStorage.getItem('user');

    if (!token || !rawUser) {
      console.warn('Offline sync postponed: no active session.');
      return 0;
    }

    const user = JSON.parse(rawUser);
    const currentEmployeeId = String(user?.employee_id || '');

    if (!currentEmployeeId) {
      console.warn('Offline sync postponed: missing employee identity.');
      return 0;
    }

    let submitted = 0;
    const remaining = [];
    const acceptedSelfieUris = [];
    const acceptedEventIds = new Set();

    for (const item of queue) {
      const data = item.payload || {};
      const employeeId = String(data.employee_id || '');

      // Never submit attendance belonging to a different account.
      if (!employeeId || employeeId !== currentEmployeeId) {
        remaining.push(item);
        continue;
      }

      if (!['clock-in', 'clock-out'].includes(item.action)) {
        remaining.push(item);
        continue;
      }

      // Old queue records cannot reliably establish the tap time.
      // Preserve them for manual follow-up rather than inventing a time.
      if (!item.id || !data.occurredAt) {
        console.warn(
          'Legacy offline attendance needs manual review:',
          item.action
        );
        remaining.push(item);
        continue;
      }

      const selfieUri = data.selfie
        ? typeof data.selfie === 'string'
          ? data.selfie
          : data.selfie.uri
        : null;

      if (!selfieUri) {
        console.warn('Offline attendance has no selfie.');
        remaining.push(item);
        continue;
      }

      try {
        const result = await uploadWithTimeout(
          `${API_URL}/attendance/offline-sync`,
          selfieUri,
          {
            httpMethod: 'POST',
            uploadType:
              FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'selfie',
            mimeType: 'image/jpeg',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json'
            },
            parameters: {
              event_id: String(item.id),
              event_type: item.action,
              occurred_at: String(data.occurredAt),
              employee_id: employeeId,
              schedule_id: String(data.schedule_id || ''),
              latitude: String(data.latitude ?? ''),
              longitude: String(data.longitude ?? '')
            }
          }
        );

        const response = parseUploadResult(result);
        if (result.status === 401 || response?.code === 'AUTH_SESSION_EXPIRED') {
          c11NotifyExpiredSession(token);
          console.warn('C11: Offline synchronization paused: session expired.');
          break; // Leave pending events in the queue; do not delete selfies.
        }
        if (result.status === 429 || result.status >= 500) {
          console.warn('C11: Offline sync postponed by server:', result.status);
          break; // Wait for a later reconnect/foreground attempt.
        }

        
if (response?.success && (
  response.pendingReview === true ||
  response.alreadySubmitted === true ||
  response.alreadyRecorded === true
)) {
  submitted++;

  if (response.alreadyRecorded === true) {
    console.log(
      `C09: ${item.action} already exists in official attendance.`
    );
  } else if (response.alreadySubmitted === true) {
    console.log(
      `C09: ${item.action} was previously submitted to HR.`
    );
  } else {
    console.log(
      `C09: ${item.action} submitted for HR review.`
    );
  }

  acceptedEventIds.add(String(item.id));

  acceptedSelfieUris.push(selfieUri);
  continue;
}


        console.warn(
          'Offline attendance not accepted:',
          response?.message || result.status
        );

        // Keep unsuccessful events so the user can
        // request assistance rather than silently lose them.
        remaining.push(item);

      } catch (error) {
        console.warn(
          'Offline attendance sync will retry:',
          error.message
        );
        remaining.push(item);
      }
    }

    
// C09: Safely merge synchronization results
// with the latest offline queue.
await withOfflineQueueLock(async () => {
  const latestRaw = await AsyncStorage.getItem(
    OFFLINE_QUEUE_KEY
  );

  const latestQueue = latestRaw
    ? JSON.parse(latestRaw)
    : [];

  if (!Array.isArray(latestQueue)) {
    throw new Error('Invalid offline queue data');
  }

  // Only remove events accepted by the backend.
  // Preserve newly added events and failed submissions.
  const updatedQueue = latestQueue.filter(
    item => !acceptedEventIds.has(String(item.id))
  );

  await AsyncStorage.setItem(
    OFFLINE_QUEUE_KEY,
    JSON.stringify(updatedQueue)
  );
});

// Delete accepted selfie copies after queue commit.
for (const selfieUri of acceptedSelfieUris) {
  await deleteOfflineSelfie(selfieUri);
}


    if (submitted > 0) {
      console.log(
        `${submitted} offline attendance event(s) acknowledged by server.`
      );
    }

    return submitted;

  } catch (error) {
    console.error('Offline synchronization failed:', error);
    return 0;

  } finally {
    offlineSyncInProgress = false;
  }
};


export const fetchCorrectionHistory = async () => {
  try {
    const headers = await getAuthHeaders();
    const employeeId = await AsyncStorage.getItem('employee_id');
    if (!employeeId) return [];

    const response = await apiFetch(`${API_URL}/attendance/corrections/user/${employeeId}`, { 
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
    const response = await apiFetch(`${API_URL}/user/tracking-enabled`, {
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
// PROFILE PICTURE UPLOAD
// ==========================================
export const updateProfile = async (userId, data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const pic = data.profile_picture;
    const fileUri = pic ? (typeof pic === 'string' ? pic : pic.uri) : null;

    if (fileUri) {
      const mimeType = getMimeTypeFromUri(fileUri, typeof pic === 'object' ? pic.name : null);
      const uploadResult = await uploadWithTimeout(`${API_URL}/users/${userId}/profile`, fileUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'profile_picture',
        mimeType,
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
      const response = await apiFetch(`${API_URL}/users/${userId}/profile`, {
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
    const response = await apiFetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, isMobile: true })
    }, 0); // 0 retries for login to prevent account lockout loops
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: `Network Error: Cannot reach ${API_URL}` };
  }
};


export const sendOtp = async (email, pendingToken) => {
  try {
    const response = await apiFetch(
      `${API_URL}/auth/send-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingToken}`
        },
        body: JSON.stringify({ email })
      },
      0
    );

    return await handleResponse(response);
  } catch (error) {
    return {
      success: false,
      message: 'Network error while sending OTP.'
    };
  }
};



export const verifyOtp = async (email, otp, pendingToken) => {
  try {
    const response = await apiFetch(
      `${API_URL}/auth/verify-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingToken}`
        },
        body: JSON.stringify({ email, otp })
      },
      0
    );

    return await handleResponse(response);
  } catch (error) {
    return {
      success: false,
      message: 'Network error while verifying OTP.'
    };
  }
};


export const forgotPassword = async (email) => {
  try {
    const response = await apiFetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, isMobile: true })
    }, 0);
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: 'Network error' };
  }
};

export const verifyResetOtp = async (email, otp) => {
  try {
    const response = await apiFetch(`${API_URL}/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: 'Network error' };
  }
};

export const resetPassword = async (email, otp, newPassword) => {
  try {
    const response = await apiFetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, newPassword })
    });
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: 'Network error' };
  }
};

// ==========================================
// OVERTIME REQUESTS
// ==========================================
export const submitOvertimeRequest = async (data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const att = data.attachment;
    const attUri = att ? (typeof att === 'string' ? att : att.uri) : null;

    if (attUri) {
      const mimeType = getMimeTypeFromUri(attUri, typeof att === 'object' ? att.name : null);
      const uploadResult = await uploadWithTimeout(`${API_URL}/overtime-requests`, attUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'attachment',
        mimeType,
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
      const response = await apiFetch(`${API_URL}/overtime-requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      return await handleResponse(response);
    }
  } catch (error) {
    return { success: false, message: "Network error" };
  }
};

export const fetchOvertimeHistory = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/overtime-requests`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

export const requestAttendanceCorrection = async (data) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    const selfie = data.selfie;
    const selfieUri = selfie ? (typeof selfie === 'string' ? selfie : selfie.uri) : null;

    if (selfieUri) {
      const mimeType = getMimeTypeFromUri(selfieUri, typeof selfie === 'object' ? selfie.name : null);
      const uploadResult = await uploadWithTimeout(`${API_URL}/attendance/correction-request`, selfieUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'attachment',
        mimeType,
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
      const response = await apiFetch(`${API_URL}/attendance/correction-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      return await handleResponse(response);
    }
  } catch (error) {
    return { success: false, message: 'Network error' };
  }
};

// ==========================================
// ATTENDANCE WITH SELFIE + GEOTAG
// ==========================================
export const sendLocationPing = async (latitude, longitude, location_enabled, location_name, quality = null) => {
  try {
    const headers = await getAuthHeaders();
    const body = { latitude, longitude, location_enabled, location_name };
    if (quality && typeof quality === 'object' && location_enabled === true) {
      body.gps_accuracy = quality.accuracy;
      body.gps_timestamp = quality.timestamp;
    }
    const response = await apiFetch(`${API_URL}/instructor/location`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 0); // 0 retries: location pings happen frequently.
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: error?.message || 'Location transmission failed.' };
  }
};


 // ==========================================
 // C09 STEP 9: SAFE ATTENDANCE SUBMISSION
 // ==========================================

 const submitAttendance = async (action, data) => {
   const isClockIn = action === 'clock-in';
   const actionLabel = isClockIn ? 'Clock-in' : 'Clock-out';
   const endpoint = isClockIn ? 'clock-in' : 'clock-out';

   // Preserve the original time of this attempt.
   const occurredAt = new Date().toISOString();

   // 1. Verify local requirements before uploading.
   const selfie = data?.selfie;
   const selfieUri = selfie
     ? typeof selfie === 'string'
       ? selfie
       : selfie.uri
     : null;

   if (!selfieUri) {
     return {
       success: false,
       queued: false,
       message: `${actionLabel} requires a selfie.`
     };
   }

   if (
     !data?.employee_id ||
     !data?.schedule_id ||
     data.latitude == null ||
     data.longitude == null ||
     data.gps_accuracy == null ||
     !data.gps_timestamp
   ) {
     return {
       success: false,
       queued: false,
       message:
         'Required attendance or GPS information is missing.'
     };
   }

   // 2. Require a valid local session.
   let token;

   try {
     token = await AsyncStorage.getItem('auth_token');
   } catch (error) {
     console.error('Attendance session read failed:', error);

     return {
       success: false,
       queued: false,
       message: 'Unable to read your login session.'
     };
   }

   if (!token) {
     return {
       success: false,
       queued: false,
       message: 'Please sign in again before recording attendance.'
     };
   }

   // 3. Upload attendance using the existing helper.
   try {
     const uploadResult = await uploadWithTimeout(
       `${API_URL}/attendance/${endpoint}`,
       selfieUri,
       {
         httpMethod: 'POST',
         uploadType:
           FileSystem.FileSystemUploadType.MULTIPART,
         fieldName: 'selfie',
         mimeType: 'image/jpeg',
         headers: {
           Authorization: `Bearer ${token}`,
           Accept: 'application/json'
         },
         parameters: {
           employee_id: String(data.employee_id),
           latitude: String(data.latitude),
           longitude: String(data.longitude),
           gps_accuracy: String(data.gps_accuracy),
           gps_timestamp: String(data.gps_timestamp),
           schedule_id: String(data.schedule_id)
         }
       }
     );

     
let response;

try {
  response = JSON.parse(uploadResult.body);
} catch (parseError) {
  console.warn(
    'C09: Attendance server returned invalid JSON.'
  );

  return {
    success: false,
    queued: false,
    message:
      'Attendance confirmation could not be verified. ' +
      'Please check your attendance history before retrying.'
  };
}

if (uploadResult.status === 401 || response?.code === 'AUTH_SESSION_EXPIRED') {
  c11NotifyExpiredSession(token);
  return {
    success: false, queued: false,
    code: 'AUTH_SESSION_EXPIRED',
    message: 'Your login session has expired. Please sign in again.'
  };
}

if (uploadResult.status < 200 || uploadResult.status >= 300) {
  return {
    ...response, success: false, queued: false,
    code: response?.code || c11CodeFromHttp(uploadResult.status),
    message: response?.message || `${actionLabel} was rejected by the server.`
  };
}

if (
  !response ||
  typeof response !== 'object' ||
  response.success !== true
) {
  return {
    success: false,
    queued: false,
    message:
      response?.message ||
      `${actionLabel} was not accepted by the server.`,
    code: response?.code || 'ATTENDANCE_REQUEST_FAILED'
  };
}


     if (
       uploadResult.status < 200 ||
       uploadResult.status >= 300
     ) {
       return {
         ...response,
         success: false,
         queued: false,
         message:
           response?.message ||
           `${actionLabel} was rejected by the server.`
       };
     }

     return {
       ...response,
       queued: false
     };

   } catch (error) {
     // 4. Never queue unexpected local errors.
     if (!isAttendanceTransportError(error)) {
       console.error(
         `C09: ${actionLabel} unexpected upload error:`,
         error
       );

       return {
         success: false,
         queued: false,
         message:
           `${actionLabel} could not be completed. ` +
           'Please retry or contact support.'
       };
     }

     // 5. Connectivity failure or uncertain timeout.
     // Keep the original attempt time.
     console.warn(
       `C09: ${actionLabel} upload outcome uncertain:`,
       error?.message || error
     );

     const saved = await queueOfflineAction(action, {
       ...data,
       occurredAt
     });

     if (!saved) {
       return {
         success: false,
         queued: false,
         message:
           `${actionLabel} could not be submitted ` +
           'or saved offline. Please request assistance.'
       };
     }

     const tapTimeStr = formatPHTime12h(
       new Date(occurredAt)
     );

     return {
       success: false,
       queued: true,
       message:
         `Your ${tapTimeStr} ${actionLabel.toLowerCase()} ` +
         'attempt was saved offline. ' +
         'It will be submitted for HR verification ' +
         'when the connection returns.'
     };
   }
 };

 // C11.2: Single flight for same action / employee / schedule.
 const c11InFlightSubmissions = new Map();
 const c11SubmitOnce = (action, data) => {
   const key = `${action}:${data?.employee_id}:${data?.schedule_id}`;
   if (c11InFlightSubmissions.has(key)) {
     return Promise.resolve({ success: false, queued: false,
       code: 'ATTENDANCE_REQUEST_IN_PROGRESS',
       message: 'Your attendance submission is already processing.' });
   }
   const pending = Promise.resolve().then(() => submitAttendance(action, data));
   c11InFlightSubmissions.set(key, pending);
   return pending.finally(() => c11InFlightSubmissions.delete(key));
 };

 export const clockIn = async data => c11SubmitOnce('clock-in', data);
 export const clockOut = async data => c11SubmitOnce('clock-out', data);


export const fetchAttendanceHistory = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/attendance/user/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
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
    const imageObj = payload.image || payload.attachment;
    const imageUri = imageObj ? (typeof imageObj === 'string' ? imageObj : imageObj.uri) : null;

    
    if (!imageUri) {
      return { success: false, message: 'An attachment (Image/PDF/DOC) is strictly required.' };
    }

    const mimeType = getMimeTypeFromUri(imageUri, typeof imageObj === 'object' ? imageObj.name : null);
    
    
    const requestsPayload = Array.isArray(payload.requests) ? payload.requests : [];

    const uploadResult = await uploadWithTimeout(`${API_URL}/leave-requests`, imageUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'image',
      mimeType,
      headers: { 
        Authorization: `Bearer ${token || ''}`, 
        Accept: 'application/json' 
      },
      parameters: {
        type: String(payload.type || ''),
        reason: String(payload.reason || '').trim(),
        
        requests: JSON.stringify(requestsPayload), 
        is_paid: String(payload.is_paid || '1')
      }
    });
    
    return parseUploadResult(uploadResult);
  } catch (error) {
    console.error("Submit Leave Request Error:", error);
    return { success: false, message: "Server unreachable. Please check your connection." };
  }
};

export const fetchMyLeaveRequests = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/leave-requests/user/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

export const updateLeaveStatus = async (id, status) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/leave-requests/${id}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status })
    });
    return await handleResponse(response);
  } catch (error) {
    return { success: false };
  }
};

export const dismissLeaveRequest = async (id) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/leave-requests/${id}/dismiss`, {
      method: 'PUT',
      headers
    });
    return await handleResponse(response);
  } catch (error) {
    return { success: false };
  }
};

// ==========================================
// SCHEDULES & EVENTS
// ==========================================
export const fetchUserSchedule = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/schedules/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

export const fetchEvents = async () => {
  try {
    const headers = await getAuthHeaders(); // 
    const response = await apiFetch(`${API_URL}/events`, { headers }); 
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

// ==========================================
// PAYROLL & BALANCES
// ==========================================
export const fetchEmployeePayrollHistory = async (employeeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/payroll/employee-history/${employeeId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

export const fetchLeaveBalances = async (userId, year = new Date().getFullYear()) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/leave-balances/${userId}?year=${year}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

export const fetchLeaveTypes = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/leave-types`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

// ==========================================
// EMERGENCY ALERTS
// ==========================================
export const fetchEmergencyAlerts = async (userId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/emergency-alerts/active?userId=${userId}`, { headers });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

export const markAlertAsRead = async (alertId, userId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/emergency-alerts/${alertId}/read`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId })
    });
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: "Network error" };
  }
};

// ==========================================
// USER / PASSWORD
// ==========================================
export const updatePassword = async (identifier, data) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/users/${identifier}/update-password`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: "Network error" };
  }
};

export const addManualCtoCredit = async (employeeId, creditHours, reason, year = new Date().getFullYear()) => {
  try {
    const headers = await getAuthHeaders();
    const response = await apiFetch(`${API_URL}/leave-balances/manual-cto`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        employee_id: employeeId,
        credit_hours: creditHours,
        reason,
        year
      })
    });
    return await handleResponse(response);
  } catch (error) {
    return { success: false, message: "Network error" };
  }
};

// C12.1–C12.4: authoritative scheduled-attendance statuses, plus local events.
// A local event is never claimed to be accepted by HR until the server says so.
export const fetchC12AttendanceRecovery = async (employeeId, from, to) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (!token) return { success: false, data: [], message: 'Sign in to view attendance status.' };
  const params = new URLSearchParams();
  const phToday = new Date(Date.now() + 8 * 3600000);
  const phStart = new Date(phToday.getTime() - 30 * 86400000);
  params.append('from', from || phStart.toISOString().slice(0, 10));
  params.append('to', to || phToday.toISOString().slice(0, 10));
  try {
    const url = `${API_URL}/attendance/recovery/user/${encodeURIComponent(String(employeeId))}?${params.toString()}`;
    const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) c11NotifyExpiredSession(token);
    const result = await handleResponse(response);
    return result?.success && Array.isArray(result.data) ? result : {
      success: false, data: [], message: result?.message || 'Unable to load attendance recovery status.'
    };
  } catch (error) {
    return { success: false, data: [], message: 'Attendance recovery is temporarily unavailable.' };
  }
};

export const getC12LocalAttendanceEvents = async () => {
  try {
    const [rawQueue, rawUser] = await Promise.all([
      AsyncStorage.getItem(OFFLINE_QUEUE_KEY), AsyncStorage.getItem('user')
    ]);
    const employeeId = rawUser ? String(JSON.parse(rawUser)?.employee_id || '') : '';
    const all = rawQueue ? JSON.parse(rawQueue) : [];
    if (!Array.isArray(all)) throw new Error('Invalid offline attendance queue');
    return { success: true, data: all.filter(item => employeeId &&
      String(item.payload?.employee_id) === employeeId).map(item => ({
        id: String(item.id), schedule_id: String(item.payload?.schedule_id || ''),
        event_type: item.action, occurred_at: item.payload?.occurredAt || null,
        status: 'WAITING_TO_SYNC'
      })) };
  } catch (error) {
    return { success: false, data: [], message: 'Unable to read locally saved attendance.' };
  }
};

// C13.3 / C13.4: UI guidance only. Corrections still use existing HR workflow.
export const getC13RecoveryGuidance = item => {
  const state = item?.recovery_state || '';
  if (state === 'NEEDS_CORRECTION') return 'Shift ended without Clock Out. Request an attendance correction using your actual time, then wait for HR review.';
  if (state === 'NEEDS_REVIEW') return 'No official attendance found for this shift. Contact HR or submit an appeal when appropriate.';
  if (state === 'AWAITING_HR') return 'Submitted to HR. Avoid submitting a duplicate request; check Correction or Appeal History for a decision.';
  if (state === 'RESOLVED') return 'Official attendance is recorded. No recovery action needed.';
  if (state === 'IN_PROGRESS') return 'The shift is still active. Clock Out normally when finished.';
  return '';
};

// C14: Durable attendance notification inbox (user identity comes from JWT).
export const fetchC14AttendanceNotifications = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  if (!token) return { success: false, data: [], unread: 0 };
  const response = await fetchWithTimeout(`${API_URL}/attendance/notifications`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const data = await handleResponse(response);
  if (response.status === 401) c11NotifyExpiredSession(token);
  if (!response.ok || !data?.success) throw new Error(data?.message || 'Attendance notifications unavailable.');
  return data;
};
export const markC14AttendanceNotificationRead = async id => {
  const token = await AsyncStorage.getItem('auth_token');
  if (!token) throw new Error('Please log in again.');
  const response = await fetchWithTimeout(`${API_URL}/attendance/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) c11NotifyExpiredSession(token);
  const data = await handleResponse(response);
  if (!response.ok || !data?.success) throw new Error(data?.message || 'Unable to mark notification as read.');
  return data;
};
