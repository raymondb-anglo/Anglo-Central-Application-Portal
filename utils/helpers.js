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
