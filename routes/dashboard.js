import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logAudit, getClientIP } from '../utils/auditLog.js';
import { generateSSOToken, appendSSOToken, isSSOConfigured } from '../utils/sso.js';
import db from '../db.js';

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

    let applications;

    if (isPortalAdmin) {
      // Portal Admins see ALL links (both Student and Admin versions)
      applications = await db.queryRows(
        `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
                DatabaseType, Technology, Name, Icon, DisplayOrder, Status
         FROM ApplicationInformation
         WHERE Status = 'Active'
         ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
      );
    } else if (isAppAdmin) {
      // Student Affairs / App Admins see ONLY Admin links
      applications = await db.queryRows(
        `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
                DatabaseType, Technology, Name, Icon, DisplayOrder, Status
         FROM ApplicationInformation
         WHERE Status = 'Active' AND Name = 'Admin'
         ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
      );
    } else {
      // Check for per-user application access first
      const userAppCount = await db.queryRows(
        'SELECT COUNT(*) AS Cnt FROM UserApplications WHERE UserId = @p0', [userId]
      );

      if (userAppCount[0].Cnt > 0) {
        // User has specific application assignments
        applications = await db.queryRows(
          `SELECT ai.Id, ai.ApplicationCode, ai.Application, ai.Campus, ai.Link, ai.Description,
                  ai.DatabaseType, ai.Technology, ai.Name, ai.Icon, ai.DisplayOrder, ai.Status
           FROM ApplicationInformation ai
           INNER JOIN UserApplications ua ON ua.ApplicationId = ai.Id
           WHERE ua.UserId = @p0 AND ua.CanAccess = 1 AND ai.Status = 'Active'
           ORDER BY ai.DisplayOrder ASC, ai.Application ASC, ai.Campus ASC`,
          [userId]
        );
      } else {
        // Check role-based access
        const roleAppCount = await db.queryRows(
          `SELECT COUNT(*) AS Cnt FROM ApplicationRoles ar
           INNER JOIN UserRoles ur ON ur.RoleId = ar.RoleId
           WHERE ur.UserId = @p0`, [userId]
        );

        if (roleAppCount[0].Cnt > 0) {
          // User has role-based application access
          applications = await db.queryRows(
            `SELECT DISTINCT ai.Id, ai.ApplicationCode, ai.Application, ai.Campus, ai.Link, ai.Description,
                    ai.DatabaseType, ai.Technology, ai.Name, ai.Icon, ai.DisplayOrder, ai.Status
             FROM ApplicationInformation ai
             INNER JOIN ApplicationRoles ar ON ar.ApplicationId = ai.Id
             INNER JOIN UserRoles ur ON ur.RoleId = ar.RoleId
             WHERE ur.UserId = @p0 AND ar.CanAccess = 1 AND ai.Status = 'Active'
             ORDER BY ai.DisplayOrder ASC, ai.Application ASC, ai.Campus ASC`,
            [userId]
          );
        } else {
          // No specific permissions configured — show active apps, but hide Admin links for safety
          applications = await db.queryRows(
            `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
                    DatabaseType, Technology, Name, Icon, DisplayOrder, Status
             FROM ApplicationInformation
             WHERE Status = 'Active' AND (Name IS NULL OR Name != 'Admin')
             ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
          );
        }
      }
    }

    // Extract unique campuses for the filter tabs
    const campuses = [...new Set(
      applications
        .map(app => app.Campus)
        .filter(c => c !== null && c !== '')
    )].sort();

    res.render('dashboard', {
      layout: 'layout',
      title: 'Application Portal',
      applications,
      campuses,
      user: req.user
    });
  } catch (err) {
    console.error('[DASHBOARD] Error loading applications:', err.message);
    res.render('dashboard', {
      layout: 'layout',
      title: 'Application Portal',
      applications: [],
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
