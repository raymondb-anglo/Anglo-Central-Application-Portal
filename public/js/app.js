/**
 * Anglo Central Application Portal — Frontend JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  // ---- Live clock on dashboard ----
  const clockEl = document.getElementById('current-time');
  if (clockEl) {
    function updateClock() {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ---- Campus filter tabs ----
  const filterTabs = document.querySelectorAll('.filter-tab');
  const appCards = document.querySelectorAll('.app-card[data-campus]');
  const visibleCount = document.getElementById('visible-count');

  function updateVisibleCount() {
    if (!visibleCount) return;
    let count = 0;
    appCards.forEach(card => {
      if (card.style.display !== 'none') count++;
    });
    visibleCount.textContent = count;
  }

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const campus = tab.dataset.campus;

      // Filter cards with animation
      appCards.forEach((card, index) => {
        const cardCampus = card.dataset.campus;
        const match = campus === 'all' || cardCampus === campus;

        if (match) {
          card.style.display = '';
          card.style.opacity = '0';
          card.style.transform = 'translateY(12px)';
          setTimeout(() => {
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, index * 30);
        } else {
          card.style.display = 'none';
        }
      });

      updateVisibleCount();
    });
  });

  // ---- Fade-in animation for app cards on load ----
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  appCards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = `opacity 0.4s ease ${index * 0.04}s, transform 0.4s ease ${index * 0.04}s`;
    observer.observe(card);
  });

  // ---- Auto-dismiss alerts after 8 seconds ----
  document.querySelectorAll('.alert').forEach(alert => {
    // Don't auto-dismiss warnings about configuration
    if (alert.classList.contains('alert-warning')) return;

    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-10px)';
      setTimeout(() => alert.remove(), 500);
    }, 8000);
  });
  // ---- Auth tab switching (login page) ----
  const authTabs = document.querySelectorAll('.auth-tab');
  if (authTabs.length > 0) {
    authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.target);
        if (target) target.classList.add('active');
      });
    });
  }

  // ---- Password Visibility Toggle (all password fields) ----
  // Works on login, reset-password, and any future page that uses
  // <button class="password-toggle-btn" data-target="<input-id>">
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.getAttribute('data-target');
      const input = document.getElementById(inputId);
      if (!input) return;

      const isHidden = input.type === 'password';

      // Toggle input type
      input.type = isHidden ? 'text' : 'password';

      // Toggle icon: eye-slash (hidden) ↔ eye (visible)
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('bi-eye-slash', !isHidden);
        icon.classList.toggle('bi-eye', isHidden);
      }

      // Toggle revealed styling
      btn.classList.toggle('is-revealed', isHidden);

      // Update accessible label
      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

      // Keep focus on the input for uninterrupted typing
      input.focus();
    });
  });

  // ---- Rows Per Page Selector (admin tables) ----
  // When the user changes the "Rows per page" dropdown, navigate to
  // page 1 with the new limit. Resets to page 1 per Material Design
  // best practice (avoids broken offsets when limit changes).
  // Also preserves any active filter parameters (data-filter-qs).
  document.querySelectorAll('.pagination-rpp-select').forEach(select => {
    select.addEventListener('change', () => {
      const baseUrl = select.getAttribute('data-base-url');
      const limit = select.value;
      const filterQS = select.getAttribute('data-filter-qs') || '';
      window.location.href = `${baseUrl}?page=1&limit=${limit}${filterQS}`;
    });
  });

  // ---- Excel Export Buttons with Visual Feedback & Error Handling ----
  document.querySelectorAll('.btn-export-excel').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (btn.classList.contains('exporting')) return;

      const originalHtml = btn.innerHTML;
      btn.classList.add('exporting');
      btn.style.pointerEvents = 'none';
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span><span>Generating Excel...</span>';

      try {
        let exportUrl = btn.getAttribute('href');
        // If on audit logs page, dynamically capture active form filters
        const filterForm = document.getElementById('auditFilterForm');
        if (filterForm && btn.getAttribute('data-export-type') === 'audit-logs') {
          const formData = new FormData(filterForm);
          const params = new URLSearchParams();
          for (const [key, val] of formData.entries()) {
            if (val && key !== 'limit') {
              params.append(key, val);
            }
          }
          const qs = params.toString();
          exportUrl = '/admin/audit-logs/export' + (qs ? '?' + qs : '');
        }

        const res = await fetch(exportUrl, {
          headers: { 'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json' }
        });

        if (!res.ok) {
          let errText = `Server returned status ${res.status}`;
          try {
            const errJson = await res.json();
            if (errJson && errJson.error) errText = errJson.error;
          } catch {
            const text = await res.text();
            if (text) errText = text;
          }
          throw new Error(errText);
        }

        // Extract filename from Content-Disposition if present
        let filename = 'export.xlsx';
        const disposition = res.headers.get('content-disposition');
        if (disposition && disposition.includes('filename=')) {
          const match = disposition.match(/filename="?([^";]+)"?/i);
          if (match && match[1]) filename = match[1];
        }

        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 2000);

        // Success state on button
        btn.innerHTML = '<i class="bi bi-check-circle-fill text-success me-1"></i><span class="text-success">Downloaded!</span>';
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.classList.remove('exporting');
          btn.style.pointerEvents = '';
        }, 2500);

      } catch (err) {
        console.error('[EXPORT] Failed to download Excel:', err);
        btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i><span class="text-danger">Failed</span>';
        alert('Failed to export Excel: ' + err.message);
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.classList.remove('exporting');
          btn.style.pointerEvents = '';
        }, 3000);
      }
    });
  });

  // ---- Theme Toggle (Dark & Light Mode — Anglobot Reference) ----
  function getTheme() {
    return localStorage.getItem('portal_theme') || 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('portal_theme', theme);

    // Update all theme toggle buttons on the page
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      const textEl = btn.querySelector('.theme-toggle-text');
      const sunIcon = btn.querySelector('.theme-icon-sun');
      const moonIcon = btn.querySelector('.theme-icon-moon');

      if (theme === 'dark') {
        if (textEl) textEl.textContent = 'Light Mode';
        if (sunIcon) sunIcon.style.display = 'inline-block';
        if (moonIcon) moonIcon.style.display = 'none';
        btn.setAttribute('title', 'Switch to Light Mode');
      } else {
        if (textEl) textEl.textContent = 'Dark Mode';
        if (sunIcon) sunIcon.style.display = 'none';
        if (moonIcon) moonIcon.style.display = 'inline-block';
        btn.setAttribute('title', 'Switch to Dark Mode');
      }
    });
  }

  // Initialize button state immediately
  applyTheme(getTheme());

  // Attach click handler to all theme toggle buttons
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = getTheme();
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  });

  // ---- Universal In-App Confirmation Modal ----
  const modalEl = document.getElementById('portalConfirmModal');
  const modalTitle = document.getElementById('portalConfirmModalTitle');
  const modalMessage = document.getElementById('portalConfirmModalMessage');
  const modalIcon = document.getElementById('portalConfirmModalIcon');
  const modalBtn = document.getElementById('portalConfirmModalBtn');
  let targetForm = null;

  let confirmModalInstance = null;
  if (modalEl && typeof bootstrap !== 'undefined') {
    confirmModalInstance = new bootstrap.Modal(modalEl);
  }

  document.addEventListener('submit', (e) => {
    const form = e.target.closest ? e.target.closest('form') : e.target;
    if (!form || !form.hasAttribute('data-confirm')) return;

    if (form.dataset.confirmed === 'true') {
      form.removeAttribute('data-confirmed');
      return; // allow normal submission
    }

    e.preventDefault();
    targetForm = form;

    const title = form.getAttribute('data-confirm-title') || 'Confirm Action';
    const message = form.getAttribute('data-confirm') || 'Are you sure you want to proceed?';
    const btnText = form.getAttribute('data-confirm-btn') || 'Confirm';
    const type = form.getAttribute('data-confirm-type') || 'primary';

    if (confirmModalInstance) {
      if (modalTitle) modalTitle.textContent = title;
      if (modalMessage) modalMessage.textContent = message;
      if (modalIcon) {
        if (type === 'danger') {
          modalIcon.className = 'bi bi-trash3-fill text-danger me-2';
        } else if (type === 'warning') {
          modalIcon.className = 'bi bi-exclamation-triangle-fill text-warning me-2';
        } else {
          modalIcon.className = 'bi bi-question-circle-fill text-primary me-2';
        }
      }
      if (modalBtn) {
        modalBtn.textContent = btnText;
        if (type === 'danger') {
          modalBtn.className = 'btn btn-danger';
        } else if (type === 'warning') {
          modalBtn.className = 'btn btn-warning text-dark fw-semibold';
        } else {
          modalBtn.className = 'btn btn-primary-portal';
        }
      }
      confirmModalInstance.show();
    } else {
      // Fallback
      if (window.confirm(message)) {
        form.dataset.confirmed = 'true';
        form.submit();
      }
    }
  });

  if (modalBtn) {
    modalBtn.addEventListener('click', () => {
      if (targetForm) {
        targetForm.dataset.confirmed = 'true';
        if (confirmModalInstance) confirmModalInstance.hide();
        targetForm.submit();
      }
    });
  }
});

// ---- Health Status Polling (Dashboard) ----
// Self-contained module: polls /api/health-status every 60s and updates
// the status badges on each app card + the summary bar.
(function initHealthStatus() {
  'use strict';

  // Only run on the dashboard page (where app cards exist)
  const appGrid = document.getElementById('app-grid');
  if (!appGrid) return;

  const POLL_INTERVAL = 60_000; // 60 seconds

  /**
   * Build a human-readable tooltip from health data.
   */
  function buildTooltip(info) {
    const parts = [];

    if (info.status === 'online') parts.push('✅ Online');
    else if (info.status === 'degraded') parts.push('⚠️ Slow / Degraded');
    else if (info.status === 'offline') parts.push('❌ Offline');
    else parts.push('⏳ Checking...');

    if (info.latency !== null && info.latency !== undefined) {
      parts.push(`Latency: ${info.latency}ms`);
    }
    if (info.httpCode) {
      parts.push(`HTTP ${info.httpCode}`);
    }
    if (info.lastChecked) {
      const checked = new Date(info.lastChecked);
      parts.push(`Checked: ${checked.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    }

    return parts.join('\n');
  }

  /**
   * Map status to label text.
   */
  function statusLabel(status) {
    switch (status) {
      case 'online': return 'Online';
      case 'degraded': return 'Slow';
      case 'offline': return 'Offline';
      default: return '—';
    }
  }

  /**
   * Update all health badges on the dashboard.
   */
  function updateBadges(statuses) {
    for (const [appId, info] of Object.entries(statuses)) {
      const badge = document.querySelector(`[data-health-id="${appId}"]`);
      if (!badge) continue;

      // Update badge class
      badge.className = `health-badge health-${info.status}`;
      badge.title = buildTooltip(info);

      // Update label text
      const label = badge.querySelector('.health-label');
      if (label) label.textContent = statusLabel(info.status);
    }
  }

  /**
   * Update the summary bar above the grid.
   */
  function updateSummary(summary) {
    const summaryEl = document.getElementById('health-summary');
    if (!summaryEl) return;

    // Show the summary bar once we have data
    if (summary.total > 0) {
      summaryEl.style.display = '';
    }

    const onlineEl = document.getElementById('health-online-count');
    const degradedEl = document.getElementById('health-degraded-count');
    const offlineEl = document.getElementById('health-offline-count');
    const lastCheckedEl = document.getElementById('health-last-checked');

    if (onlineEl) onlineEl.textContent = summary.online || 0;
    if (degradedEl) degradedEl.textContent = summary.degraded || 0;
    if (offlineEl) offlineEl.textContent = summary.offline || 0;

    if (lastCheckedEl) {
      lastCheckedEl.textContent = `Last checked: ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  /**
   * Fetch health statuses from the API and update the UI.
   */
  async function fetchHealthStatus() {
    try {
      const res = await fetch('/api/health-status');
      if (!res.ok) return;
      const data = await res.json();

      if (data.statuses) updateBadges(data.statuses);
      if (data.summary) updateSummary(data.summary);
    } catch {
      // Silent fail — badges stay as-is, user is not disrupted
    }
  }

  // Initial fetch (short delay for page to settle)
  setTimeout(fetchHealthStatus, 1500);

  // Recurring poll
  setInterval(fetchHealthStatus, POLL_INTERVAL);
})();
