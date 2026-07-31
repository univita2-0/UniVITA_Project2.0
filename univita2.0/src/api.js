/* univita2.0/src/api.js */

const API_BASE = process.env.REACT_APP_API_URL || 'https://univitaproject20-production.up.railway.app/api';

export { API_BASE };

// Helper to handle JSON parsing safely and prevent dashboard crashes
const handleWebResponse = async (res) => {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await res.json();
    } else {
        const errorText = await res.text();
        console.error("Dashboard API Error (Non-JSON):", errorText);
        return null;
    }
};

// ==========================================
// AUTHENTICATION
// ==========================================
export const login = async (data) => {
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await res.json();
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
        const res = await fetch(`${API_BASE}/employees`);
        const data = await handleWebResponse(res);
        // Returns users with 'employee' or 'Instructor' roles to populate the list
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(employeeData)
        });
        return await res.json();
    } catch (error) {
        console.error("Add Employee Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const updateEmployee = async (id, employeeData) => {
    try {
        const res = await fetch(`${API_BASE}/employees/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(employeeData)
        });
        return await res.json();
    } catch (error) {
        console.error("Update Employee Error:", error);
        return { success: false };
    }
};

export const deleteEmployee = async (id) => {
    try {
        const res = await fetch(`${API_BASE}/employees/${id}`, {
            method: 'DELETE',
        });
        return await res.json();
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
        const res = await fetch(`${API_BASE}/attendance-report?date=${date}`);
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
        const res = await fetch(`${API_BASE}/leave-requests/all`); 
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, admin_remarks: remarks })
        });
        return await res.json();
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
        const res = await fetch(`${API_BASE}/schedules`); 
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scheduleData)
        });
        return await res.json();
    } catch (error) {
        console.error("Add Schedule Error:", error);
        return { success: false, message: "Network error" };
    }
};

export const fetchEvents = async () => {
    try {
        const res = await fetch(`${API_BASE}/events`);
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        return await res.json();
    } catch (error) {
        console.error("Add Event Error:", error);
        return { success: false };
    }
};

// ==========================================
// PAYROLL (NEW)
// ==========================================

// Fetch monthly attendance summary for payroll table
export const fetchAttendanceMonthly = async (month, year) => {
    try {
        const res = await fetch(`${API_BASE}/attendance-monthly?month=${month}&year=${year}`);
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Attendance Monthly Error:", error);
        return [];
    }
};

// Finalize a single employee's payroll
export const finalizePayroll = async (payload) => {
    try {
        const res = await fetch(`${API_BASE}/payroll/finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (error) {
        console.error("Finalize Payroll Error:", error);
        return { success: false, message: "Network error" };
    }
};

// Run monthly payroll for all instructors
export const runMonthlyPayroll = async (month, year) => {
    try {
        const res = await fetch(`${API_BASE}/payroll/run-monthly`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, year })
        });
        return await res.json();
    } catch (error) {
        console.error("Run Monthly Payroll Error:", error);
        return { success: false, message: "Network error" };
    }
};

// Fetch payroll history records
export const fetchPayrollHistory = async () => {
    try {
        const res = await fetch(`${API_BASE}/payroll/history`);
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Payroll History Error:", error);
        return [];
    }
};

// ==========================================
// LEAVE BALANCES (Admin)
// ==========================================

// Get all leave types (e.g., Sick Leave, Vacation Leave)
export const fetchLeaveTypes = async () => {
    try {
        const res = await fetch(`${API_BASE}/leave-types`);
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Leave Types Error:", error);
        return [];
    }
};

// Get leave balances for a specific employee (by user ID)
export const fetchLeaveBalancesForEmployee = async (userId, year = new Date().getFullYear()) => {
    try {
        const res = await fetch(`${API_BASE}/leave-balances/${userId}?year=${year}`);
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Leave Balances Error:", error);
        return [];
    }
};

// Update (adjust) a leave balance for an employee
export const updateLeaveBalance = async (userId, leaveTypeId, remainingDays, year) => {
    try {
        const res = await fetch(`${API_BASE}/leave-balances/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leave_type_id: leaveTypeId, remaining_days: remainingDays, year })
        });
        return await res.json();
    } catch (error) {
        console.error("Update Leave Balance Error:", error);
        return { success: false };
    }
};

// ==========================================
// EMERGENCY ALERTS (Admin)
// ==========================================

// Send a new emergency alert (broadcast to selected roles)
export const sendEmergencyAlert = async (alertData) => {
    try {
        const res = await fetch(`${API_BASE}/emergency-alerts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(alertData)
        });
        return await res.json();
    } catch (error) {
        console.error("Send Emergency Alert Error:", error);
        return { success: false, message: "Network error" };
    }
};

// Fetch all emergency alerts (for admin history view)
export const fetchAllEmergencyAlerts = async () => {
    try {
        const res = await fetch(`${API_BASE}/emergency-alerts`);
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Emergency Alerts Error:", error);
        return [];
    }
};

// (Optional) Fetch active alerts for a specific user – may be used by admin preview
export const fetchActiveAlertsForUser = async (userId) => {
    try {
        const res = await fetch(`${API_BASE}/emergency-alerts/active?userId=${userId}`);
        return await handleWebResponse(res);
    } catch (error) {
        console.error("Fetch Active Alerts Error:", error);
        return [];
    }
};

// ==========================================
// OVERTIME REQUESTS (Web Admin)
// ==========================================

// Fetch all pending overtime requests
export const fetchPendingOvertimeRequests = async () => {
  try {
    const res = await fetch(`${API_BASE}/overtime-requests/pending`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    });
    return await handleWebResponse(res);
  } catch (error) {
    console.error("Fetch Pending Overtime Error:", error);
    return [];
  }
};

// Approve or reject an overtime request
export const updateOvertimeStatus = async (id, status) => {
  try {
    const res = await fetch(`${API_BASE}/overtime-requests/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ status })
    });
    return await res.json();
  } catch (error) {
    console.error("Update Overtime Status Error:", error);
    return { success: false };
  }
};

// ==========================================
// ATTENDANCE CORRECTIONS (Web Admin)
// ==========================================

// Fetch all pending correction requests (from attendance_corrections table)
export const fetchPendingCorrections = async () => {
  try {
    const res = await fetch(`${API_BASE}/attendance/corrections/pending`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    });
    return await handleWebResponse(res);
  } catch (error) {
    console.error("Fetch Pending Corrections Error:", error);
    return [];
  }
};

// Review a correction request (approve or reject)
export const reviewCorrection = async (id, status) => {
  try {
    const res = await fetch(`${API_BASE}/attendance/corrections/${id}/review`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ status })
    });
    return await res.json();
  } catch (error) {
    console.error("Review Correction Error:", error);
    return { success: false };
  }
};