/**
 * Authentication & Authorization Middleware
 */

/**
 * Require the user to be authenticated.
 * Redirects to login page if not authenticated.
 */
export function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  // Store the intended URL for post-login redirect
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
}

/**
 * Require the user to have a specific role.
 * Must be used AFTER requireAuth.
 * @param  {...string} roles - One or more role names (user must have at least one)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    // User roles are loaded in the session by the roles middleware
    const userRoles = req.userRoles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).render('error', {
        layout: 'layout',
        title: 'Access Denied',
        message: 'You do not have permission to access this page.',
        user: req.user
      });
    }

    next();
  };
}

/**
 * Load user roles from the database and attach to the request.
 * Should run after passport deserialization.
 */
export async function loadUserRoles(req, res, next) {
  if (!req.user) {
    req.userRoles = [];
    res.locals.userRoles = [];
    return next();
  }

  try {
    // Load fresh roles from database
    const db = (await import('../db.js')).default;
    const rows = await db.queryRows(
      `SELECT r.Name FROM Roles r
       INNER JOIN UserRoles ur ON ur.RoleId = r.Id
       WHERE ur.UserId = @p0`,
      [req.user.Id]
    );

    const roles = rows.map(r => r.Name);
    req.userRoles = roles;
    req.session.userRoles = roles;
    res.locals.userRoles = roles;
    next();
  } catch (err) {
    console.error('[AUTH] Failed to load user roles:', err.message);
    req.userRoles = [];
    res.locals.userRoles = [];
    next();
  }
}

/**
 * Make user data available to all views.
 */
export function attachUserToLocals(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = !!(req.isAuthenticated && req.isAuthenticated());
  next();
}
