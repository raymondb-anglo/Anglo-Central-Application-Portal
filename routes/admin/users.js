import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logAudit, getClientIP } from '../../utils/auditLog.js';
import db from '../../db.js';

const router = Router();

/**
 * GET /admin/users — List portal users
 */
router.get('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const users = await db.queryRows(
      `SELECT u.Id, u.Email, u.DisplayName, u.FirstName, u.LastName, u.IsActive, u.CreatedAt, u.LastLoginAt,
              STUFF((SELECT ', ' + r.Name FROM Roles r 
                     INNER JOIN UserRoles ur ON ur.RoleId = r.Id 
                     WHERE ur.UserId = u.Id 
                     FOR XML PATH('')), 1, 2, '') AS RoleNames
       FROM Users u
       ORDER BY u.DisplayName ASC`
    );

    res.render('admin/users', {
      layout: 'layout',
      title: 'User Management',
      users,
      user: req.user,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('[ADMIN] Error loading users:', err.message);
    res.render('admin/users', {
      layout: 'layout',
      title: 'User Management',
      users: [],
      user: req.user,
      error: 'Failed to load users: ' + err.message
    });
  }
});

/**
 * GET /admin/users/new — Show add user form
 */
router.get('/new', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const roles = await db.queryRows('SELECT Id, Name, Description FROM Roles ORDER BY Name');
    const applications = await db.queryRows(
      `SELECT Id, ApplicationCode, Application, Campus FROM ApplicationInformation ORDER BY DisplayOrder`
    );

    res.render('admin/user-form', {
      layout: 'layout',
      title: 'Add User',
      editUser: null,
      roles,
      applications,
      userRoleIds: [],
      userAppIds: [],
      isEdit: false,
      user: req.user,
      error: null
    });
  } catch (err) {
    console.error('[ADMIN] Error:', err.message);
    res.redirect('/admin/users?error=' + encodeURIComponent('Failed to load form.'));
  }
});

/**
 * GET /admin/users/:id/edit — Show edit user form
 */
router.get('/:id/edit', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const users = await db.queryRows('SELECT * FROM Users WHERE Id = @p0', [id]);
    if (users.length === 0) return res.redirect('/admin/users?error=' + encodeURIComponent('User not found.'));

    const roles = await db.queryRows('SELECT Id, Name, Description FROM Roles ORDER BY Name');
    const applications = await db.queryRows(
      `SELECT Id, ApplicationCode, Application, Campus FROM ApplicationInformation ORDER BY DisplayOrder`
    );
    const userRoles = await db.queryRows('SELECT RoleId FROM UserRoles WHERE UserId = @p0', [id]);
    const userApps = await db.queryRows('SELECT ApplicationId FROM UserApplications WHERE UserId = @p0 AND CanAccess = 1', [id]);

    res.render('admin/user-form', {
      layout: 'layout',
      title: 'Edit User',
      editUser: users[0],
      roles,
      applications,
      userRoleIds: userRoles.map(r => r.RoleId),
      userAppIds: userApps.map(a => a.ApplicationId),
      isEdit: true,
      user: req.user,
      error: null
    });
  } catch (err) {
    console.error('[ADMIN] Error:', err.message);
    res.redirect('/admin/users?error=' + encodeURIComponent('Failed to load user.'));
  }
});

/**
 * POST /admin/users — Create new user
 */
router.post('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const { email, displayName, firstName, lastName, isActive } = req.body;
    let roleIds = req.body.roles || [];
    let appIds = req.body.applications || [];
    if (!Array.isArray(roleIds)) roleIds = [roleIds];
    if (!Array.isArray(appIds)) appIds = [appIds];

    if (!email) {
      return res.redirect('/admin/users/new?error=' + encodeURIComponent('Email is required.'));
    }

    // Hash password if provided
    const { password, confirmPassword } = req.body;
    let passwordHash = null;
    if (password && password.length > 0) {
      if (password.length < 8) {
        return res.redirect('/admin/users/new?error=' + encodeURIComponent('Password must be at least 8 characters.'));
      }
      if (password !== confirmPassword) {
        return res.redirect('/admin/users/new?error=' + encodeURIComponent('Passwords do not match.'));
      }
      passwordHash = await bcrypt.hash(password, 12);
    }

    // Create user with a placeholder GoogleSubjectId (will be updated on first Google login)
    const result = await db.query(
      `INSERT INTO Users (GoogleSubjectId, Email, DisplayName, FirstName, LastName, PasswordHash, IsActive, CreatedAt)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, GETDATE());
       SELECT SCOPE_IDENTITY() AS Id;`,
      ['pending-' + Date.now(), email.trim(), displayName?.trim() || '', firstName?.trim() || '', lastName?.trim() || '', passwordHash, isActive === 'on' ? 1 : 0]
    );

    const newId = result.recordset[0].Id;

    // Assign roles
    for (const rid of roleIds) {
      await db.query('INSERT INTO UserRoles (UserId, RoleId) VALUES (@p0, @p1)', [newId, parseInt(rid, 10)]);
    }

    // Assign application access
    for (const aid of appIds) {
      await db.query('INSERT INTO UserApplications (UserId, ApplicationId, CanAccess) VALUES (@p0, @p1, 1)', [newId, parseInt(aid, 10)]);
    }

    await logAudit({ userId: req.user?.Id, action: 'USER_CREATED', ipAddress: getClientIP(req), details: `Created user: ${email}` });

    res.redirect('/admin/users?success=' + encodeURIComponent('User created successfully.'));
  } catch (err) {
    console.error('[ADMIN] Error creating user:', err.message);
    res.redirect('/admin/users/new?error=' + encodeURIComponent('Failed to create user: ' + err.message));
  }
});

/**
 * POST /admin/users/:id — Update user
 */
router.post('/:id', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { displayName, firstName, lastName, isActive } = req.body;
    let roleIds = req.body.roles || [];
    let appIds = req.body.applications || [];
    if (!Array.isArray(roleIds)) roleIds = [roleIds];
    if (!Array.isArray(appIds)) appIds = [appIds];

    // Hash password if provided
    const { password, confirmPassword } = req.body;
    if (password && password.length > 0) {
      if (password.length < 8) {
        return res.redirect('/admin/users/' + id + '/edit?error=' + encodeURIComponent('Password must be at least 8 characters.'));
      }
      if (password !== confirmPassword) {
        return res.redirect('/admin/users/' + id + '/edit?error=' + encodeURIComponent('Passwords do not match.'));
      }
      const hash = await bcrypt.hash(password, 12);
      await db.query(
        `UPDATE Users SET DisplayName = @p0, FirstName = @p1, LastName = @p2, IsActive = @p3, PasswordHash = @p4 WHERE Id = @p5`,
        [displayName?.trim() || '', firstName?.trim() || '', lastName?.trim() || '', isActive === 'on' ? 1 : 0, hash, id]
      );
    } else {
      await db.query(
        `UPDATE Users SET DisplayName = @p0, FirstName = @p1, LastName = @p2, IsActive = @p3 WHERE Id = @p4`,
        [displayName?.trim() || '', firstName?.trim() || '', lastName?.trim() || '', isActive === 'on' ? 1 : 0, id]
      );
    }

    // Replace roles
    await db.query('DELETE FROM UserRoles WHERE UserId = @p0', [id]);
    for (const rid of roleIds) {
      await db.query('INSERT INTO UserRoles (UserId, RoleId) VALUES (@p0, @p1)', [id, parseInt(rid, 10)]);
    }

    // Replace application access
    await db.query('DELETE FROM UserApplications WHERE UserId = @p0', [id]);
    for (const aid of appIds) {
      await db.query('INSERT INTO UserApplications (UserId, ApplicationId, CanAccess) VALUES (@p0, @p1, 1)', [id, parseInt(aid, 10)]);
    }

    // Clear cached session roles for this user
    await logAudit({ userId: req.user?.Id, action: 'USER_UPDATED', ipAddress: getClientIP(req), details: `Updated user ID ${id}` });

    res.redirect('/admin/users?success=' + encodeURIComponent('User updated successfully.'));
  } catch (err) {
    console.error('[ADMIN] Error updating user:', err.message);
    res.redirect('/admin/users/' + id + '/edit?error=' + encodeURIComponent('Failed to update user.'));
  }
});

/**
 * POST /admin/users/:id/toggle — Toggle active/inactive
 */
router.post('/:id/toggle', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const rows = await db.queryRows('SELECT Id, Email, IsActive FROM Users WHERE Id = @p0', [id]);
    if (rows.length === 0) return res.redirect('/admin/users?error=' + encodeURIComponent('User not found.'));

    const newStatus = rows[0].IsActive ? 0 : 1;
    await db.query('UPDATE Users SET IsActive = @p0 WHERE Id = @p1', [newStatus, id]);

    await logAudit({ userId: req.user?.Id, action: newStatus ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', ipAddress: getClientIP(req), details: `${newStatus ? 'Activated' : 'Deactivated'} user: ${rows[0].Email}` });

    res.redirect('/admin/users?success=' + encodeURIComponent(`User ${newStatus ? 'activated' : 'deactivated'}.`));
  } catch (err) {
    console.error('[ADMIN] Error toggling user:', err.message);
    res.redirect('/admin/users?error=' + encodeURIComponent('Failed to update user.'));
  }
});

export default router;
