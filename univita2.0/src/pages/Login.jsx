// src/pages/Login.js
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { login, requestPasswordReset, resetPassword, API_BASE } from '../api';
import { ArrowLeft, ShieldCheck, Mail, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';
import './Login.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // New Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  // Steps: 'login' | 'otp' | 'forgot-password' | 'reset-otp' | 'reset-new-password'
  const [step, setStep] = useState('login'); 
  const [otp, setOtp] = useState('');
  const [pendingLoginToken, setPendingLoginToken] = useState('');
  const [firstLoginToken, setFirstLoginToken] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const startResendTimer = () => setResendTimer(60);

  
const handleLogin = async (e) => {
  e.preventDefault();

  const emailClean = email.trim().toLowerCase();

  if (!emailClean || !password.trim()) {
    toast.error('Please enter both email and password.');
    return;
  }

  if (!EMAIL_REGEX.test(emailClean)) {
    toast.error('Please enter a valid email address.');
    return;
  }

  setOtpLoading(true);
  setPendingLoginToken('');
  setOtp('');

  try {
    // Step 1: Verify email and password.
    const result = await login({
      email: emailClean,
      password
    });

    if (result && result.success) {
      if (result.requiresPasswordReset) {
        toast.error(
          'Your password has expired. Please use the mobile app to reset it.'
        );
        return;
      }

      // C04: Backend must provide a temporary token
      // after successful password verification.
      if (!result.tempToken) {
        toast.error(
          'Login verification could not start. Please try again.'
        );
        return;
      }

      // Step 2: Request OTP using the temporary login token.
      const otpRes = await fetch(
        `${API_BASE}/auth/send-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${result.tempToken}`
          },
          body: JSON.stringify({
            email: emailClean
          })
        }
      );

      const otpData = await otpRes.json();

      if (otpRes.ok && otpData?.success) {
        // Save temporary token for verification and resending.
        setPendingLoginToken(result.tempToken);

        setStep('otp');
        startResendTimer();

        toast.success(
          'Security verification code sent to your email.'
        );
      } else {
        const message =
          otpData?.message ||
          'Failed to send OTP verification code.';

        toast.error(message);
        setPendingLoginToken('');
      }

    } else {
      const serverMsg = result?.message || '';
      const lowerMessage = serverMsg.toLowerCase();

      if (lowerMessage.includes('does not have access')) {
        toast.error('This account does not have access.');

      } else if (
        lowerMessage.includes('password') ||
        serverMsg === 'Invalid credentials.'
      ) {
        toast.error('Incorrect password.');

      } else if (
        lowerMessage.includes('email') ||
        lowerMessage.includes('not found')
      ) {
        toast.error('Email invalid or account not found.');

      } else {
        toast.error(
          serverMsg ||
          'Incorrect email or password. Please try again.'
        );
      }
    }

  } catch (err) {
    console.error('Login verification error:', err);

    toast.error(
      'Connection error. Please check your internet connection and try again.'
    );

  } finally {
    setOtpLoading(false);
  }
};


  
const handleVerifyOtp = async (e) => {
  e.preventDefault();

  const cleanOtp = String(otp || '').trim();

  // Validate OTP format.
  if (!/^\d{6}$/.test(cleanOtp)) {
    toast.error('Please enter a valid 6-digit OTP code.');
    return;
  }

  // C04: Require a pending login session.
  if (!pendingLoginToken) {
    toast.error(
      'Your login verification session is missing. Please log in again.'
    );

    setStep('login');
    setOtp('');
    return;
  }

  setOtpLoading(true);

  try {
    const res = await fetch(
      `${API_BASE}/auth/verify-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingLoginToken}`
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: cleanOtp
        })
      }
    );

    const data = await res.json();

    if (res.ok && data?.success) {
      // Backend issues a one-purpose token after successful OTP verification.
      // Never save a normal session until the temporary password is replaced.
      if (data.requiresPasswordChange) {
        if (!data.changeToken) {
          toast.error('Password setup could not start. Please sign in again.');
          return;
        }
        setFirstLoginToken(data.changeToken);
        setPendingLoginToken('');
        setOtp('');
        setNewPassword('');
        setConfirmPassword('');
        setStep('first-login-password');
        return;
      }
      // Validate the authenticated response.
      if (!data.token || !data.user) {
        toast.error(
          'Authentication response is incomplete. Please try again.'
        );
        return;
      }

      // Instructors must use the mobile application.
      if (data.user.role === 'instructor') {
        toast.error('This account does not have access.');

        setPendingLoginToken('');
        setStep('login');
        setOtp('');
        return;
      }

      // Allow only authorized web roles.
      const allowedWebRoles = [
        'admin',
        'hr_admin',
        'security'
      ];

      if (!allowedWebRoles.includes(data.user.role)) {
        toast.error('Your account is not authorized for web access.');

        setPendingLoginToken('');
        setStep('login');
        setOtp('');
        return;
      }

      // Store the FINAL authenticated session token.
      // Do not store the temporary OTP token as auth_token.
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_id', String(data.user.id));
      localStorage.setItem('user_name', data.user.full_name || '');
      localStorage.setItem('user_role', data.user.role);
      localStorage.setItem('role', data.user.role);
      localStorage.setItem('user_email', data.user.email || '');

      localStorage.setItem(
        'employee_id',
        data.user.employee_id == null
          ? ''
          : String(data.user.employee_id)
      );

      // C04: Clear temporary verification data.
      setPendingLoginToken('');
      setOtp('');
      setPassword('');

      toast.success(
        'Authentication successful. Redirecting...'
      );

      setTimeout(() => {
        window.location.href = '/';
      }, 800);

    } else {
      const message =
        data?.message || 'Invalid OTP verification code.';

      toast.error(message);

      // Expired or invalid pending login tokens
      // require the user to repeat password verification.
      if (res.status === 401 || res.status === 403) {
        setPendingLoginToken('');
        setOtp('');
        setStep('login');

        toast.info(
          'Please log in again to start a new verification session.'
        );
      }
    }

  } catch (err) {
    console.error('OTP verification error:', err);

    toast.error(
      'Unable to verify OTP. Please check your connection and try again.'
    );

  } finally {
    setOtpLoading(false);
  }
};


  
  const handleFirstLoginPasswordChange = async (event) => {
    event.preventDefault();
    if (!firstLoginToken) {
      toast.error('Password setup expired. Please sign in again.');
      setStep('login');
      return;
    }
    if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) ||
        !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) ||
        !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      toast.warning('Use at least 12 characters with uppercase, lowercase, number and special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning('Passwords do not match.');
      return;
    }
    setOtpLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/first-login-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${firstLoginToken}`
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        toast.error(data?.message || 'Could not update your password.');
        return;
      }
      setFirstLoginToken('');
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
      setShowNewPassword(false);
      setStep('login');
      toast.success('Password created. Sign in again with your new password.');
    } catch (error) {
      toast.error('Unable to update password. Check your connection.');
    } finally {
      setOtpLoading(false);
    }
  };

const handleResendOtp = async () => {
  const emailClean = email.trim().toLowerCase();

  if (!emailClean || !EMAIL_REGEX.test(emailClean)) {
    toast.error('Valid email is required to resend code.');
    return;
  }

  // C04: Resending requires the same verified
  // temporary login session.
  if (!pendingLoginToken) {
    toast.error(
      'Your login verification session has expired. Please log in again.'
    );

    setStep('login');
    setOtp('');
    return;
  }

  setOtpLoading(true);

  try {
    const res = await fetch(
      `${API_BASE}/auth/send-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingLoginToken}`
        },
        body: JSON.stringify({
          email: emailClean
        })
      }
    );

    const data = await res.json();

    if (res.ok && data?.success) {
      // Remove old OTP input when a new code is issued.
      setOtp('');

      startResendTimer();

      toast.success(
        'A new verification code has been sent to your email.'
      );

    } else {
      toast.error(
        data?.message || 'Failed to resend OTP.'
      );

      // If temporary login token expired,
      // the user must verify their password again.
      if (res.status === 401 || res.status === 403) {
        setPendingLoginToken('');
        setOtp('');
        setStep('login');

        toast.info(
          'Please log in again to request another OTP.'
        );
      }
    }

  } catch (err) {
    console.error('Resend OTP error:', err);

    toast.error(
      'Connection error while resending code. Please try again.'
    );

  } finally {
    setOtpLoading(false);
  }
};


  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      toast.error('Please enter a valid account email address.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await requestPasswordReset(email.trim());
      if (res && res.success) {
        toast.success(res.message || 'Reset code sent to your email.');
        setStep('reset-otp'); 
        startResendTimer();
      } else {
        const serverMsg = res?.message || '';
        if (serverMsg.includes("does not have access")) {
          toast.error("This account does not have access.");
        } else {
          toast.error(serverMsg || 'No active account found with this email address.');
        }
      }
    } catch (err) {
      toast.error('Connection error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyResetOtp = async (e) => {
    e.preventDefault();
    if (!resetOtp || resetOtp.length < 6) {
      toast.error('Please enter a valid 6-digit reset code.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: resetOtp }),
      });
      const data = await res.json();

      if (data && data.success) {
        toast.success('OTP verified successfully.');
        setStep('reset-new-password'); 
      } else {
        toast.error(data?.message || 'Invalid OTP code.');
      }
    } catch (err) {
      toast.error('Invalid OTP code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    
    if (
      !newPassword || 
      newPassword.length < 8 || 
      !/[A-Z]/.test(newPassword) || 
      !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
    ) {
      toast.error('Your password must be at least 8 chars long, contain 1 uppercase, and 1 special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await resetPassword({ email: email.trim(), otp: resetOtp, newPassword });
      if (res && res.success) {
        toast.success('Password reset successfully. You can now log in.');
        setStep('login');
        setResetOtp('');
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
      } else {
        toast.error(res?.message || 'Failed to reset password.');
      }
    } catch (err) {
      toast.error('Connection error during password reset.');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="cl-login-wrapper">
      <div className="login-ambient-bg">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <button className="cl-btn-back" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="cl-login-card fade-in">
        {step === 'login' && (
          <div className="cl-header">
            
            <h1 className="cl-title">Welcome back</h1>
            <p className="cl-subtitle">Sign in to your account to continue</p>
          </div>
        )}

        {/* Step: Login */}
        {step === 'login' && (
          <form onSubmit={handleLogin} className="cl-step-form">
            <div className="cl-form-group">
              <label className="cl-label">Email Address</label>
              <div className="cl-input-wrap">
                <Mail size={18} className="cl-input-icon" />
                <input
                  type="email"
                  className="cl-input"
                  placeholder="email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="cl-form-group">
              <div className="cl-label-row">
                <label className="cl-label">Password</label>
                <button type="button" className="cl-text-btn" onClick={() => setStep('forgot-password')}>
                  Forgot Password?
                </button>
              </div>
              <div className="cl-input-wrap">
                <Lock size={18} className="cl-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  className="cl-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="cl-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="cl-btn-primary mt-2" disabled={otpLoading}>
              {otpLoading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Step: OTP */}
        {step === 'otp' && (
          <div className="cl-form">
            <div className="cl-instruction">
              <h4>Two-Factor Authentication</h4>
              <p>Enter the 6-digit security code sent to <strong>{email}</strong>.</p>
            </div>

            <form onSubmit={handleVerifyOtp} className="cl-step-form">
              <div className="cl-form-group">
                <input
                  type="text"
                  className="cl-input cl-otp-input"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                  autoFocus
                />
                {/* Resend Timer positioned left under the input */}
                <div className="cl-resend-left">
                  {resendTimer > 0 ? (
                    <span>Resend code in {resendTimer}s</span>
                  ) : (
                    <button type="button" onClick={handleResendOtp} disabled={otpLoading} className="cl-text-btn">
                      {otpLoading ? 'Sending...' : 'Resend Code'}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Buttons moved into the same row */}
              <div className="cl-btn-row">
                <button type="button" className="cl-btn-secondary" onClick={() => { setStep('login'); setOtp(''); }}>
                  Cancel
                </button>
                <button type="submit" className="cl-btn-primary" disabled={otp.length < 6 || otpLoading}>
                  {otpLoading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* First login: mandatory password replacement after verified OTP */}
        {step === 'first-login-password' && (
          <div className="cl-form">
            <div className="cl-instruction">
              <h4>Create Your Personal Password</h4>
              <p>Your temporary password must be replaced before UniVITA access is enabled. You will sign in again afterward.</p>
            </div>
            <form onSubmit={handleFirstLoginPasswordChange} className="cl-step-form">
              <div className="cl-form-group">
                <label className="cl-label" htmlFor="first-login-web-password">New Password</label>
                <div className="cl-input-wrap">
                  <Lock size={18} className="cl-input-icon" />
                  <input id="first-login-web-password" autoComplete="new-password"
                    type={showNewPassword ? 'text' : 'password'} className="cl-input"
                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    minLength={12} required placeholder="Create a personal password" />
                  <button type="button" className="cl-eye-btn"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowNewPassword(v => !v)}>
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="cl-form-group">
                <label className="cl-label" htmlFor="first-login-web-confirm">Confirm Password</label>
                <div className="cl-input-wrap">
                  <KeyRound size={18} className="cl-input-icon" />
                  <input id="first-login-web-confirm" autoComplete="new-password"
                    type={showNewPassword ? 'text' : 'password'} className="cl-input"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    minLength={12} required placeholder="Repeat new password" />
                </div>
              </div>
              <p className="cl-password-policy">Minimum 12 characters, with uppercase, lowercase, number, and special character. Do not reuse your temporary password.</p>
              <button type="submit" className="cl-btn-primary"
                disabled={otpLoading || newPassword.length < 12 || newPassword !== confirmPassword}>
                {otpLoading ? 'Updating password...' : 'Set Password'}
              </button>
              <button type="button" className="cl-btn-secondary"
                onClick={() => { setFirstLoginToken(''); setNewPassword(''); setConfirmPassword(''); setStep('login'); }}>
                Cancel and Return to Sign In
              </button>
            </form>
          </div>
        )}

        {/* Step: Forgot Password (Email Input) */}
        {step === 'forgot-password' && (
          <div className="cl-form">
            <div className="cl-instruction">
              <h4>Reset Password</h4>
              <p>Enter your registered account email to receive a secure reset code.</p>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="cl-step-form">
              <div className="cl-form-group">
                <label className="cl-label">Account Email</label>
                <div className="cl-input-wrap">
                  <Mail size={18} className="cl-input-icon" />
                  <input
                    type="email"
                    className="cl-input"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="cl-btn-primary mt-2" disabled={otpLoading}>
                {otpLoading ? 'Sending Request...' : 'Send Reset Code'}
              </button>
            </form>

            <button className="cl-btn-secondary mt-2" onClick={() => setStep('login')}>
              Return to Login
            </button>
          </div>
        )}

        {/* Step: Reset OTP Input Modal */}
        {step === 'reset-otp' && (
          <div className="cl-form">
            <div className="cl-instruction">
              <h4>Enter Reset Code</h4>
              <p>Enter the 6-digit code sent to <strong>{email}</strong>.</p>
            </div>

            <form onSubmit={handleVerifyResetOtp} className="cl-step-form">
              <div className="cl-form-group">
                <input
                  type="text"
                  className="cl-input cl-otp-input"
                  placeholder="000000"
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                  autoFocus
                />
                <div className="cl-resend-left">
                  {resendTimer > 0 ? (
                    <span>Resend in {resendTimer}s</span>
                  ) : (
                    <button type="button" onClick={handleForgotPasswordSubmit} disabled={otpLoading} className="cl-text-btn">
                      Resend Code
                    </button>
                  )}
                </div>
              </div>
              
              <div className="cl-btn-row">
                <button type="button" className="cl-btn-secondary" onClick={() => { setStep('login'); setResetOtp(''); }}>
                  Cancel
                </button>
                <button type="submit" className="cl-btn-primary" disabled={resetOtp.length < 6 || otpLoading}>
                  {otpLoading ? 'Validating...' : 'Verify'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step: Reset New Password & Confirmation Modal */}
        {step === 'reset-new-password' && (
          <div className="cl-form">
            <div className="cl-instruction">
              <h4>Create New Password</h4>
              <p>Enter and confirm your new secure password below.</p>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="cl-step-form">
              <div className="cl-form-group">
                <label className="cl-label">New Password</label>
                <div className="cl-input-wrap">
                  <Lock size={18} className="cl-input-icon" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    className="cl-input"
                    placeholder="Min. 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="cl-eye-btn"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="cl-form-group">
                <label className="cl-label">Confirm Password</label>
                <div className="cl-input-wrap">
                  <KeyRound size={18} className="cl-input-icon" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    className="cl-input"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div className="cl-btn-row mt-2">
                <button type="button" className="cl-btn-secondary" onClick={() => { setStep('login'); setResetOtp(''); setNewPassword(''); setConfirmPassword(''); }}>
                  Cancel
                </button>
                <button type="submit" className="cl-btn-primary" disabled={otpLoading || newPassword.length < 8 || confirmPassword.length < 8}>
                  {otpLoading ? 'Updating System...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;