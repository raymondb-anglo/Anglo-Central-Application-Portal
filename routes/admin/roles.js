import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logAudit, getClientIP } from '../../utils/auditLog.js';
import db from '../../db.js';

const router = Router();

/**
 * GET /admin/roles — List roles with assignment counts
 */
router.get('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const roles = await db.queryRows(
      `SELECT r.Id, r.Name, r.Description,
              (SELECT COUNT(*) FROM UserRoles ur WHERE ur.RoleId = r.Id) AS UserCount,
              (SELECT COUNT(*) FROM ApplicationRoles ar WHERE ar.RoleId = r.Id AND ar.CanAccess = 1) AS AppCount
       FROM Roles r
       ORDER BY r.Name`
    );

    res.render('admin/roles', {
      layout: 'layout',
      title: 'Role Management',
      roles,
      user: req.user,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('[ADMIN] Error loading roles:', err.message);
    res.render('admin/roles', {
      layout: 'layout',
      title: 'Role Management',
      roles: [],
      user: req.user,
      error: 'Failed to load roles: ' + err.message
    });
  }
});

/**
 * GET /admin/roles/:id/edit — Edit role and its application access
 */
router.get('/:id/edit', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const roles = await db.queryRows('SELECT * FROM Roles WHERE Id = @p0', [id]);
    if (roles.length === 0) return res.redirect('/admin/roles?error=' + encodeURIComponent('Role not found.'));

    const applications = await db.queryRows(
      `SELECT Id, ApplicationCode, Application, Campus FROM ApplicationInformation ORDER BY DisplayOrder`
    );
    const roleApps = await db.queryRows(
      'SELECT ApplicationId FROM ApplicationRoles WHERE RoleId = @p0 AND CanAccess = 1', [id]
    );

    res.render('admin/role-form', {
      layout: 'layout',
      title: 'Edit Role',
      editRole: roles[0],
      applications,
      roleAppIds: roleApps.map(a => a.ApplicationId),
      user: req.user,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('[ADMIN] Error:', err.message);
    res.redirect('/admin/roles?error=' + encodeURIComponent('Failed to load role.'));
  }
});

/**
 * POST /admin/roles/:id — Update role and its application access
 */
router.post('/:id', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { description } = req.body;
    let appIds = req.body.applications || [];
    if (!Array.isArray(appIds)) appIds = [appIds];

    await db.query('UPDATE Roles SET Description = @p0 WHERE Id = @p1', [description?.trim() || '', id]);

    // Replace application access for this role
    await db.query('DELETE FROM ApplicationRoles WHERE RoleId = @p0', [id]);
    for (const aid of appIds) {
      await db.query('INSERT INTO ApplicationRoles (ApplicationId, RoleId, CanAccess) VALUES (@p0, @p1, 1)', [parseInt(aid, 10), id]);
    }

    await logAudit({ userId: req.user?.Id, action: 'ROLE_UPDATED', ipAddress: getClientIP(req), details: `Updated role ID ${id}` });

    res.redirect('/admin/roles?success=' + encodeURIComponent('Role updated successfully.'));
  } catch (err) {
    console.error('[ADMIN] Error updating role:', err.message);
    res.redirect('/admin/roles/' + id + '/edit?error=' + encodeURIComponent('Failed to update role.'));
  }
});

export default router;
