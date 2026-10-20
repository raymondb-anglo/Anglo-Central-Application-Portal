/**
 * Shared helper utilities.
 */

/**
 * Format a date for display.
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a date with time for display.
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Truncate a string to a maximum length.
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(str, maxLength = 100) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Get client timezone from request query parameter, header, cookie, or fallback to server default.
 * @param {import('express').Request} req
 * @returns {string} IANA timezone identifier (e.g. 'Asia/Bangkok')
 */
export function getClientTimeZone(req) {
  if (req?.query?.tz) return req.query.tz;
  if (req?.headers?.['x-timezone']) return req.headers['x-timezone'];
  if (req?.headers?.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)app_tz=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Bangkok';
}

/**
 * Format a Date object into local date and military time (24-hour format: DD/MM/YYYY, HH:mm:ss)
 * using the client's timezone (or server default).
 * E.g. "20/10/2026, 08:03:51" (morning) or "20/10/2026, 13:03:51" (afternoon).
 *
 * @param {Date|string|number} [date=new Date()]
 * @param {string} [timeZone] - Optional IANA timezone string (e.g. 'Asia/Bangkok')
 * @returns {string} Formatted date and 24-hour military time string
 */
export function formatExportDateTime(date = new Date(), timeZone) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const tz = timeZone || process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Bangkok';

  try {
    return d.toLocaleString('en-GB', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return d.toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

/**
 * Format a Date object into YYYY-MM-DD for export filenames using target timezone.
 * @param {Date|string|number} [date=new Date()]
 * @param {string} [timeZone]
 * @returns {string} e.g. "2026-10-20"
 */
export function formatLocalDate(date = new Date(), timeZone) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const tz = timeZone || process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Bangkok';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  }
}

/**
 * Escape HTML to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


