import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logAudit, getClientIP } from '../../utils/auditLog.js';
import db from '../../db.js';

const router = Router();

/**
 * Build dynamic WHERE clause from filter query parameters.
 * Following the same pattern used in PGJ-Booking-System's adminAuditLogs.js
 * @param {Object} query - req.query object
 * @returns {{ whereClause: string, params: Array, filters: Object }}
 */
function buildWhereAndParams(query) {
  const action = query.action || '';
  const userSearch = query.user || '';
  const dateFrom = query.dateFrom || '';
  const dateTo = query.dateTo || '';
  const application = query.application || '';

  const where = [];
  const params = [];
  let pIndex = 0;

  if (action) {
    where.push(`al.Action = @p${pIndex}`);
    params.push(action);
    pIndex++;
  }
  if (userSearch) {
    where.push(`(u.Email LIKE @p${pIndex} OR u.DisplayName LIKE @p${pIndex})`);
    params.push('%' + userSearch + '%');
    pIndex++;
  }
  if (dateFrom) {
    where.push(`al.Timestamp >= @p${pIndex}`);
    params.push(dateFrom + ' 00:00:00');
    pIndex++;
  }
  if (dateTo) {
    where.push(`al.Timestamp <= @p${pIndex}`);
    params.push(dateTo + ' 23:59:59');
    pIndex++;
  }
  if (application) {
    where.push(`ai.ApplicationCode = @p${pIndex}`);
    params.push(application);
    pIndex++;
  }

  return {
    whereClause: where.length > 0 ? 'WHERE ' + where.join(' AND ') : '',
    params,
    filters: { action, user: userSearch, dateFrom, dateTo, application }
  };
}

/**
 * Build the filter query string for pagination links
 * (preserves filter state across page navigation)
 */
function buildFilterQueryString(filters) {
  const parts = [];
  if (filters.action) parts.push('action=' + encodeURIComponent(filters.action));
  if (filters.user) parts.push('user=' + encodeURIComponent(filters.user));
  if (filters.dateFrom) parts.push('dateFrom=' + encodeURIComponent(filters.dateFrom));
  if (filters.dateTo) parts.push('dateTo=' + encodeURIComponent(filters.dateTo));
  if (filters.application) parts.push('application=' + encodeURIComponent(filters.application));
  return parts.length > 0 ? '&' + parts.join('&') : '';
}

/**
 * GET /admin/audit-logs — View audit logs with filters and pagination
 */
router.get('/', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const allowedLimits = [10, 20, 30, 40, 50];
    const page = parseInt(req.query.page, 10) || 1;
    const rawLimit = parseInt(req.query.limit, 10) || 20;
    const limit = allowedLimits.includes(rawLimit) ? rawLimit : 20;
    const offset = (page - 1) * limit;

    const { whereClause, params, filters } = buildWhereAndParams(req.query);

    // Total count (with filters applied)
    const countResult = await db.queryRows(
      `SELECT COUNT(*) AS Total
       FROM AuditLogs al
       LEFT JOIN Users u ON u.Id = al.UserId
       LEFT JOIN ApplicationInformation ai ON ai.Id = al.ApplicationId
       ${whereClause}`,
      params
    );
    const total = countResult[0]?.Total || 0;
    const totalPages = Math.ceil(total / limit);

    // Paginated logs (ROW_NUMBER CTE for SQL Server 2008 R2+ compatibility)
    // We need to add offset/limit params AFTER the filter params
    const allParams = [...params, offset, limit];
    const pOffset = params.length;
    const pLimit = params.length + 1;

    const logs = await db.queryRows(
      `WITH PagedLogs AS (
         SELECT ROW_NUMBER() OVER (ORDER BY al.Timestamp DESC) AS RowNum,
                al.Id, al.Action, al.Timestamp, al.IPAddress, al.Details,
                u.Email AS UserEmail, u.DisplayName AS UserName,
                ai.Application AS AppName, ai.Campus AS AppCampus, ai.ApplicationCode
         FROM AuditLogs al
         LEFT JOIN Users u ON u.Id = al.UserId
         LEFT JOIN ApplicationInformation ai ON ai.Id = al.ApplicationId
         ${whereClause}
       )
       SELECT Id, Action, Timestamp, IPAddress, Details, UserEmail, UserName, AppName, AppCampus, ApplicationCode
       FROM PagedLogs
       WHERE RowNum > @p${pOffset} AND RowNum <= (@p${pOffset} + @p${pLimit})
       ORDER BY RowNum`,
      allParams
    );

    // Fetch distinct values for filter dropdowns
    const actions = await db.queryRows('SELECT DISTINCT Action FROM AuditLogs ORDER BY Action');
    const applications = await db.queryRows(
      `SELECT DISTINCT ai.ApplicationCode
       FROM AuditLogs al
       INNER JOIN ApplicationInformation ai ON ai.Id = al.ApplicationId
       WHERE al.ApplicationId IS NOT NULL
       ORDER BY ai.ApplicationCode`
    );

    const filterQS = buildFilterQueryString(filters);

    res.render('admin/audit-logs', {
      layout: 'layout',
      title: 'Audit Logs',
      logs,
      page,
      limit,
      allowedLimits,
      totalPages,
      total,
      filters,
      filterQS,
      actions: actions.map(a => a.Action),
      applications: applications.map(a => a.ApplicationCode),
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
      filters: { action: '', user: '', dateFrom: '', dateTo: '', application: '' },
      filterQS: '',
      actions: [],
      applications: [],
      user: req.user,
      error: 'Failed to load audit logs: ' + err.message
    });
  }
});

/**
 * GET /admin/audit-logs/export — Export audit logs as Excel (.xlsx)
 * Applies the same filters as the main listing page.
 * Uses exceljs (same library as PGJ-Booking-System).
 */
router.get('/export', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const { whereClause, params, filters } = buildWhereAndParams(req.query);

    // Fetch ALL matching records (no pagination — full export)
    const logs = await db.queryRows(
      `SELECT al.Id, al.Action, al.Timestamp, al.IPAddress, al.Details,
              u.Email AS UserEmail, u.DisplayName AS UserName,
              ai.Application AS AppName, ai.Campus AS AppCampus
       FROM AuditLogs al
       LEFT JOIN Users u ON u.Id = al.UserId
       LEFT JOIN ApplicationInformation ai ON ai.Id = al.ApplicationId
       ${whereClause}
       ORDER BY al.Timestamp DESC`,
      params
    );

    // Create workbook with styled header
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Anglo Central Application Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Audit Logs', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    // Column definitions
    sheet.columns = [
      { header: 'ID', key: 'Id', width: 8 },
      { header: 'Date', key: 'Timestamp', width: 22 },
      { header: 'User', key: 'UserEmail', width: 32 },
      { header: 'Action', key: 'Action', width: 22 },
      { header: 'Application', key: 'Application', width: 28 },
      { header: 'IP Address', key: 'IPAddress', width: 16 },
      { header: 'Details', key: 'Details', width: 50 }
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 28;

    // Add data rows
    for (const log of logs) {
      sheet.addRow({
        Id: log.Id,
        Timestamp: log.Timestamp ? new Date(log.Timestamp) : null,
        UserEmail: log.UserEmail || log.UserName || '—',
        Action: log.Action,
        Application: log.AppName ? (log.AppName + (log.AppCampus ? ' — ' + log.AppCampus : '')) : '—',
        IPAddress: log.IPAddress || '—',
        Details: log.Details || '—'
      });
    }

    // Format Timestamp column as date
    sheet.getColumn('Timestamp').numFmt = 'dd mmm yyyy, hh:mm:ss';

    // Auto-filter
    sheet.autoFilter = { from: 'A1', to: 'G1' };

    // Add filter info row at the bottom
    const lastRow = sheet.rowCount + 2;
    const activeFilters = [];
    if (filters.action) activeFilters.push(`Action: ${filters.action}`);
    if (filters.user) activeFilters.push(`User: ${filters.user}`);
    if (filters.dateFrom) activeFilters.push(`From: ${filters.dateFrom}`);
    if (filters.dateTo) activeFilters.push(`To: ${filters.dateTo}`);
    if (filters.application) activeFilters.push(`App: ${filters.application}`);

    sheet.getCell(`A${lastRow}`).value = `Exported: ${new Date().toLocaleString()} | Records: ${logs.length}${activeFilters.length > 0 ? ' | Filters: ' + activeFilters.join(', ') : ''}`;
    sheet.getCell(`A${lastRow}`).font = { italic: true, color: { argb: 'FF888888' } };

    // Audit the export action
    try {
      await logAudit({
        userId: req.user?.Id,
        action: 'AUDIT_LOGS_EXPORTED',
        ipAddress: getClientIP(req),
        details: `Exported ${logs.length} audit log records${activeFilters.length > 0 ? ' (Filters: ' + activeFilters.join(', ') + ')' : ''}`
      });
    } catch { /* audit should not block */ }

    // Send as download
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[ADMIN] Error exporting audit logs:', err.message);
    res.redirect('/admin/audit-logs?error=' + encodeURIComponent('Export failed: ' + err.message));
  }
});

export default router;
