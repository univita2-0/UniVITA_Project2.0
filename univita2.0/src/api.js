/* univita2.0/src/api.js */

export const API_BASE = "https://api.univitahct.tech/api";

// Helper to handle JSON parsing safely and prevent dashboard crashes
const handleWebResponse = async (res) => {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await res.json();
    } else {
        const errorText = await res.text();
        console.error("Dashboard API Error (Non-JSON):", errorText.substring(0, 200));
        return { 
            success: false, 
            message: "Server connection failed or returned an invalid response.",
            data: [] 
        };
    }
};

// Helper to reliably attach authorization headers
const getWebAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

// ==========================================
// PASSWORD RESET (Public)
// ==========================================
export const requestPasswordReset = async (email) => {
    try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Forgot Password Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const resetPassword = async (data) => {
    try {
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Reset Password Error:", error);
        return { success: false, message: "Network error" };
    }
};

// ==========================================
// AUTHENTICATION (Public)
// ==========================================
export const login = async (data) => {
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Login Error:", error);
        return { success: false, message: "Server connection failed" };
    }
};

// ==========================================
// EMPLOYEE MANAGEMENT (Web Dashboard)
// ==========================================
export const fetchEmployees = async () => {
    try {
        const res = await fetch(`${API_BASE}/employees`, {
            headers: getWebAuthHeaders()
        });
        const data = await handleWebResponse(res);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Fetch Employees Error:", error);
        return [];
    }
};

export const addEmployee = async (employeeData) => {
    try {
        const res = await fetch(`${API_BASE}/employees`, {
            method: 'POST',
            headers: getWebAuthHeaders(), 
            body: JSON.stringify(employeeData)
        });
        return await handleWebResponse(res); 
    } catch (error) {
        console.error("Add Employee Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const updateEmployee = async (id, employeeData) => {
    try {
        const res = await fetch(`${API_BASE}/employees/${id}`, {
            method: 'PUT',
            headers: getWebAuthHeaders(),
            body: JSON.stringify(employeeData)
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Update Employee Error:", error);
        return { success: false };
    }
};

export const deleteEmployee = async (id) => {
    try {
        const res = await fetch(`${API_BASE}/employees/${id}`, {
            method: 'DELETE',
            headers: getWebAuthHeaders()
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Delete Employee Error:", error);
        return { success: false };
    }
};

// ==========================================
// ATTENDANCE MANAGEMENT
// ==========================================
export const fetchAttendanceReport = async (date) => {
    try {
        const res = await fetch(`${API_BASE}/attendance-report?date=${date}`, {
            headers: getWebAuthHeaders()
        });
        const data = await handleWebResponse(res);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Fetch Attendance Error:", error);
        return [];
    }
};

// ==========================================
// LEAVE REQUESTS (Admin Management)
// ==========================================
export const fetchLeaveRequests = async () => {
    try {
        const res = await fetch(`${API_BASE}/leave-requests/all`, {
            headers: getWebAuthHeaders()
        }); 
        const data = await handleWebResponse(res);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Fetch Leave Requests Error:", error);
        return [];
    }
};

export const updateLeaveStatus = async (id, status, remarks = "") => {
    try {
        const res = await fetch(`${API_BASE}/leave-requests/${id}`, {
            method: 'PUT',
            headers: getWebAuthHeaders(),
            body: JSON.stringify({ status, admin_remarks: remarks })
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Update Leave Error:", error);
        return { success: false };
    }
};

// ==========================================
// SCHEDULES & EVENTS
// ==========================================
export const fetchAllSchedules = async () => {
    try {
        const res = await fetch(`${API_BASE}/schedules`, {
            headers: getWebAuthHeaders()
        }); 
        const data = await handleWebResponse(res);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Fetch Schedules Error:", error);
        return [];
    }
};

export const addSchedule = async (scheduleData) => {
    try {
        const res = await fetch(`${API_BASE}/schedules`, {
            method: 'POST',
            headers: getWebAuthHeaders(),
            body: JSON.stringify(scheduleData)
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Add Schedule Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const fetchEvents = async () => {
    try {
        const res = await fetch(`${API_BASE}/events`, {
            headers: getWebAuthHeaders()
        });
        const data = await handleWebResponse(res);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Fetch Events Error:", error);
        return [];
    }
};

export const addEvent = async (eventData) => {
    try {
        const res = await fetch(`${API_BASE}/events`, {
            method: 'POST',
            headers: getWebAuthHeaders(),
            body: JSON.stringify(eventData)
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Add Event Error:", error);
        return { success: false };
    }
};

// ==========================================
// PAYROLL (NEW)
// ==========================================
export const fetchAttendanceMonthly = async (month, year) => {
    try {
        const res = await fetch(`${API_BASE}/attendance-monthly?month=${month}&year=${year}`, {
            headers: getWebAuthHeaders()
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Attendance Monthly Error:", error);
        return [];
    }
};

export const finalizePayroll = async (payload) => {
    try {
        const res = await fetch(`${API_BASE}/payroll/finalize`, {
            method: 'POST',
            headers: getWebAuthHeaders(),
            body: JSON.stringify(payload)
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Finalize Payroll Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const runMonthlyPayroll = async (month, year) => {
    try {
        const res = await fetch(`${API_BASE}/payroll/run-monthly`, {
            method: 'POST',
            headers: getWebAuthHeaders(),
            body: JSON.stringify({ month, year })
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Run Monthly Payroll Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const fetchPayrollHistory = async () => {
    try {
        const res = await fetch(`${API_BASE}/payroll/history`, {
            headers: getWebAuthHeaders()
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Payroll History Error:", error);
        return [];
    }
};

// ==========================================
// LEAVE BALANCES (Admin)
// ==========================================
export const fetchLeaveTypes = async () => {
    try {
        const res = await fetch(`${API_BASE}/leave-types`, {
            headers: getWebAuthHeaders()
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Leave Types Error:", error);
        return [];
    }
};

export const fetchLeaveBalancesForEmployee = async (userId, year = new Date().getFullYear()) => {
    try {
        const res = await fetch(`${API_BASE}/leave-balances/${userId}?year=${year}`, {
            headers: getWebAuthHeaders()
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Leave Balances Error:", error);
        return [];
    }
};

export const updateLeaveBalance = async (userId, leaveTypeId, remainingDays, year) => {
    try {
        const res = await fetch(`${API_BASE}/leave-balances/${userId}`, {
            method: 'PUT',
            headers: getWebAuthHeaders(),
            body: JSON.stringify({ leave_type_id: leaveTypeId, remaining_days: remainingDays, year })
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Update Leave Balance Error:", error);
        return { success: false };
    }
};

// ==========================================
// EMERGENCY ALERTS (Admin)
// ==========================================
export const sendEmergencyAlert = async (alertData) => {
    try {
        const res = await fetch(`${API_BASE}/emergency-alerts`, {
            method: 'POST',
            headers: getWebAuthHeaders(),
            body: JSON.stringify(alertData)
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Send Emergency Alert Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const fetchAllEmergencyAlerts = async () => {
    try {
        const res = await fetch(`${API_BASE}/emergency-alerts`, {
            headers: getWebAuthHeaders()
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Emergency Alerts Error:", error);
        return [];
    }
};

export const fetchActiveAlertsForUser = async (userId) => {
    try {
        const res = await fetch(`${API_BASE}/emergency-alerts/active?userId=${userId}`, {
            headers: getWebAuthHeaders()
        });
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Active Alerts Error:", error);
        return [];
    }
};

// ==========================================
// OVERTIME REQUESTS (Web Admin)
// ==========================================
export const fetchPendingOvertimeRequests = async () => {
  try {
    const res = await fetch(`${API_BASE}/overtime-requests/pending`, {
      headers: getWebAuthHeaders()
    });
    return await handleWebResponse(res);
  } catch (error) {
    console.error("Fetch Pending Overtime Error:", error);
    return [];
  }
};

export const updateOvertimeStatus = async (id, status) => {
  try {
    const res = await fetch(`${API_BASE}/overtime-requests/${id}/status`, {
      method: 'PUT',
      headers: getWebAuthHeaders(),
      body: JSON.stringify({ status })
    });
    return await handleWebResponse(res);
  } catch (error) {
    console.error("Update Overtime Status Error:", error);
    return { success: false };
  }
};

// ==========================================
// ATTENDANCE CORRECTIONS (Web Admin)
// ==========================================
export const fetchPendingCorrections = async () => {
  try {
    const res = await fetch(`${API_BASE}/attendance/corrections/pending`, {
      headers: getWebAuthHeaders()
    });
    return await handleWebResponse(res);
  } catch (error) {
    console.error("Fetch Pending Corrections Error:", error);
    return [];
  }
};

export const reviewCorrection = async (id, status) => {
  try {
    const res = await fetch(`${API_BASE}/attendance/corrections/${id}/review`, {
      method: 'PUT',
      headers: getWebAuthHeaders(),
      body: JSON.stringify({ status })
    });
    return await handleWebResponse(res);
  } catch (error) {
    console.error("Review Correction Error:", error);
    return { success: false };
  }
};