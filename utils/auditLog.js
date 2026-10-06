import db from '../db.js';

/**
 * Log an audit event to the database.
 * Fails silently — audit logging should never crash the application.
 *
 * @param {object} options
 * @param {number|null} options.userId - User ID (null for anonymous actions)
 * @param {string} options.action - Action name (e.g., 'LOGIN', 'ACCESS_APP', 'ADMIN_ADD_APP')
 * @param {number|null} options.applicationId - Related application ID (optional)
 * @param {string|null} options.ipAddress - Client IP address
 * @param {string|null} options.details - Additional details
 */
export async function logAudit({ userId = null, action, applicationId = null, ipAddress = null, details = null }) {
  try {
    await db.query(
      `INSERT INTO AuditLogs (UserId, Action, ApplicationId, Timestamp, IPAddress, Details)
       VALUES (@p0, @p1, @p2, GETDATE(), @p3, @p4)`,
      [userId, action, applicationId, ipAddress, details]
    );
  } catch (err) {
    console.error('[AUDIT] Failed to log audit event:', err.message);
  }
}

/**
 * Extract client IP address from request.
 * Handles X-Forwarded-For from reverse proxies / IIS.
 */
export function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

/**
 * Express middleware that logs every authenticated request.
 * Attach after authentication middleware.
 */
export function auditMiddleware(req, res, next) {
  // Only log specific actions, not every request
  // This middleware is available for route-level use
  next();
}
