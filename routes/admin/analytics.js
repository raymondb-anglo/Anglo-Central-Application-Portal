/**
 * Application Launch Analytics & Usage Visualizations Route
 * 
 * Provides administrative insights, KPI cards, usage distributions,
 * peak launch hours, top applications, and live launch stream.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import db from '../../db.js';

const router = Router();

// Protect all analytics endpoints
router.use(requireAuth);
router.use(requireRole('PortalAdmin', 'ITAdmin', 'ApplicationAdmin'));

/**
 * Helper to fetch aggregated analytics data for a given timeframe and campus.
 */
async function getAnalyticsData(daysParam = 30, campusFilter = 'all') {
  const days = parseInt(daysParam, 10) || 30;
  const isAllTime = days <= 0;

  // Build time filter clause
  let timeClause = '';
  const queryParams = [];
  let pIdx = 0;

  if (!isAllTime) {
    timeClause = `AND l.Timestamp >= DATEADD(day, -@p${pIdx}, GETDATE())`;
    queryParams.push(days);
    pIdx++;
  }

  // Build campus filter clause
  let campusClause = '';
  if (campusFilter && campusFilter !== 'all') {
    if (campusFilter === 'global') {
      campusClause = 'AND (a.Campus IS NULL OR a.Campus = \'\')';
    } else {
      campusClause = `AND a.Campus = @p${pIdx}`;
      queryParams.push(campusFilter);
      pIdx++;
    }
  }

  // 1. KPI Summaries
  const kpiQuery = `
    SELECT 
      COUNT(*) AS TotalPeriod,
      COUNT(DISTINCT l.UserId) AS ActiveUsers,
      COUNT(DISTINCT l.ApplicationId) AS UniqueAppsUsed
    FROM AuditLogs l
    LEFT JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${timeClause} ${campusClause}
  `;
  const kpiRows = await db.queryRows(kpiQuery, queryParams);
  const totalPeriod = kpiRows[0]?.TotalPeriod || 0;
  const activeUsers = kpiRows[0]?.ActiveUsers || 0;
  const uniqueAppsUsed = kpiRows[0]?.UniqueAppsUsed || 0;

  // All time total app launches
  const allTimeRows = await db.queryRows(
    'SELECT COUNT(*) as AllTimeTotal FROM AuditLogs WHERE Action = \'APP_ACCESS\''
  );
  const allTimeTotal = allTimeRows[0]?.AllTimeTotal || 0;

  // 2. Top App in Period
  const topAppQuery = `
    SELECT TOP 1 a.Application, a.Campus, a.Icon, COUNT(*) as LaunchCount
    FROM AuditLogs l
    JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${timeClause} ${campusClause}
    GROUP BY a.Application, a.Campus, a.Icon
    ORDER BY LaunchCount DESC
  `;
  const topAppRows = await db.queryRows(topAppQuery, queryParams);
  const topApp = topAppRows[0] || null;

  // 3. Peak Hour in Period
  const peakHourQuery = `
    SELECT TOP 1 DATEPART(hour, l.Timestamp) as PeakHour, COUNT(*) as LaunchCount
    FROM AuditLogs l
    LEFT JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${timeClause} ${campusClause}
    GROUP BY DATEPART(hour, l.Timestamp)
    ORDER BY LaunchCount DESC
  `;
  const peakHourRows = await db.queryRows(peakHourQuery, queryParams);
  const peakHour = peakHourRows[0] || null;

  // 4. Timeline (daily launches)
  const timelineDays = isAllTime ? 60 : Math.min(days, 90);
  const timelineQuery = `
    SELECT 
      CONVERT(VARCHAR(10), l.Timestamp, 120) as [Date],
      COUNT(*) as [Count]
    FROM AuditLogs l
    LEFT JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' 
      AND l.Timestamp >= DATEADD(day, -${timelineDays}, GETDATE())
      ${campusClause}
    GROUP BY CONVERT(VARCHAR(10), l.Timestamp, 120)
    ORDER BY [Date] ASC
  `;
  const timelineParams = (campusFilter && campusFilter !== 'all' && campusFilter !== 'global') ? [campusFilter] : [];
  const timelineRows = await db.queryRows(timelineQuery, timelineParams);

  // 5. Top 10 Applications
  const topAppsQuery = `
    SELECT TOP 10 
      a.Id, 
      a.Application, 
      ISNULL(a.Campus, 'Global') as Campus, 
      a.Icon, 
      COUNT(*) as LaunchCount
    FROM AuditLogs l
    JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${timeClause} ${campusClause}
    GROUP BY a.Id, a.Application, a.Campus, a.Icon
    ORDER BY LaunchCount DESC
  `;
  const topAppsRows = await db.queryRows(topAppsQuery, queryParams);

  // 6. Campus Distribution
  const campusDistQuery = `
    SELECT 
      CASE 
        WHEN a.Campus IS NULL OR a.Campus = '' THEN 'Global / Central'
        ELSE a.Campus 
      END as Campus,
      COUNT(*) as LaunchCount
    FROM AuditLogs l
    JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${timeClause}
    GROUP BY CASE WHEN a.Campus IS NULL OR a.Campus = '' THEN 'Global / Central' ELSE a.Campus END
    ORDER BY LaunchCount DESC
  `;
  const campusDistRows = await db.queryRows(campusDistQuery, isAllTime ? [] : [days]);

  // 7. 24-Hour Distribution (0..23)
  const hourlyQuery = `
    SELECT 
      DATEPART(hour, l.Timestamp) as [Hour],
      COUNT(*) as [Count]
    FROM AuditLogs l
    LEFT JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${timeClause} ${campusClause}
    GROUP BY DATEPART(hour, l.Timestamp)
    ORDER BY [Hour] ASC
  `;
  const hourlyRows = await db.queryRows(hourlyQuery, queryParams);
  
  // Fill 24-hour array
  const hourlyMap = new Map(hourlyRows.map(r => [r.Hour, r.Count]));
  const fullHourly = [];
  for (let h = 0; h < 24; h++) {
    fullHourly.push({
      hour: h,
      label: `${h.toString().padStart(2, '0')}:00`,
      count: hourlyMap.get(h) || 0
    });
  }

  // 8. Top 5 Most Active Users
  const topUsersQuery = `
    SELECT TOP 5
      u.Id,
      u.DisplayName,
      u.Email,
      u.ProfilePicture,
      COUNT(*) as LaunchCount,
      MAX(l.Timestamp) as LastActive
    FROM AuditLogs l
    JOIN Users u ON l.UserId = u.Id
    LEFT JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${timeClause} ${campusClause}
    GROUP BY u.Id, u.DisplayName, u.Email, u.ProfilePicture
    ORDER BY LaunchCount DESC
  `;
  const topUsersRows = await db.queryRows(topUsersQuery, queryParams);

  // 9. Recent 15 launches (Live Stream)
  const recentLaunchesQuery = `
    SELECT TOP 15
      l.Id,
      l.Timestamp,
      l.IPAddress,
      ISNULL(u.DisplayName, u.Email) as UserName,
      u.Email as UserEmail,
      u.ProfilePicture,
      a.Application as AppName,
      a.Campus as AppCampus,
      a.Icon as AppIcon
    FROM AuditLogs l
    LEFT JOIN Users u ON l.UserId = u.Id
    LEFT JOIN ApplicationInformation a ON l.ApplicationId = a.Id
    WHERE l.Action = 'APP_ACCESS' ${campusClause}
    ORDER BY l.Timestamp DESC
  `;
  const recentLaunchesRows = await db.queryRows(recentLaunchesQuery, timelineParams);

  // 10. Distinct campuses for filtering
  const allCampusesRows = await db.queryRows(
    'SELECT DISTINCT Campus FROM ApplicationInformation WHERE Campus IS NOT NULL AND Campus <> \'\' ORDER BY Campus'
  );
  const campuses = allCampusesRows.map(r => r.Campus);

  return {
    period: {
      days,
      isAllTime,
      campus: campusFilter
    },
    kpis: {
      totalPeriod,
      allTimeTotal,
      activeUsers,
      uniqueAppsUsed,
      topApp,
      peakHour
    },
    timeline: timelineRows,
    topApps: topAppsRows,
    campusDistribution: campusDistRows,
    hourlyDistribution: fullHourly,
    topUsers: topUsersRows,
    recentLaunches: recentLaunchesRows,
    campuses
  };
}

/**
 * GET /admin/analytics
 * Render the main analytics dashboard.
 */
router.get('/', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const campus = req.query.campus || 'all';

    const analytics = await getAnalyticsData(days, campus);

    res.render('admin/analytics', {
      layout: 'layout',
      title: 'Usage Analytics & Visualizations',
      analytics,
      user: req.user
    });
  } catch (err) {
    console.error('[ANALYTICS] Error loading analytics:', err.message);
    res.status(500).render('error', {
      layout: 'layout',
      title: 'Analytics Error',
      message: 'Failed to generate usage analytics: ' + err.message,
      user: req.user
    });
  }
});

/**
 * GET /admin/analytics/data
 * Asynchronous JSON endpoint for dynamic filter updating without page refresh.
 */
router.get('/data', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const campus = req.query.campus || 'all';

    const data = await getAnalyticsData(days, campus);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[ANALYTICS API] Error loading analytics data:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
