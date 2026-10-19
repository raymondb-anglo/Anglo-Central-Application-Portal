import db from '../db.js';

/**
 * Retrieve active applications accessible by a given user based on their roles and overrides.
 * Shared between dashboard view and Quick Switcher API.
 * 
 * @param {Object} user - The authenticated user object (must have .Id)
 * @param {Array<string>} userRoles - List of user role names
 * @returns {Promise<Array>} List of accessible application records
 */
export async function getUserApplications(user, userRoles = []) {
  const userId = user ? user.Id : null;
  const isPortalAdmin = userRoles.includes('PortalAdmin');
  const isAppAdmin = userRoles.includes('ApplicationAdmin') || userRoles.includes('ITAdmin');

  if (isPortalAdmin) {
    // Portal Admins see ALL links (both Student and Admin versions)
    return await db.queryRows(
      `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
              DatabaseType, Technology, Name, Icon, DisplayOrder, Status
       FROM ApplicationInformation
       WHERE Status = 'Active'
       ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
    );
  }

  if (isAppAdmin) {
    // Student Affairs / App Admins see ONLY Admin links
    return await db.queryRows(
      `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
              DatabaseType, Technology, Name, Icon, DisplayOrder, Status
       FROM ApplicationInformation
       WHERE Status = 'Active' AND Name = 'Admin'
       ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
    );
  }

  if (!userId) {
    // Unauthenticated fallback
    return await db.queryRows(
      `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
              DatabaseType, Technology, Name, Icon, DisplayOrder, Status
       FROM ApplicationInformation
       WHERE Status = 'Active' AND (Name IS NULL OR Name != 'Admin')
       ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
    );
  }

  // Check for per-user application access first
  const userAppCount = await db.queryRows(
    'SELECT COUNT(*) AS Cnt FROM UserApplications WHERE UserId = @p0', [userId]
  );

  if (userAppCount[0] && userAppCount[0].Cnt > 0) {
    // User has specific application assignments
    return await db.queryRows(
      `SELECT ai.Id, ai.ApplicationCode, ai.Application, ai.Campus, ai.Link, ai.Description,
              ai.DatabaseType, ai.Technology, ai.Name, ai.Icon, ai.DisplayOrder, ai.Status
       FROM ApplicationInformation ai
       INNER JOIN UserApplications ua ON ua.ApplicationId = ai.Id
       WHERE ua.UserId = @p0 AND ua.CanAccess = 1 AND ai.Status = 'Active'
       ORDER BY ai.DisplayOrder ASC, ai.Application ASC, ai.Campus ASC`,
      [userId]
    );
  }

  // Check role-based access
  const roleAppCount = await db.queryRows(
    `SELECT COUNT(*) AS Cnt FROM ApplicationRoles ar
     INNER JOIN UserRoles ur ON ur.RoleId = ar.RoleId
     WHERE ur.UserId = @p0`, [userId]
  );

  if (roleAppCount[0] && roleAppCount[0].Cnt > 0) {
    // User has role-based application access
    return await db.queryRows(
      `SELECT DISTINCT ai.Id, ai.ApplicationCode, ai.Application, ai.Campus, ai.Link, ai.Description,
              ai.DatabaseType, ai.Technology, ai.Name, ai.Icon, ai.DisplayOrder, ai.Status
       FROM ApplicationInformation ai
       INNER JOIN ApplicationRoles ar ON ar.ApplicationId = ai.Id
       INNER JOIN UserRoles ur ON ur.RoleId = ar.RoleId
       WHERE ur.UserId = @p0 AND ar.CanAccess = 1 AND ai.Status = 'Active'
       ORDER BY ai.DisplayOrder ASC, ai.Application ASC, ai.Campus ASC`,
      [userId]
    );
  }

  // No specific permissions configured — show active apps, but hide Admin links for safety
  return await db.queryRows(
    `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
            DatabaseType, Technology, Name, Icon, DisplayOrder, Status
     FROM ApplicationInformation
     WHERE Status = 'Active' AND (Name IS NULL OR Name != 'Admin')
     ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
  );
}
