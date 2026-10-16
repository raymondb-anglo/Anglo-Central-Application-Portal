import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logAudit, getClientIP } from '../../utils/auditLog.js';
import db from '../../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Helper to parse CSV lines with quote support
 */
function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = (values[idx] || '').trim();
    });
    records.push(record);
  }
  return records;
}

/**
 * GET /admin/users/template — Download CSV template for bulk user import
 */
router.get('/template', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), (req, res) => {
  const csvContent = 'Email,DisplayName,FirstName,LastName,Role,Campus\r\n' +
    'parent.64@gmail.com,John Doe,John,Doe,Student,64\r\n' +
    'parent.31@yahoo.com,Jane Smith,Jane,Smith,Student,31\r\n' +
    'parent.korat@gmail.com,Somchai Prasert,Somchai,Prasert,Student,Korat\r\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users_template.csv"');
  res.send(csvContent);
});

/**
 * POST /admin/users/import — Bulk import users via CSV file
 */
router.post('/import', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Please select a valid CSV file to upload.'));
    }

    const csvText = req.file.buffer.toString('utf-8');
    const records = parseCSV(csvText);

    if (records.length === 0) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('The CSV file is empty or does not contain valid data rows.'));
    }

    // Fetch all roles
    const allRoles = await db.queryRows('SELECT Id, Name FROM Roles');
    const roleMap = new Map();
    allRoles.forEach(r => roleMap.set(r.Name.toLowerCase(), r.Id));

    // Default to Student role if not found or blank
    const defaultRoleId = roleMap.get('student') || allRoles[0]?.Id;

    // Fetch active applications for campus mapping
    const allApps = await db.queryRows(
      `SELECT Id, Application, Campus FROM ApplicationInformation WHERE Status = 'Active' AND (Name IS NULL OR Name != 'Admin')`
    );

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of records) {
      const email = (row.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        skippedCount++;
        continue;
      }

      const displayName = (row.displayname || `${row.firstname || ''} ${row.lastname || ''}`).trim() || email.split('@')[0];
      const firstName = (row.firstname || '').trim();
      const lastName = (row.lastname || '').trim();
      const roleName = (row.role || 'Student').trim().toLowerCase();
      const roleId = roleMap.get(roleName) || defaultRoleId;
      const campusInput = (row.campus || '').trim();

      // Check if user exists
      const existing = await db.queryRows('SELECT Id FROM Users WHERE Email = @p0', [email]);
      let userId;

      if (existing.length > 0) {
        userId = existing[0].Id;
        await db.query(
          `UPDATE Users 
           SET DisplayName = COALESCE(NULLIF(@p0, ''), DisplayName),
               FirstName = COALESCE(NULLIF(@p1, ''), FirstName),
               LastName = COALESCE(NULLIF(@p2, ''), LastName),
               IsActive = 1
           WHERE Id = @p3`,
          [displayName, firstName, lastName, userId]
        );
        updatedCount++;
      } else {
        const result = await db.query(
          `INSERT INTO Users (GoogleSubjectId, Email, DisplayName, FirstName, LastName, IsActive, CreatedAt)
           VALUES (@p0, @p1, @p2, @p3, @p4, 1, GETDATE());
           SELECT SCOPE_IDENTITY() AS Id;`,
          ['pending-' + Date.now() + '-' + Math.floor(Math.random() * 1000), email, displayName, firstName, lastName]
        );
        userId = result.recordset[0].Id;
        createdCount++;
      }

      // Assign role if not already assigned
      const existingRole = await db.queryRows('SELECT 1 FROM UserRoles WHERE UserId = @p0 AND RoleId = @p1', [userId, roleId]);
      if (existingRole.length === 0) {
        await db.query('INSERT INTO UserRoles (UserId, RoleId) VALUES (@p0, @p1)', [userId, roleId]);
      }

      // If campus specified (e.g. 64, 31, Korat), map campus-specific booking applications into UserApplications
      if (campusInput) {
        let campusMatch = campusInput;
        if (campusInput === '64' || campusInput.toLowerCase().includes('main')) campusMatch = 'Main Campus';
        else if (campusInput === '31') campusMatch = 'Campus 31';
        else if (campusInput.toLowerCase().includes('korat')) campusMatch = 'Korat';

        const matchedApps = allApps.filter(app => {
          if (!app.Campus) return true; // Global apps like Booking
          return app.Campus.toLowerCase().includes(campusMatch.toLowerCase());
        });

        if (matchedApps.length > 0) {
          for (const app of matchedApps) {
            const hasApp = await db.queryRows('SELECT 1 FROM UserApplications WHERE UserId = @p0 AND ApplicationId = @p1', [userId, app.Id]);
            if (hasApp.length === 0) {
              await db.query('INSERT INTO UserApplications (UserId, ApplicationId, CanAccess) VALUES (@p0, @p1, 1)', [userId, app.Id]);
            }
          }
        }
      }
    }

    await logAudit({
      userId: req.user?.Id,
      action: 'USERS_IMPORTED',
      ipAddress: getClientIP(req),
      details: `Bulk imported users: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped.`
    });

    res.redirect('/admin/users?success=' + encodeURIComponent(`Bulk import completed: ${createdCount} created, ${updatedCount} updated${skippedCount > 0 ? ', ' + skippedCount + ' skipped' : ''}.`));
  } catch (err) {
    console.error('[ADMIN] Bulk import error:', err.message);
    res.redirect('/admin/users?error=' + encodeURIComponent('Bulk import failed: ' + err.message));
  }
});

/**
 * GET /admin/users — List portal users (paginated)
 */
router.get('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const allowedLimits = [10, 20, 30, 40, 50];
    const page = parseInt(req.query.page, 10) || 1;
    const rawLimit = parseInt(req.query.limit, 10) || 20;
    const limit = allowedLimits.includes(rawLimit) ? rawLimit : 20;
    const offset = (page - 1) * limit;

    // Total count + stats
    const statsResult = await db.queryRows(
      `SELECT COUNT(*) AS Total,
              SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS ActiveCount,
              SUM(CASE WHEN IsActive = 0 THEN 1 ELSE 0 END) AS InactiveCount
       FROM Users`
    );
    const stats = statsResult[0] || { Total: 0, ActiveCount: 0, InactiveCount: 0 };
    const total = stats.Total;
    const totalPages = Math.ceil(total / limit);

    // Paginated users
    const users = await db.queryRows(
      `SELECT u.Id, u.Email, u.DisplayName, u.FirstName, u.LastName, u.IsActive, u.CreatedAt, u.LastLoginAt,
              STUFF((SELECT ', ' + r.Name FROM Roles r 
                     INNER JOIN UserRoles ur ON ur.RoleId = r.Id 
                     WHERE ur.UserId = u.Id 
                     FOR XML PATH('')), 1, 2, '') AS RoleNames
       FROM Users u
       ORDER BY u.DisplayName ASC
       OFFSET @p0 ROWS FETCH NEXT @p1 ROWS ONLY`,
      [offset, limit]
    );

    res.render('admin/users', {
      layout: 'layout',
      title: 'User Management',
      users,
      stats,
      page,
      limit,
      allowedLimits,
      totalPages,
      total,
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
      stats: { Total: 0, ActiveCount: 0, InactiveCount: 0 },
      page: 1,
      limit: 20,
      allowedLimits: [10, 20, 30, 40, 50],
      totalPages: 0,
      total: 0,
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

    // Clear cached session roles if editing own account
    if (req.user && req.user.Id === id) {
      delete req.session.userRoles;
    }
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
