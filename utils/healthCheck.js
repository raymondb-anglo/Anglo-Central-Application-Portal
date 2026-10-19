/**
 * Health Check Utility — Background Application Uptime Monitor
 *
 * Periodically pings every active application's URL (HTTP HEAD) and
 * caches the result in memory. The dashboard polls the cached results
 * via the /api/health-status endpoint.
 *
 * Inspired by:
 *   - Dashy (https://github.com/Lissy93/dashy) — statusCheck module
 *   - Homer (https://github.com/bastienwirtz/homer) — health-check badges
 *
 * Design decisions:
 *   - HEAD requests (not GET) to minimize bandwidth
 *   - In-memory Map (no DB writes) for Phase 1
 *   - Staggered checks (200ms gap) to avoid simultaneous outbound connections
 *   - AbortController with 5s timeout per request
 *   - 3xx treated as online (login redirects are normal for internal apps)
 *   - 4xx treated as degraded (server responds but may need auth)
 */

import db from '../db.js';

// ---- Configuration ----
const CHECK_INTERVAL_MS = 2 * 60 * 1000;   // Run a full sweep every 2 minutes
const REQUEST_TIMEOUT_MS = 5000;            // Per-request timeout (5 seconds)
const SLOW_THRESHOLD_MS  = 2000;            // Latency > 2s = degraded
const STAGGER_DELAY_MS   = 200;             // Gap between checks to avoid flooding

// ---- Status constants ----
export const STATUS = Object.freeze({
  ONLINE:   'online',    // 🟢 HTTP 2xx within latency threshold
  DEGRADED: 'degraded',  // 🟡 HTTP 2xx but slow, or 3xx/4xx
  OFFLINE:  'offline',   // 🔴 Timeout, DNS failure, 5xx, or connection refused
  UNKNOWN:  'unknown'    // ⚪ Not yet checked
});

/**
 * In-memory health status cache.
 * Key: ApplicationId (number)
 * Value: { status, latency, lastChecked, httpCode }
 */
const statusCache = new Map();

/** Handle for the setInterval timer so it can be stopped */
let intervalHandle = null;

/** Flag to prevent overlapping sweep cycles */
let isRunning = false;

// ---- Internal helpers ----

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check a single URL and return its health result.
 * @param {string} url - The URL to check
 * @returns {Promise<{status: string, latency: number|null, httpCode: number|null}>}
 */
async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Anglo-Portal-HealthCheck/1.0'
      }
    });

    const latency = Date.now() - start;
    const code = response.status;

    // Determine status based on HTTP code + latency
    let status;
    if (code >= 200 && code < 300) {
      status = latency >= SLOW_THRESHOLD_MS ? STATUS.DEGRADED : STATUS.ONLINE;
    } else if (code >= 300 && code < 400) {
      // Redirects (302 to login page, etc.) — the server is responding
      status = STATUS.ONLINE;
    } else if (code >= 400 && code < 500) {
      // 401/403 = server is up but requires auth → degraded (not offline)
      status = STATUS.DEGRADED;
    } else {
      // 5xx = server error
      status = STATUS.OFFLINE;
    }

    return { status, latency, httpCode: code };
  } catch (err) {
    const latency = Date.now() - start;

    // Some servers reject HEAD but accept GET — try GET as fallback
    if (err.cause?.code === 'ERR_HTTP2_ERROR' || err.message?.includes('405')) {
      try {
        const fallbackResponse = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          redirect: 'follow',
          headers: { 'User-Agent': 'Anglo-Portal-HealthCheck/1.0' }
        });
        const fallbackLatency = Date.now() - start;
        const code = fallbackResponse.status;

        let status;
        if (code >= 200 && code < 300) {
          status = fallbackLatency >= SLOW_THRESHOLD_MS ? STATUS.DEGRADED : STATUS.ONLINE;
        } else if (code >= 300 && code < 400) {
          status = STATUS.ONLINE;
        } else if (code >= 400 && code < 500) {
          status = STATUS.DEGRADED;
        } else {
          status = STATUS.OFFLINE;
        }

        return { status, latency: fallbackLatency, httpCode: code };
      } catch {
        // Fallback also failed
      }
    }

    // AbortError (timeout), DNS failure, connection refused, etc.
    return { status: STATUS.OFFLINE, latency: latency >= REQUEST_TIMEOUT_MS ? null : latency, httpCode: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch all active application URLs from the database.
 * @returns {Promise<Array<{Id: number, Link: string, ApplicationCode: string, Application: string}>>}
 */
async function getActiveApplications() {
  try {
    return await db.queryRows(
      `SELECT Id, Link, ApplicationCode, Application, Campus
       FROM ApplicationInformation
       WHERE Status = 'Active' AND Link IS NOT NULL AND Link != ''
       ORDER BY Id`
    );
  } catch (err) {
    console.error('[HEALTH] Failed to fetch applications:', err.message);
    return [];
  }
}

/**
 * Run a full health check sweep across all active applications.
 * Checks are staggered to avoid hammering the network.
 */
async function runHealthSweep() {
  if (isRunning) {
    console.warn('[HEALTH] Previous sweep still running — skipping this cycle.');
    return;
  }

  isRunning = true;
  const sweepStart = Date.now();

  try {
    const apps = await getActiveApplications();

    if (apps.length === 0) {
      return;
    }

    for (const app of apps) {
      const result = await checkUrl(app.Link);

      statusCache.set(app.Id, {
        status: result.status,
        latency: result.latency,
        httpCode: result.httpCode,
        lastChecked: new Date().toISOString(),
        applicationCode: app.ApplicationCode,
        application: app.Application,
        campus: app.Campus || null
      });

      // Stagger: wait before checking the next app
      if (apps.indexOf(app) < apps.length - 1) {
        await sleep(STAGGER_DELAY_MS);
      }
    }

    const elapsed = Date.now() - sweepStart;
    const online = [...statusCache.values()].filter(s => s.status === STATUS.ONLINE).length;
    const degraded = [...statusCache.values()].filter(s => s.status === STATUS.DEGRADED).length;
    const offline = [...statusCache.values()].filter(s => s.status === STATUS.OFFLINE).length;

    console.log(
      `[HEALTH] Sweep complete in ${elapsed}ms — ` +
      `🟢 ${online} online, 🟡 ${degraded} degraded, 🔴 ${offline} offline ` +
      `(${apps.length} apps checked)`
    );
  } catch (err) {
    console.error('[HEALTH] Sweep error:', err.message);
  } finally {
    isRunning = false;
  }
}

// ---- Public API ----

/**
 * Start the background health checker.
 * Runs an initial sweep immediately, then repeats every CHECK_INTERVAL_MS.
 */
export function startHealthChecker() {
  console.log(`[HEALTH] Starting health checker (interval: ${CHECK_INTERVAL_MS / 1000}s, timeout: ${REQUEST_TIMEOUT_MS / 1000}s)`);

  // Initial sweep after a short delay (let the server finish booting)
  setTimeout(() => {
    runHealthSweep();
  }, 3000);

  // Recurring sweeps
  intervalHandle = setInterval(runHealthSweep, CHECK_INTERVAL_MS);
}

/**
 * Stop the background health checker.
 */
export function stopHealthChecker() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[HEALTH] Health checker stopped.');
  }
}

/**
 * Get all cached health statuses.
 * @returns {Object} - { statuses: {...}, summary: {...}, nextCheck: string }
 */
export function getAllStatuses() {
  const statuses = {};
  for (const [appId, info] of statusCache) {
    statuses[appId] = info;
  }

  const values = [...statusCache.values()];
  const summary = {
    online:   values.filter(s => s.status === STATUS.ONLINE).length,
    degraded: values.filter(s => s.status === STATUS.DEGRADED).length,
    offline:  values.filter(s => s.status === STATUS.OFFLINE).length,
    unknown:  values.filter(s => s.status === STATUS.UNKNOWN).length,
    total:    values.length
  };

  return {
    statuses,
    summary,
    nextCheck: intervalHandle
      ? new Date(Date.now() + CHECK_INTERVAL_MS).toISOString()
      : null
  };
}

/**
 * Get the cached health status for a single application.
 * @param {number} appId - ApplicationId
 * @returns {Object|null}
 */
export function getStatus(appId) {
  return statusCache.get(appId) || null;
}

/**
 * Force an immediate health check for a single application.
 * @param {number} appId - ApplicationId
 * @returns {Promise<Object|null>}
 */
export async function forceCheck(appId) {
  try {
    const rows = await db.queryRows(
      `SELECT Id, Link, ApplicationCode, Application, Campus
       FROM ApplicationInformation
       WHERE Id = @p0 AND Status = 'Active'`,
      [appId]
    );

    if (rows.length === 0) return null;

    const app = rows[0];
    const result = await checkUrl(app.Link);

    const entry = {
      status: result.status,
      latency: result.latency,
      httpCode: result.httpCode,
      lastChecked: new Date().toISOString(),
      applicationCode: app.ApplicationCode,
      application: app.Application,
      campus: app.Campus || null
    };

    statusCache.set(app.Id, entry);
    return entry;
  } catch (err) {
    console.error(`[HEALTH] Force check failed for app ${appId}:`, err.message);
    return null;
  }
}
