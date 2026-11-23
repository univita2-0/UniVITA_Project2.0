import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import {
  Search,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  UserRoundPlus,
  X,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal
} from 'lucide-react';

import { API_BASE } from '../api';
import { getUserRole, decodeJwtPayload } from '../permissions';
import './AccountManagement.css';

// ============================================================
// Constants and helpers
// ============================================================

const PAGE_SIZE = 10;

const ACCOUNT_STATUS_LABELS = {
  not_provisioned: 'Not Provisioned',
  pending_role: 'Pending Role',
  active: 'Active',
  deactivated: 'Deactivated',
  archived: 'Legacy Archived',
  deleted: 'Legacy Deleted'
};

const ROLE_LABELS = {
  admin: 'System Admin',
  hr_admin: 'HR',
  security: 'Security',
  instructor: 'Instructor'
};

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'all', label: 'All account statuses' },
  { value: 'not_provisioned', label: 'Not Provisioned' },
  { value: 'pending_role', label: 'Pending Role' },
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
];

const getAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`
  }
});

const getAccountStatusLabel = (status) =>
  ACCOUNT_STATUS_LABELS[status] || 'Review Required';

const getRoleLabel = (role) => ROLE_LABELS[role] || 'Not Assigned';

const isPasswordValid = (value) =>
  value.length >= 8 &&
  /[A-Z]/.test(value) &&
  /[!@#$%^&*(),.?":{}|<>]/.test(value);

const formatDate = (value) =>
  value ? String(value).slice(0, 10) : '—';

// ============================================================
// Main component
// ============================================================

const AccountManagement = () => {
  // ----------------------------------------------------------
  // Role and authorization context
  // ----------------------------------------------------------
  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';
  const isAuthorized = ['admin', 'hr_admin'].includes(currentUserRole);
  const currentUserId = decodeJwtPayload(
    localStorage.getItem('auth_token')
  )?.id;

  // ----------------------------------------------------------
  // Directory and filter state
  // ----------------------------------------------------------
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directoryTab, setDirectoryTab] = useState('all');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [currentPage, setCurrentPage] = useState(1);

  // ----------------------------------------------------------
  // Modal and credential state
  // ----------------------------------------------------------
  const [activeModal, setActiveModal] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ----------------------------------------------------------
  // API: account directory
  // ----------------------------------------------------------
  const loadAccounts = useCallback(async () => {
    setLoading(true);

    try {
      const response = await axios.get(
        `${API_BASE}/accounts`,
        getAuthHeaders()
      );

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid account directory response');
      }

      setAccounts(response.data.filter(record => (
        !['archived', 'deleted'].includes(String(record.status || '').trim().toLowerCase()) &&
        !['archived', 'deleted'].includes(String(record.account_status || '').trim().toLowerCase())
      )));
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
        error.message ||
        'Unable to load accounts'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ----------------------------------------------------------
  // Effects
  // ----------------------------------------------------------
  useEffect(() => {
    if (isAuthorized) loadAccounts();
  }, [isAuthorized, loadAccounts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, directoryTab]);

  // ----------------------------------------------------------
  // Derived directory data
  // ----------------------------------------------------------
  const filteredAccounts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return accounts.filter((account) => {
      const isInstructor = account.role === 'instructor';
      const matchesDirectory =
        directoryTab === 'all' ||
        (directoryTab === 'instructors' && isInstructor) ||
        (directoryTab === 'staff' && !isInstructor);

      const matchesStatus =
        statusFilter === 'all' ||
        account.account_status === statusFilter;

      const searchableText = [
        account.full_name,
        account.employee_id,
        account.email,
        account.role
      ].join(' ').toLowerCase();

      return matchesDirectory && matchesStatus && searchableText.includes(query);
    });
  }, [accounts, searchTerm, statusFilter, directoryTab]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAccounts.length / PAGE_SIZE)
  );

  const safePage = Math.min(currentPage, totalPages);
  const displayedAccounts = filteredAccounts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const directoryCounts = useMemo(() => ({
    all: accounts.length,
    instructors: accounts.filter((item) => item.role === 'instructor').length,
    staff: accounts.filter((item) => item.role !== 'instructor').length
  }), [accounts]);

  const accountCounts = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((item) => item.account_status === 'active').length,
    notProvisioned: accounts.filter(
      (item) => item.account_status === 'not_provisioned'
    ).length,
    deactivated: accounts.filter(
      (item) => item.account_status === 'deactivated'
    ).length
  }), [accounts]);

  // ----------------------------------------------------------
  // Compact actions menu
  // ----------------------------------------------------------
  const toggleActionMenu = (event, accountId) => {
    if (openMenuId === accountId) {
      setOpenMenuId(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const menuWidth = 196;
    const menuHeight = 190;
    const left = Math.max(12, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 12));
    const top = bounds.bottom + menuHeight > window.innerHeight
      ? Math.max(8, bounds.top - menuHeight - 4)
      : bounds.bottom + 4;

    setMenuPosition({ top, left });
    setOpenMenuId(accountId);
  };

  useEffect(() => {
    if (openMenuId === null) return undefined;

    const handleOutsideClick = (event) => {
      if (!event.target.closest('.ac4-action-trigger') &&
          !event.target.closest('.ac4-action-menu')) {
        setOpenMenuId(null);
      }
    };
    const handleScroll = () => setOpenMenuId(null);
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [openMenuId]);

  useEffect(() => {
    setOpenMenuId(null);
  }, [directoryTab, searchTerm, statusFilter, currentPage]);

  // ----------------------------------------------------------
  // Modal handlers
  // ----------------------------------------------------------
  const openModal = (account, action) => {
    if (!isAdmin && action !== 'view') return;

    setOpenMenuId(null);
    setSelectedAccount(account);
    setActiveModal(action);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const closeModal = () => {
    if (busyId !== null) return;

    setActiveModal(null);
    setSelectedAccount(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  // ----------------------------------------------------------
  // API: provision credentials or reset password
  // ----------------------------------------------------------
  const handlePasswordSubmit = async () => {
    if (!isAdmin || !selectedAccount || busyId !== null) return;

    if (!isPasswordValid(password)) {
      toast.warning(
        'Use at least 8 characters with an uppercase letter and special character.'
      );
      return;
    }

    if (password !== confirmPassword) {
      toast.warning('Passwords do not match.');
      return;
    }

    setBusyId(selectedAccount.id);

    try {
      if (activeModal === 'provision') {
        await axios.post(
          `${API_BASE}/accounts/${selectedAccount.id}/provision`,
          { password },
          getAuthHeaders()
        );

        toast.success(
          'Credentials provisioned. Assign a role from Role Management to activate login.'
        );
      } else if (activeModal === 'reset') {
        await axios.put(
          `${API_BASE}/users/${selectedAccount.id}/reset-password`,
          { newPassword: password },
          getAuthHeaders()
        );

        toast.success('Account password reset successfully.');
      } else {
        return;
      }

      setActiveModal(null);
      setSelectedAccount(null);
      setPassword('');
      setConfirmPassword('');
      await loadAccounts();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Account operation failed.'
      );
    } finally {
      setBusyId(null);
    }
  };

  // ----------------------------------------------------------
  // API: activate or deactivate account
  // ----------------------------------------------------------
  const handleAccountStatusChange = async (account, status) => {
    if (!isAdmin || busyId !== null) return;

    if (String(account.id) === String(currentUserId)) {
      toast.error('You cannot change your own account status.');
      return;
    }

    const actionLabel = status === 'active' ? 'Activate' : 'Deactivate';
    const confirmed = window.confirm(
      `${actionLabel} account for ${account.full_name}? ` +
      'Employee information and history will be preserved.'
    );

    if (!confirmed) return;

    setOpenMenuId(null);
    setBusyId(account.id);

    try {
      await axios.put(
        `${API_BASE}/accounts/${account.id}/status`,
        { status },
        getAuthHeaders()
      );

      toast.success(
        `Account ${status === 'active' ? 'activated' : 'deactivated'}.`
      );
      await loadAccounts();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Unable to update account status.'
      );
    } finally {
      setBusyId(null);
    }
  };

  // ----------------------------------------------------------
  // Render: route authorization
  // ----------------------------------------------------------
  if (!isAuthorized) return null;

  return (
    <main className="ac4-page">
      {/* Page heading */}
      <header className="ac4-header">
        <div>
         
        </div>

        
      </header>

      {!isAdmin && (
        <div className="ac4-notice">View-only access</div>
      )}

      {/* Summary statistics */}
      <section className="ac4-stats" aria-label="Account access summary">
        <div>
          <strong>{accountCounts.total}</strong>
          <span>Total employee records</span>
        </div>
        <div>
          <strong>{accountCounts.active}</strong>
          <span>Active accounts</span>
        </div>
        <div>
          <strong>{accountCounts.notProvisioned}</strong>
          <span>Not provisioned</span>
        </div>
        <div>
          <strong>{accountCounts.deactivated}</strong>
          <span>Deactivated</span>
        </div>
      </section>

      {/* Account directory */}
      <section className="ac4-panel" aria-label="Account directory">
        {/* Account category tabs */}
        <div className="ac4-directory-heading">
          <h2>Account directory</h2>
          <span>{filteredAccounts.length} records</span>
        </div>

        <div className="ac4-directory-tabs" role="tablist" aria-label="Account category">
          {[
            { key: 'all', label: 'All accounts' },
            { key: 'instructors', label: 'Instructors' },
            { key: 'staff', label: 'Staff' }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={directoryTab === tab.key}
              className={`ac4-directory-tab ${directoryTab === tab.key ? 'active' : ''}`}
              onClick={() => setDirectoryTab(tab.key)}
            >
              {tab.label}
              <span className="ac4-tab-count">{directoryCounts[tab.key]}</span>
            </button>
          ))}
        </div>

        <div className="ac4-toolbar">
          <label className="ac4-search">
            <Search size={17} />
            <input
              aria-label="Search account access"
              placeholder="Search by name, employee ID, email, or role"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <select
            aria-label="Account status filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {ACCOUNT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ac4-table-wrap">
          <table className="ac4-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee</th>
                <th>System Role</th>
                <th>Account Status</th>
                <th className="ac4-actions-heading">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="ac4-empty">Loading accounts…</td>
                </tr>
              ) : displayedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ac4-empty">No matching accounts.</td>
                </tr>
              ) : (
                displayedAccounts.map((account) => {
                  const accountStatus = account.account_status;
                  const activeEmployment = account.employment_status === 'active';
                  const isSelf = String(account.id) === String(currentUserId);
                  const isBusy = busyId !== null;

                  return (
                    <tr key={account.id}>
                      <td className="ac4-code">{account.employee_id || '—'}</td>
                      <td className="ac4-employee-cell">
                        <strong>{account.full_name || '—'}</strong>
                        <small>{account.email || '—'}</small>
                      </td>
                      <td>{getRoleLabel(account.role)}</td>
                      <td>
                        <span
                          className={`ac4-pill ${
                            accountStatus === 'active'
                              ? 'active'
                              : accountStatus === 'pending_role'
                                ? 'pending'
                                : 'muted'
                          }`}
                        >
                          {getAccountStatusLabel(accountStatus)}
                        </span>
                      </td>
                      <td className="ac4-action-cell">
                        <button
                          type="button"
                          className="ac4-action-trigger"
                          aria-label={`Actions for ${account.full_name || account.employee_id}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === account.id}
                          onClick={(event) => toggleActionMenu(event, account.id)}
                        >
                          <MoreHorizontal size={18} />
                        </button>

                        {openMenuId === account.id && createPortal(
                          <div
                            className="ac4-action-menu"
                            role="menu"
                            style={{ top: menuPosition.top, left: menuPosition.left }}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openModal(account, 'view')}
                            >
                              <Eye size={15} /> View details
                            </button>

                            {isAdmin && activeEmployment &&
                              accountStatus === 'not_provisioned' && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={isBusy}
                                  onClick={() => openModal(account, 'provision')}
                                >
                                  <UserRoundPlus size={15} /> Provision account
                                </button>
                              )}

                            {isAdmin && activeEmployment && !isSelf &&
                              ['active', 'deactivated'].includes(accountStatus) && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={isBusy}
                                  onClick={() => openModal(account, 'reset')}
                                >
                                  <KeyRound size={15} /> Reset password
                                </button>
                              )}

                            {isAdmin && !isSelf && accountStatus === 'active' && (
                              <button
                                type="button"
                                role="menuitem"
                                className="ac4-action-danger"
                                disabled={isBusy}
                                onClick={() => handleAccountStatusChange(account, 'deactivated')}
                              >
                                <ShieldOff size={15} /> Deactivate account
                              </button>
                            )}

                            {isAdmin && activeEmployment && !isSelf &&
                              accountStatus === 'deactivated' && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={isBusy}
                                  onClick={() => handleAccountStatusChange(account, 'active')}
                                >
                                  <ShieldCheck size={15} /> Activate account
                                </button>
                              )}
                          </div>,
                          document.body
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <footer className="ac4-pagination">
          <span>{filteredAccounts.length} matching records</span>

          <div>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((page) => page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span>{safePage} / {totalPages}</span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((page) => page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>

      {/* Account details / provision / password reset modal */}
      {activeModal && selectedAccount && (
        <div
          className="ac4-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="ac4-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Account details"
          >
            <header>
              <div>
                <h2>
                  {activeModal === 'provision'
                    ? 'Provision Account'
                    : activeModal === 'reset'
                      ? 'Reset Account Password'
                      : 'Account Details'}
                </h2>
                <p>
                  {selectedAccount.full_name} · {selectedAccount.employee_id}
                </p>
              </div>

              <button
                type="button"
                aria-label="Close"
                onClick={closeModal}
              >
                <X size={19} />
              </button>
            </header>

            <div className="ac4-dialog-body">
              {[
                ['Login email', selectedAccount.email || '—'],
                ['Employment status', selectedAccount.employment_status || 'Review Required'],
                ['Account status', getAccountStatusLabel(selectedAccount.account_status)],
                ['Current role', getRoleLabel(selectedAccount.role)],
                [
                  'Account expiration',
                  selectedAccount.account_expiration_date
                    ? formatDate(selectedAccount.account_expiration_date)
                    : 'Not set'
                ]
              ].map(([label, value]) => (
                <div key={label} className="ac4-detail">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}

              {activeModal !== 'view' && (
                <>
                  <p className="ac4-hint">
                    {activeModal === 'provision'
                      ? 'Enter credentials for this employee. Role assignment in Role Management is required to enable login.'
                      : 'Set a replacement password. The employee record and assigned role will be preserved.'}
                  </p>

                  <label className="ac4-field">
                    <span>New password</span>
                    <div className="ac4-password">
                      <input
                        autoComplete="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </label>

                  <label className="ac4-field">
                    <span>Confirm password</span>
                    <input
                      autoComplete="new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </label>
                  <small>
                    Minimum 8 characters, one uppercase letter, and one special character.
                  </small>
                </>
              )}
            </div>

            <footer>
              <button
                type="button"
                className="ac4-button"
                onClick={closeModal}
              >
                Close
              </button>

              {activeModal !== 'view' && (
                <button
                  type="button"
                  className="ac4-primary"
                  disabled={
                    busyId !== null ||
                    !isPasswordValid(password) ||
                    password !== confirmPassword
                  }
                  onClick={handlePasswordSubmit}
                >
                  {busyId !== null
                    ? 'Saving…'
                    : activeModal === 'provision'
                      ? 'Provision Account'
                      : 'Reset Password'}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
};

export default AccountManagement;
