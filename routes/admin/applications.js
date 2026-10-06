import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logAudit, getClientIP } from '../../utils/auditLog.js';
import db from '../../db.js';

const router = Router();

/**
 * GET /admin/applications — List all registered applications
 */
router.get('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const applications = await db.queryRows(
      `SELECT Id, ApplicationCode, Application, Campus, Link, Description,
              DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO,
              CreatedAt, UpdatedAt
       FROM ApplicationInformation
       ORDER BY DisplayOrder ASC, Application ASC, Campus ASC`
    );

    res.render('admin/applications', {
      layout: 'layout',
      title: 'Application Registry',
      applications,
      user: req.user,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('[ADMIN] Error loading applications:', err.message);
    res.render('admin/applications', {
      layout: 'layout',
      title: 'Application Registry',
      applications: [],
      user: req.user,
      error: 'Failed to load applications: ' + err.message
    });
  }
});

/**
 * GET /admin/applications/new — Show add application form
 */
router.get('/new', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), (req, res) => {
  res.render('admin/application-form', {
    layout: 'layout',
    title: 'Add Application',
    application: null,
    isEdit: false,
    user: req.user,
    error: null
  });
});

/**
 * GET /admin/applications/:id/edit — Show edit application form
 */
router.get('/:id/edit', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const rows = await db.queryRows(
      'SELECT * FROM ApplicationInformation WHERE Id = @p0',
      [parseInt(req.params.id, 10)]
    );

    if (rows.length === 0) {
      return res.redirect('/admin/applications?error=' + encodeURIComponent('Application not found.'));
    }

    res.render('admin/application-form', {
      layout: 'layout',
      title: 'Edit Application',
      application: rows[0],
      isEdit: true,
      user: req.user,
      error: null
    });
  } catch (err) {
    console.error('[ADMIN] Error loading application:', err.message);
    res.redirect('/admin/applications?error=' + encodeURIComponent('Failed to load application.'));
  }
});

/**
 * POST /admin/applications — Create new application
 */
router.post('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const {
      applicationCode, application, campus, link, description,
      databaseType, technology, name, icon, displayOrder, status, requiresSSO
    } = req.body;

    // Validation
    if (!applicationCode || !application || !link) {
      return res.render('admin/application-form', {
        layout: 'layout',
        title: 'Add Application',
        application: req.body,
        isEdit: false,
        user: req.user,
        error: 'Application Code, Application Name, and Link are required.'
      });
    }

    await db.query(
      `INSERT INTO ApplicationInformation
       (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO, CreatedAt, UpdatedAt)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, GETDATE(), GETDATE())`,
      [
        applicationCode.trim(),
        application.trim(),
        campus?.trim() || null,
        link.trim(),
        description?.trim() || null,
        databaseType?.trim() || null,
        technology?.trim() || null,
        name?.trim() || null,
        icon?.trim() || null,
        parseInt(displayOrder, 10) || 0,
        status || 'Active',
        requiresSSO === 'on' || requiresSSO === '1' ? 1 : 0
      ]
    );

    // Audit log
    try {
      await logAudit({
        userId: req.user?.Id,
        action: 'APP_CREATED',
        ipAddress: getClientIP(req),
        details: `Created application: ${application} (${applicationCode}) — Campus: ${campus || 'N/A'}`
      });
    } catch { /* audit should not block */ }

    res.redirect('/admin/applications?success=' + encodeURIComponent('Application created successfully.'));
  } catch (err) {
    console.error('[ADMIN] Error creating application:', err.message);
    res.render('admin/application-form', {
      layout: 'layout',
      title: 'Add Application',
      application: req.body,
      isEdit: false,
      user: req.user,
      error: 'Failed to create application: ' + err.message
    });
  }
});

/**
 * POST /admin/applications/:id — Update application
 */
router.post('/:id', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const {
      applicationCode, application, campus, link, description,
      databaseType, technology, name, icon, displayOrder, status, requiresSSO
    } = req.body;

    if (!applicationCode || !application || !link) {
      return res.render('admin/application-form', {
        layout: 'layout',
        title: 'Edit Application',
        application: { ...req.body, Id: id },
        isEdit: true,
        user: req.user,
        error: 'Application Code, Application Name, and Link are required.'
      });
    }

    await db.query(
      `UPDATE ApplicationInformation SET
         ApplicationCode = @p0, Application = @p1, Campus = @p2, Link = @p3,
         Description = @p4, DatabaseType = @p5, Technology = @p6, Name = @p7,
         Icon = @p8, DisplayOrder = @p9, Status = @p10, RequiresSSO = @p11,
         UpdatedAt = GETDATE()
       WHERE Id = @p12`,
      [
        applicationCode.trim(),
        application.trim(),
        campus?.trim() || null,
        link.trim(),
        description?.trim() || null,
        databaseType?.trim() || null,
        technology?.trim() || null,
        name?.trim() || null,
        icon?.trim() || null,
        parseInt(displayOrder, 10) || 0,
        status || 'Active',
        requiresSSO === 'on' || requiresSSO === '1' ? 1 : 0,
        id
      ]
    );

    try {
      await logAudit({
        userId: req.user?.Id,
        action: 'APP_UPDATED',
        applicationId: id,
        ipAddress: getClientIP(req),
        details: `Updated application: ${application} (${applicationCode}) — Campus: ${campus || 'N/A'}`
      });
    } catch { /* audit should not block */ }

    res.redirect('/admin/applications?success=' + encodeURIComponent('Application updated successfully.'));
  } catch (err) {
    console.error('[ADMIN] Error updating application:', err.message);
    res.render('admin/application-form', {
      layout: 'layout',
      title: 'Edit Application',
      application: { ...req.body, Id: id },
      isEdit: true,
      user: req.user,
      error: 'Failed to update application: ' + err.message
    });
  }
});

/**
 * POST /admin/applications/:id/toggle — Activate/Deactivate application
 */
router.post('/:id/toggle', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const rows = await db.queryRows(
      'SELECT Id, Application, ApplicationCode, Status FROM ApplicationInformation WHERE Id = @p0',
      [id]
    );

    if (rows.length === 0) {
      return res.redirect('/admin/applications?error=' + encodeURIComponent('Application not found.'));
    }

    const current = rows[0];
    const newStatus = current.Status === 'Active' ? 'Inactive' : 'Active';

    await db.query(
      'UPDATE ApplicationInformation SET Status = @p0, UpdatedAt = GETDATE() WHERE Id = @p1',
      [newStatus, id]
    );

    try {
      await logAudit({
        userId: req.user?.Id,
        action: newStatus === 'Active' ? 'APP_ACTIVATED' : 'APP_DEACTIVATED',
        applicationId: id,
        ipAddress: getClientIP(req),
        details: `${newStatus === 'Active' ? 'Activated' : 'Deactivated'} application: ${current.Application} (${current.ApplicationCode})`
      });
    } catch { /* audit should not block */ }

    res.redirect('/admin/applications?success=' + encodeURIComponent(`Application ${newStatus === 'Active' ? 'activated' : 'deactivated'} successfully.`));
  } catch (err) {
    console.error('[ADMIN] Error toggling application:', err.message);
    res.redirect('/admin/applications?error=' + encodeURIComponent('Failed to update application status.'));
  }
});

/**
 * POST /admin/applications/:id/delete — Delete application
 */
router.post('/:id/delete', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const rows = await db.queryRows(
      'SELECT Application, ApplicationCode FROM ApplicationInformation WHERE Id = @p0',
      [id]
    );

    if (rows.length === 0) {
      return res.redirect('/admin/applications?error=' + encodeURIComponent('Application not found.'));
    }

    // Delete related records first
    await db.query('DELETE FROM ApplicationRoles WHERE ApplicationId = @p0', [id]);
    await db.query('DELETE FROM UserApplications WHERE ApplicationId = @p0', [id]);
    await db.query('DELETE FROM ApplicationInformation WHERE Id = @p0', [id]);

    try {
      await logAudit({
        userId: req.user?.Id,
        action: 'APP_DELETED',
        ipAddress: getClientIP(req),
        details: `Deleted application: ${rows[0].Application} (${rows[0].ApplicationCode})`
      });
    } catch { /* audit should not block */ }

    res.redirect('/admin/applications?success=' + encodeURIComponent('Application deleted successfully.'));
  } catch (err) {
    console.error('[ADMIN] Error deleting application:', err.message);
    res.redirect('/admin/applications?error=' + encodeURIComponent('Failed to delete application.'));
  }
});

export default router;
