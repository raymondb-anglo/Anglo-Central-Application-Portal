import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logAudit, getClientIP } from '../utils/auditLog.js';
import { generateSSOToken, appendSSOToken, isSSOConfigured } from '../utils/sso.js';
import db from '../db.js';
import { getUserApplications } from '../utils/appAccess.js';

const router = Router();

/**
 * GET / — Main portal dashboard
 * Displays only the applications the authenticated user is authorized to access.
 * 
 * Access logic:
 * 1. PortalAdmin / ITAdmin roles see ALL active applications
 * 2. Other users see applications based on:
 *    a. UserApplications table (per-user overrides) — if any exist
 *    b. ApplicationRoles table (role-based access) — fallback
 *    c. If neither has entries, show ALL active applications (open access)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.Id;
    const userRoles = req.userRoles || [];
    const isPortalAdmin = userRoles.includes('PortalAdmin');
    const isAppAdmin = userRoles.includes('ApplicationAdmin') || userRoles.includes('ITAdmin');

    const applications = await getUserApplications(req.user, userRoles);

    // Extract unique campuses for the filter tabs
    const campuses = [...new Set(
      applications
        .map(app => app.Campus)
        .filter(c => c !== null && c !== '')
    )].sort();

    // 1. Fetch user's pinned/favorite application IDs
    let favoriteAppIds = [];
    try {
      const favRows = await db.queryRows(
        'SELECT ApplicationId FROM UserFavorites WHERE UserId = @p0',
        [userId]
      );
      favoriteAppIds = favRows.map(r => r.ApplicationId);
    } catch (e) {
      console.warn('[DASHBOARD] Could not load favorites:', e.message);
    }

    // 2. Fetch user's recent launches (top 6 apps)
    let recentApps = [];
    try {
      const allowedAppIds = new Set(applications.map(a => a.Id));
      const recentRows = await db.queryRows(
        `SELECT TOP 10 l.ApplicationId, MAX(l.Timestamp) as LastLaunchedAt
         FROM AuditLogs l
         WHERE l.UserId = @p0 AND l.Action = 'APP_ACCESS' AND l.ApplicationId IS NOT NULL
         GROUP BY l.ApplicationId
         ORDER BY LastLaunchedAt DESC`,
        [userId]
      );

      const appMap = new Map(applications.map(a => [a.Id, a]));
      recentApps = recentRows
        .filter(r => allowedAppIds.has(r.ApplicationId))
        .slice(0, 6)
        .map(r => ({
          ...appMap.get(r.ApplicationId),
          lastLaunchedAt: r.LastLaunchedAt
        }));
    } catch (e) {
      console.warn('[DASHBOARD] Could not load recent launches:', e.message);
    }

    res.render('dashboard', {
      layout: 'layout',
      title: 'Application Portal',
      applications,
      favoriteAppIds,
      recentApps,
      campuses,
      user: req.user
    });
  } catch (err) {
    console.error('[DASHBOARD] Error loading applications:', err.message);
    res.render('dashboard', {
      layout: 'layout',
      title: 'Application Portal',
      applications: [],
      favoriteAppIds: [],
      recentApps: [],
      campuses: [],
      user: req.user,
      error: 'Failed to load applications. Please try again later.'
    });
  }
});

/**
 * GET /launch/:id — Log application access, generate SSO token, and redirect
 *
 * SSO Flow:
 * 1. Fetches the target application from the database
 * 2. Logs the access in the audit trail
 * 3. Generates a signed JWT token containing the user's identity
 * 4. Appends the token to the redirect URL as ?sso_token=<JWT>
 * 5. External app reads the token and authenticates the user automatically
 *
 * If SSO_JWT_SECRET is not configured, falls back to a plain redirect (no token).
 */
router.get('/launch/:id', requireAuth, async (req, res) => {
  try {
    const appId = parseInt(req.params.id, 10);
    const rows = await db.queryRows(
      'SELECT Id, ApplicationCode, Application, Campus, Link FROM ApplicationInformation WHERE Id = @p0 AND Status = @p1',
      [appId, 'Active']
    );

    if (rows.length === 0) {
      return res.redirect('/?error=' + encodeURIComponent('Application not found or inactive.'));
    }

    const app = rows[0];

    // Log the access
    await logAudit({
      userId: req.user.Id,
      action: 'APP_ACCESS',
      applicationId: appId,
      ipAddress: getClientIP(req),
      details: `Accessed: ${app.Application}${app.Campus ? ' — ' + app.Campus : ''}`
    });

    // Generate SSO token and append to redirect URL
    let redirectUrl = app.Link;

    if (isSSOConfigured()) {
      const token = generateSSOToken(req.user, app);
      if (token) {
        redirectUrl = appendSSOToken(app.Link, token);
        console.log(`[SSO] Token generated for ${req.user.Email} → ${app.Application}`);
      }
    }

    res.redirect(redirectUrl);
  } catch (err) {
    console.error('[DASHBOARD] Launch error:', err.message);
    res.redirect('/');
  }
});

export default router;
