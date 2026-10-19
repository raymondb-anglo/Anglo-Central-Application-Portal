import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logAudit, getClientIP } from '../../utils/auditLog.js';
import db from '../../db.js';
import { applicationSchema, validateBody } from '../../middleware/validators.js';

const router = Router();

/**
 * GET /admin/applications — List all registered applications (paginated)
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
              SUM(CASE WHEN Status = 'Active' THEN 1 ELSE 0 END) AS ActiveCount,
              SUM(CASE WHEN Status != 'Active' THEN 1 ELSE 0 END) AS InactiveCount,
              COUNT(DISTINCT ApplicationCode) AS UniqueApps
       FROM ApplicationInformation`
    );
    const stats = statsResult[0] || { Total: 0, ActiveCount: 0, InactiveCount: 0, UniqueApps: 0 };
    const total = stats.Total;
    const totalPages = Math.ceil(total / limit);

    // Paginated applications (ROW_NUMBER CTE for SQL Server 2008 R2+ compatibility)
    const applications = await db.queryRows(
      `WITH PagedApplications AS (
         SELECT ROW_NUMBER() OVER (ORDER BY DisplayOrder ASC, Application ASC, Campus ASC) AS RowNum,
                Id, ApplicationCode, Application, Campus, Link, Description,
                DatabaseType, Technology, Name, Icon, DisplayOrder, Status,
                CreatedAt, UpdatedAt
         FROM ApplicationInformation
       )
       SELECT Id, ApplicationCode, Application, Campus, Link, Description,
              DatabaseType, Technology, Name, Icon, DisplayOrder, Status,
              CreatedAt, UpdatedAt
       FROM PagedApplications
       WHERE RowNum > @p0 AND RowNum <= (@p0 + @p1)
       ORDER BY RowNum`,
      [offset, limit]
    );

    res.render('admin/applications', {
      layout: 'layout',
      title: 'Application Registry',
      applications,
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
    console.error('[ADMIN] Error loading applications:', err.message);
    res.render('admin/applications', {
      layout: 'layout',
      title: 'Application Registry',
      applications: [],
      stats: { Total: 0, ActiveCount: 0, InactiveCount: 0, UniqueApps: 0 },
      page: 1,
      limit: 20,
      allowedLimits: [10, 20, 30, 40, 50],
      totalPages: 0,
      total: 0,
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
router.post('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), validateBody(applicationSchema, (req, res, err) => {
  res.render('admin/application-form', {
    layout: 'layout',
    title: 'Add Application',
    application: req.body,
    isEdit: false,
    user: req.user,
    error: err
  });
}), async (req, res) => {
  try {
    const {
      applicationCode, application, campus, link, description,
      databaseType, technology, name, icon, displayOrder, status
    } = req.validatedBody;

    await db.query(
      `INSERT INTO ApplicationInformation
       (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, CreatedAt, UpdatedAt)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, GETDATE(), GETDATE())`,
      [
        applicationCode,
        application,
        campus,
        link,
        description,
        databaseType,
        technology,
        name,
        icon,
        displayOrder,
        status
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
router.post('/:id', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.redirect('/admin/applications?error=' + encodeURIComponent('Invalid application ID.'));
  }
  next();
}, validateBody(applicationSchema, (req, res, err) => {
  const id = parseInt(req.params.id, 10);
  res.render('admin/application-form', {
    layout: 'layout',
    title: 'Edit Application',
    application: { ...req.body, Id: id },
    isEdit: true,
    user: req.user,
    error: err
  });
}), async (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const {
      applicationCode, application, campus, link, description,
      databaseType, technology, name, icon, displayOrder, status
    } = req.validatedBody;

    await db.query(
      `UPDATE ApplicationInformation SET
         ApplicationCode = @p0, Application = @p1, Campus = @p2, Link = @p3,
         Description = @p4, DatabaseType = @p5, Technology = @p6, Name = @p7,
         Icon = @p8, DisplayOrder = @p9, Status = @p10,
         UpdatedAt = GETDATE()
       WHERE Id = @p11`,
      [
        applicationCode,
        application,
        campus,
        link,
        description,
        databaseType,
        technology,
        name,
        icon,
        displayOrder,
        status,
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

    // Disassociate audit logs first to satisfy MSSQL foreign key constraint while preserving audit trail
    await db.query('UPDATE AuditLogs SET ApplicationId = NULL WHERE ApplicationId = @p0', [id]);
    // Delete related records
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
