/**
 * SSO Token Utility — JWT-based Single Sign-On
 *
 * Generates and verifies signed JWT tokens that allow external
 * applications to trust the Portal's authentication without
 * requiring the user to log in again.
 *
 * Flow:
 *   1. User logs in to Portal (Google OAuth / Password / OTP)
 *   2. User clicks an app card → Portal generates a signed JWT
 *   3. Portal redirects to: https://app.example.com/?sso_token=<JWT>
 *   4. External app reads the token and either:
 *      a. Validates locally using the shared SSO_JWT_SECRET, or
 *      b. Calls POST /api/sso/verify to have the Portal validate it
 *   5. External app creates its own session for the user
 */

import jwt from 'jsonwebtoken';

const SSO_JWT_SECRET = process.env.SSO_JWT_SECRET;
const SSO_TOKEN_TTL = 300; // 5 minutes (seconds)
const SSO_ISSUER = 'anglo-central-portal';

/**
 * Check if SSO is properly configured.
 * @returns {boolean}
 */
export function isSSOConfigured() {
  return !!SSO_JWT_SECRET && SSO_JWT_SECRET !== 'your_sso_jwt_secret_here';
}

/**
 * Generate a signed SSO JWT token for a user launching an application.
 *
 * @param {Object} user - The authenticated user object
 * @param {string} user.Email - User's email address
 * @param {string} user.DisplayName - User's display name
 * @param {string} user.FirstName - User's first name
 * @param {string} user.LastName - User's last name
 * @param {string} [user.ProfilePicture] - User's profile picture URL
 * @param {Object} app - The target application object
 * @param {string} app.ApplicationCode - Application code (used as audience)
 * @param {string} app.Application - Application name
 * @returns {string|null} Signed JWT string, or null if SSO is not configured
 */
export function generateSSOToken(user, app) {
  if (!isSSOConfigured()) {
    console.warn('[SSO] SSO_JWT_SECRET not configured — skipping token generation.');
    return null;
  }

  const payload = {
    sub: user.Email,
    email: user.Email,
    name: user.DisplayName || `${user.FirstName || ''} ${user.LastName || ''}`.trim(),
    given_name: user.FirstName || '',
    family_name: user.LastName || '',
    picture: user.ProfilePicture || '',
    app_code: app.ApplicationCode,
    app_name: app.Application
  };

  return jwt.sign(payload, SSO_JWT_SECRET, {
    issuer: SSO_ISSUER,
    audience: app.ApplicationCode,
    expiresIn: SSO_TOKEN_TTL
  });
}

/**
 * Verify an SSO JWT token.
 *
 * @param {string} token - The JWT token string to verify
 * @param {string} [expectedAudience] - Optional audience to validate against
 * @returns {{ valid: boolean, payload?: Object, error?: string }}
 */
export function verifySSOToken(token, expectedAudience) {
  if (!isSSOConfigured()) {
    return { valid: false, error: 'SSO is not configured on this Portal.' };
  }

  try {
    const options = {
      issuer: SSO_ISSUER,
      algorithms: ['HS256']
    };

    // If audience specified, enforce it
    if (expectedAudience) {
      options.audience = expectedAudience;
    }

    const payload = jwt.verify(token, SSO_JWT_SECRET, options);

    return {
      valid: true,
      payload: {
        email: payload.email || payload.sub,
        name: payload.name,
        given_name: payload.given_name,
        family_name: payload.family_name,
        picture: payload.picture,
        app_code: payload.app_code,
        app_name: payload.app_name,
        issued_at: new Date(payload.iat * 1000).toISOString(),
        expires_at: new Date(payload.exp * 1000).toISOString()
      }
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token has expired. Please re-launch the application from the Portal.' };
    }
    if (err.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token signature.' };
    }
    return { valid: false, error: err.message };
  }
}

/**
 * Append SSO token to a URL as a query parameter.
 *
 * @param {string} baseUrl - The target application URL
 * @param {string} token - The JWT token
 * @returns {string} URL with sso_token parameter appended
 */
export function appendSSOToken(baseUrl, token) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('sso_token', token);
    return url.toString();
  } catch {
    // Fallback for malformed URLs
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}sso_token=${encodeURIComponent(token)}`;
  }
}
