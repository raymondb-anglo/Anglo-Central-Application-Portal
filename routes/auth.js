import { Router } from 'express';
import bcrypt from 'bcryptjs';
import passport from '../config/passport.js';
import { logAudit, getClientIP } from '../utils/auditLog.js';
import { sendOTP, generateOTP } from '../utils/email.js';
import db from '../db.js';

const router = Router();

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
router.post('/password-login', async (req, res) => {
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
 */
router.post('/otp-request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('Email is required.'));
    }

    // Find user
    const rows = await db.queryRows(
      'SELECT Id, Email, IsActive FROM Users WHERE Email = @p0',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('No account found with this email.'));
    }

    const user = rows[0];

    if (!user.IsActive) {
      return res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('Your account has been deactivated.'));
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
      return res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('Failed to send OTP. Check SMTP configuration.'));
    }

    await logAudit({ userId: user.Id, action: 'OTP_SENT', ipAddress: getClientIP(req), details: `OTP sent to: ${email}` });

    // Render OTP verification page
    res.render('otp-verify', {
      layout: 'layout',
      title: 'Verify Code',
      email: user.Email,
      error: null
    });
  } catch (err) {
    console.error('[AUTH] OTP request error:', err.message);
    res.redirect('/auth/login?tab=otp&error=' + encodeURIComponent('An error occurred.'));
  }
});

/**
 * POST /auth/otp-verify — Verify OTP code and log in
 */
router.post('/otp-verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.render('otp-verify', {
        layout: 'layout',
        title: 'Verify Code',
        email: email || '',
        error: 'Please enter the verification code.'
      });
    }

    // Find user and check OTP
    const rows = await db.queryRows(
      'SELECT Id, GoogleSubjectId, Email, DisplayName, FirstName, LastName, ProfilePicture, OTPCode, OTPExpiresAt, IsActive FROM Users WHERE Email = @p0',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Invalid request.'
      });
    }

    const user = rows[0];

    if (!user.IsActive) {
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Your account has been deactivated.'
      });
    }

    // Check OTP validity
    if (!user.OTPCode || user.OTPCode !== code.trim()) {
      await logAudit({ userId: user.Id, action: 'OTP_FAILED', ipAddress: getClientIP(req), details: `Invalid OTP for: ${email}` });
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Invalid verification code. Please try again.'
      });
    }

    // Check expiry
    if (user.OTPExpiresAt && new Date(user.OTPExpiresAt) < new Date()) {
      return res.render('otp-verify', {
        layout: 'layout', title: 'Verify Code', email, error: 'Code has expired. Please request a new one.'
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
          layout: 'layout', title: 'Verify Code', email, error: 'Login failed.'
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
      layout: 'layout', title: 'Verify Code', email: req.body.email || '', error: 'An error occurred.'
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
