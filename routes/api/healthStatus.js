/**
 * Health Status API Routes
 *
 * Provides JSON endpoints for the dashboard to poll application health statuses.
 *
 * Endpoints:
 *   GET  /api/health-status           — All statuses (used by dashboard polling)
 *   GET  /api/health-status/:id       — Single application status
 *   POST /api/health-status/:id/check — Force re-check (PortalAdmin only)
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getAllStatuses, getStatus, forceCheck } from '../../utils/healthCheck.js';

const router = Router();

/**
 * GET /api/health-status
 * Returns all cached application health statuses.
 * Used by the dashboard's client-side polling (every 60 seconds).
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const data = getAllStatuses();
    res.json(data);
  } catch (err) {
    console.error('[HEALTH API] Error fetching statuses:', err.message);
    res.status(500).json({ error: 'Failed to retrieve health statuses.' });
  }
});

/**
 * GET /api/health-status/:id
 * Returns the cached health status for a single application.
 */
router.get('/:id', requireAuth, (req, res) => {
  try {
    const appId = parseInt(req.params.id, 10);
    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid application ID.' });
    }

    const status = getStatus(appId);
    if (!status) {
      return res.status(404).json({ error: 'No health data available for this application.' });
    }

    res.json({ appId, ...status });
  } catch (err) {
    console.error('[HEALTH API] Error fetching status:', err.message);
    res.status(500).json({ error: 'Failed to retrieve health status.' });
  }
});

/**
 * POST /api/health-status/:id/check
 * Force an immediate health re-check for a single application.
 * Restricted to PortalAdmin / ITAdmin roles.
 */
router.post('/:id/check', requireAuth, requireRole('PortalAdmin', 'ITAdmin'), async (req, res) => {
  try {
    const appId = parseInt(req.params.id, 10);
    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid application ID.' });
    }

    const result = await forceCheck(appId);
    if (!result) {
      return res.status(404).json({ error: 'Application not found or inactive.' });
    }

    res.json({ appId, ...result });
  } catch (err) {
    console.error('[HEALTH API] Error forcing check:', err.message);
    res.status(500).json({ error: 'Failed to perform health check.' });
  }
});

export default router;
