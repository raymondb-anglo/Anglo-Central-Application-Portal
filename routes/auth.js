import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import passport from '../config/passport.js';
import { logAudit, getClientIP } from '../utils/auditLog.js';
import { sendOTP, generateOTP, sendPasswordReset } from '../utils/email.js';
import db from '../db.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// =====================================================
// Rate Limiting (in-memory store)
// Max 5 requests per email per 15 minutes
// =====================================================
const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Check if an email has exceeded the rate limit for a given action.
 * @param {string} email - The email address
 * @param {string} action - The action type (e.g., 'otp', 'forgot-password')
 * @returns {boolean} true if rate limited (blocked)
 */
function isRateLimited(email, action) {
  const key = `${action}:${email.toLowerCase()}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    rateLimitStore.set(key, { count: 1, firstRequest: now });
    return false;
  }

  // Reset window if expired
  if (now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, firstRequest: now });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Periodically clean up expired rate limit entries (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * GET /auth/login — Display login page
 */
router.get('/login', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect('/');
  }
  const isDev = process.env.NODE_ENV !== 'production';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id');

  res.render('login', {
    layout: 'layout',
    title: 'Sign In',
    error: req.query.error || null,
    success: req.query.success || null,
    tab: req.query.tab || 'google',
    googleConfigured,
    isDev
  });
});

// =====================================================
// METHOD 1: Google OAuth 2.0
// =====================================================

/**
 * GET /auth/google — Initiate Google OAuth flow
 */
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

/**
 * GET /auth/google/callback — Google OAuth callback
 */
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login?error=Authentication failed. Please try again.'
  }),
  async (req, res) => {
    try {
      await logAudit({
        userId: req.user?.Id,
        action: 'LOGIN_GOOGLE',
        ipAddress: getClientIP(req),
        details: `Google login: ${req.user?.Email}`
      });
    } catch { /* audit should not block */ }

    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// =====================================================
// METHOD 2: Username / Password
// =====================================================

/**
 * POST /auth/password-login — Login with email and password
 */
router.post('/password-login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Email and password are required.'));
    }

    // Find user
    const rows = await db.queryRows(
      'SELECT Id, GoogleSubjectId, Email, DisplayName, FirstName, LastName, ProfilePicture, PasswordHash, IsActive FROM Users WHERE Email = @p0',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      // Run bcrypt hash anyway to prevent timing attacks (OWASP recommendation)
      await bcrypt.hash('dummy-password', 12);
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Invalid email or password.'));
    }

    const user = rows[0];

    if (!user.IsActive) {
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Your account has been deactivated.'));
    }

    if (!user.PasswordHash) {
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Password login is not set up for this account. Use Google Sign-In or OTP.'));
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.PasswordHash);
    if (!isValid) {
      await logAudit({ userId: user.Id, action: 'LOGIN_FAILED', ipAddress: getClientIP(req), details: `Failed password login: ${email}` });
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Invalid email or password.'));
    }

    // Update last login
    await db.query('UPDATE Users SET LastLoginAt = GETDATE() WHERE Id = @p0', [user.Id]);

    // Log in
    req.login(user, async (err) => {
      if (err) {
        console.error('[AUTH] Password login error:', err);
        return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Login failed.'));
      }

      delete req.session.userRoles;
      await logAudit({ userId: user.Id, action: 'LOGIN_PASSWORD', ipAddress: getClientIP(req), details: `Password login: ${email}` });

      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  } catch (err) {
    console.error('[AUTH] Password login error:', err.message);
    res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('An error occurred.'));
  }
});

// =====================================================
// METHOD 3: OTP via Email
// =====================================================

/**
 * POST /auth/otp-request — Send OTP code to user's email
 * Uses OWASP-compliant generic response message.
 */
router.post('/otp-request', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('Email is required.'));
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limiting check
    if (isRateLimited(normalizedEmail, 'otp')) {
      return res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('Too many requests. Please try again later.'));
    }

    // Find user
    const rows = await db.queryRows(
      'SELECT Id, Email, IsActive FROM Users WHERE Email = @p0',
      [normalizedEmail]
    );

    // OWASP: Always show the same generic success message regardless of whether email exists.
    // This prevents account enumeration attacks.
    const genericMessage = 'If this email is registered, a verification code has been sent. Please check your inbox.';

    if (rows.length === 0) {
      // Email not found — show generic success (do NOT reveal that email doesn't exist)
      return res.render('otp-verify', {
        layout: 'layout',
        title: 'Verify Code',
        email: normalizedEmail,
        error: null,
        info: genericMessage
      });
    }

    const user = rows[0];

    if (!user.IsActive) {
      // Deactivated account — still show generic success (do NOT reveal account status)
      return res.render('otp-verify', {
        layout: 'layout',
        title: 'Verify Code',
        email: normalizedEmail,
        error: null,
        info: genericMessage
      });
    }

    // Generate OTP (6 digits, expires in 5 minutes)
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.query(
      'UPDATE Users SET OTPCode = @p0, OTPExpiresAt = @p1 WHERE Id = @p2',
      [code, expiresAt.toISOString(), user.Id]
    );

    // Send OTP email
    const sent = await sendOTP(user.Email, code);

    if (!sent) {
      return res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('Failed to send verification code. Please try again later.'));
    }

    await logAudit({ userId: user.Id, action: 'OTP_SENT', ipAddress: getClientIP(req), details: `OTP sent to: ${email}` });

    // Render OTP verification page with generic message
    res.render('otp-verify', {
      layout: 'layout',
      title: 'Verify Code',
      email: user.Email,
      error: null,
      info: genericMessage
    });
  } catch (err) {
    console.error('[AUTH] OTP request error:', err.message);
    res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('An error occurred.'));
  }
});

/**
 * POST /auth/otp-verify — Verify OTP code and log in
 */
router.post('/otp-verify', authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.render('otp-verify', {
        layout: 'layout',
        title: 'Verify Code',
        email: email || '',
        error: 'Please enter the verification code.',
        info: null
      });
    }

    // Find user and check OTP
    const rows = await db.queryRows(
      'SELECT Id, GoogleSubjectId, Email, DisplayName, FirstName, LastName, ProfilePicture, OTPCode, OTPExpiresAt, IsActive FROM Users WHERE Email = @p0',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Invalid verification code. Please try again.', info: null
      });
    }

    const user = rows[0];

    if (!user.IsActive) {
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Your account has been deactivated.', info: null
      });
    }

    // Check OTP validity
    if (!user.OTPCode || user.OTPCode !== code.trim()) {
      await logAudit({ userId: user.Id, action: 'OTP_FAILED', ipAddress: getClientIP(req), details: `Invalid OTP for: ${email}` });
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Invalid verification code. Please try again.', info: null
      });
    }

    // Check expiry
    if (user.OTPExpiresAt && new Date(user.OTPExpiresAt) < new Date()) {
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Code has expired. Please request a new one.', info: null
      });
    }

    // Clear OTP and update login time
    await db.query(
      'UPDATE Users SET OTPCode = NULL, OTPExpiresAt = NULL, LastLoginAt = GETDATE() WHERE Id = @p0',
      [user.Id]
    );

    // Log in
    req.login(user, async (err) => {
      if (err) {
        console.error('[AUTH] OTP login error:', err);
        return res.render('otp-verify', {
          layout: 'layout', title: 'Verify Code', email, error: 'Login failed.', info: null
        });
      }

      delete req.session.userRoles;
      await logAudit({ userId: user.Id, action: 'LOGIN_OTP', ipAddress: getClientIP(req), details: `OTP login: ${email}` });

      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  } catch (err) {
    console.error('[AUTH] OTP verify error:', err.message);
    res.render('otp-verify', {
      layout: 'layout', title: 'Verify Code', email: req.body.email || '', error: 'An error occurred.', info: null
    });
  }
});

// =====================================================
// FORGOT PASSWORD / RESET PASSWORD
// =====================================================

/**
 * GET /auth/forgot-password — Display forgot password form
 */
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    layout: 'layout',
    title: 'Forgot Password',
    error: req.query.error || null,
    success: req.query.success || null
  });
});

/**
 * POST /auth/forgot-password — Send password reset link
 * Uses OWASP-compliant generic response + hashed token storage.
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render('forgot-password', {
        layout: 'layout',
        title: 'Forgot Password',
        error: 'Email is required.',
        success: null
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limiting check
    if (isRateLimited(normalizedEmail, 'forgot-password')) {
      return res.render('forgot-password', {
        layout: 'layout',
        title: 'Forgot Password',
        error: 'Too many requests. Please try again later.',
        success: null
      });
    }

    // OWASP: Always show the same generic message regardless of outcome
    const genericMessage = 'If this email is registered, a password reset link has been sent. Please check your inbox.';

    // Find user
    const rows = await db.queryRows(
      'SELECT Id, Email, IsActive FROM Users WHERE Email = @p0',
      [normalizedEmail]
    );

    if (rows.length === 0 || !rows[0].IsActive) {
      // User not found or inactive — still show generic success
      return res.render('forgot-password', {
        layout: 'layout',
        title: 'Forgot Password',
        error: null,
        success: genericMessage
      });
    }

    const user = rows[0];

    // Generate a cryptographically secure reset token (64 hex chars = 32 bytes)
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Store SHA-256 hash of the token in DB (never store raw token)
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Overwrite any prior reset token (only latest is valid — OWASP)
    await db.query(
      'UPDATE Users SET ResetTokenHash = @p0, ResetTokenExpiresAt = @p1 WHERE Id = @p2',
      [tokenHash, expiresAt.toISOString(), user.Id]
    );

    // Build reset URL using BASE_URL from .env (required for production)
    // IIS/Nginx reverse proxies forward the internal IP as Host header,
    // so we cannot rely on req.get('host') for public-facing email links.
    const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}`;

    // Send reset email
    const sent = await sendPasswordReset(user.Email, resetUrl);

    if (!sent) {
      console.error('[AUTH] Failed to send password reset email to:', user.Email);
      // Still show generic success to prevent enumeration
    }

    await logAudit({ userId: user.Id, action: 'PASSWORD_RESET_REQUESTED', ipAddress: getClientIP(req), details: `Password reset requested for: ${user.Email}` });

    res.render('forgot-password', {
      layout: 'layout',
      title: 'Forgot Password',
      error: null,
      success: genericMessage
    });
  } catch (err) {
    console.error('[AUTH] Forgot password error:', err.message);
    res.render('forgot-password', {
      layout: 'layout',
      title: 'Forgot Password',
      error: 'An error occurred. Please try again.',
      success: null
    });
  }
});

/**
 * GET /auth/reset-password — Display reset password form (validates token)
 */
router.get('/reset-password', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Invalid or missing reset link.'));
    }

    // Hash the provided token and look it up
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const rows = await db.queryRows(
      'SELECT Id, ResetTokenExpiresAt FROM Users WHERE ResetTokenHash = @p0',
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Invalid or expired reset link. Please request a new one.'));
    }

    // Check expiry
    if (rows[0].ResetTokenExpiresAt && new Date(rows[0].ResetTokenExpiresAt) < new Date()) {
      // Clear expired token
      await db.query('UPDATE Users SET ResetTokenHash = NULL, ResetTokenExpiresAt = NULL WHERE Id = @p0', [rows[0].Id]);
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Reset link has expired. Please request a new one.'));
    }

    // Token valid — show reset form
    res.render('reset-password', {
      layout: 'layout',
      title: 'Reset Password',
      token,
      error: null
    });
  } catch (err) {
    console.error('[AUTH] Reset password page error:', err.message);
    res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('An error occurred.'));
  }
});

/**
 * POST /auth/reset-password — Process password reset
 */
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Invalid or missing reset token.'));
    }

    // Validate password
    if (!password || password.length < 8) {
      return res.render('reset-password', {
        layout: 'layout',
        title: 'Reset Password',
        token,
        error: 'Password must be at least 8 characters.'
      });
    }

    if (password !== confirmPassword) {
      return res.render('reset-password', {
        layout: 'layout',
        title: 'Reset Password',
        token,
        error: 'Passwords do not match.'
      });
    }

    // Hash the provided token and look it up
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const rows = await db.queryRows(
      'SELECT Id, Email, ResetTokenExpiresAt FROM Users WHERE ResetTokenHash = @p0',
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Invalid or expired reset link. Please request a new one.'));
    }

    const user = rows[0];

    // Check expiry
    if (user.ResetTokenExpiresAt && new Date(user.ResetTokenExpiresAt) < new Date()) {
      await db.query('UPDATE Users SET ResetTokenHash = NULL, ResetTokenExpiresAt = NULL WHERE Id = @p0', [user.Id]);
      return res.redirect('/auth/login?tab=password&error=' + encodeURIComponent('Reset link has expired. Please request a new one.'));
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password, clear reset token (single-use — OWASP), update last login
    await db.query(
      'UPDATE Users SET PasswordHash = @p0, ResetTokenHash = NULL, ResetTokenExpiresAt = NULL, LastLoginAt = GETDATE() WHERE Id = @p1',
      [passwordHash, user.Id]
    );

    await logAudit({ userId: user.Id, action: 'PASSWORD_RESET_COMPLETED', ipAddress: getClientIP(req), details: `Password reset completed for: ${user.Email}` });

    res.redirect('/auth/login?tab=password&success=' + encodeURIComponent('Password has been reset successfully. You can now sign in with your new password.'));
  } catch (err) {
    console.error('[AUTH] Reset password error:', err.message);
    res.render('reset-password', {
      layout: 'layout',
      title: 'Reset Password',
      token: req.body.token || '',
      error: 'An error occurred. Please try again.'
    });
  }
});

// =====================================================
// DEV LOGIN (development only)
// =====================================================

/**
 * POST /auth/dev-login — Development-only login bypass
 */
router.post('/dev-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).send('Dev login is not available in production.');
  }

  try {
    const { email } = req.body;
    if (!email) {
      return res.redirect('/auth/login?error=' + encodeURIComponent('Email is required.'));
    }

    const rows = await db.queryRows(
      'SELECT Id, GoogleSubjectId, Email, DisplayName, FirstName, LastName, ProfilePicture, IsActive FROM Users WHERE Email = @p0',
      [email.trim()]
    );

    if (rows.length === 0) {
      return res.redirect('/auth/login?error=' + encodeURIComponent('User not found.'));
    }

    const user = rows[0];
    if (!user.IsActive) {
      return res.redirect('/auth/login?error=' + encodeURIComponent('Account is deactivated.'));
    }

    await db.query('UPDATE Users SET LastLoginAt = GETDATE() WHERE Id = @p0', [user.Id]);

    req.login(user, async (err) => {
      if (err) return res.redirect('/auth/login?error=' + encodeURIComponent('Login failed.'));
      delete req.session.userRoles;
      await logAudit({ userId: user.Id, action: 'DEV_LOGIN', ipAddress: getClientIP(req), details: `Dev login: ${user.Email}` });
      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  } catch (err) {
    console.error('[AUTH] Dev login error:', err.message);
    res.redirect('/auth/login?error=' + encodeURIComponent('An error occurred.'));
  }
});

// =====================================================
// LOGOUT
// =====================================================

router.get('/logout', async (req, res) => {
  try {
    await logAudit({ userId: req.user?.Id, action: 'LOGOUT', ipAddress: getClientIP(req), details: `User logged out: ${req.user?.Email}` });
  } catch { /* audit should not block */ }

  req.logout((err) => {
    if (err) console.error('[AUTH] Logout error:', err);
    req.session.destroy(() => {
      res.redirect('/auth/login');
    });
  });
});

export default router;
