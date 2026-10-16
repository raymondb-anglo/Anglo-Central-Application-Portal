import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import db from '../../db.js';

const router = Router();

/**
 * GET /admin/audit-logs — View audit logs with pagination
 */
router.get('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const allowedLimits = [10, 20, 30, 40, 50];
    const page = parseInt(req.query.page, 10) || 1;
    const rawLimit = parseInt(req.query.limit, 10) || 20;
    const limit = allowedLimits.includes(rawLimit) ? rawLimit : 20;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await db.queryRows('SELECT COUNT(*) AS Total FROM AuditLogs');
    const total = countResult[0]?.Total || 0;
    const totalPages = Math.ceil(total / limit);

    // Get logs with user info (ROW_NUMBER CTE for SQL Server 2008 R2+ compatibility)
    const logs = await db.queryRows(
      `WITH PagedLogs AS (
         SELECT ROW_NUMBER() OVER (ORDER BY al.Timestamp DESC) AS RowNum,
                al.Id, al.Action, al.Timestamp, al.IPAddress, al.Details,
                u.Email AS UserEmail, u.DisplayName AS UserName,
                ai.Application AS AppName
         FROM AuditLogs al
         LEFT JOIN Users u ON u.Id = al.UserId
         LEFT JOIN ApplicationInformation ai ON ai.Id = al.ApplicationId
       )
       SELECT Id, Action, Timestamp, IPAddress, Details, UserEmail, UserName, AppName
       FROM PagedLogs
       WHERE RowNum > @p0 AND RowNum <= (@p0 + @p1)
       ORDER BY RowNum`,
      [offset, limit]
    );

    res.render('admin/audit-logs', {
      layout: 'layout',
      title: 'Audit Logs',
      logs,
      page,
      limit,
      allowedLimits,
      totalPages,
      total,
      user: req.user
    });
  } catch (err) {
    console.error('[ADMIN] Error loading audit logs:', err.message);
    res.render('admin/audit-logs', {
      layout: 'layout',
      title: 'Audit Logs',
      logs: [],
      page: 1,
      limit: 20,
      allowedLimits: [10, 20, 30, 40, 50],
      totalPages: 0,
      total: 0,
      user: req.user,
      error: 'Failed to load audit logs: ' + err.message
    });
  }
});

export default router;
