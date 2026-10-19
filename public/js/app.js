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

  // Expose portal theme toggle for command palette action
  window.portalToggleTheme = function() {
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  };

  // Attach click handler to all theme toggle buttons
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.portalToggleTheme();
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

  // ---- Announcement Banner (Feature Discovery) ----
  const bannerEl = document.getElementById('portalAnnouncementBanner');
  const bannerDismissBtn = document.getElementById('bannerDismissBtn');
  const bannerTryBtn = document.getElementById('bannerTrySwitcherBtn');
  const BANNER_STORAGE_KEY = 'portal_announcement_switcher_v1_dismissed';

  if (bannerEl) {
    const isDismissed = localStorage.getItem(BANNER_STORAGE_KEY) === 'true';
    if (!isDismissed) {
      bannerEl.style.display = 'block';
    }

    if (bannerDismissBtn) {
      bannerDismissBtn.addEventListener('click', () => {
        bannerEl.style.transition = 'all 0.3s ease';
        bannerEl.style.opacity = '0';
        bannerEl.style.maxHeight = '0';
        bannerEl.style.padding = '0';
        localStorage.setItem(BANNER_STORAGE_KEY, 'true');
        setTimeout(() => { bannerEl.style.display = 'none'; }, 300);
      });
    }

    if (bannerTryBtn) {
      bannerTryBtn.addEventListener('click', () => {
        if (typeof openQuickSwitcher === 'function') openQuickSwitcher();
      });
    }
  }

  // ---- Global Quick Switcher (Ctrl + K Command Palette) ----
  const switcherOverlay = document.getElementById('quickSwitcherOverlay');
  const switcherInput = document.getElementById('quickSwitcherInput');
  const switcherResults = document.getElementById('quickSwitcherResults');
  const switcherCounter = document.getElementById('quickSwitcherCounter');
  const switcherClearBtn = document.getElementById('quickSwitcherClearBtn');
  const switcherCloseBtn = document.getElementById('quickSwitcherCloseBtn');
  const switcherBackdrop = document.getElementById('quickSwitcherBackdrop');
  const switcherTabs = document.querySelectorAll('#quickSwitcherTabs .quick-tab');

  let switcherItems = null; // cached items from /api/quick-search
  let currentFilteredItems = [];
  let currentActiveIndex = 0;
  let currentCategory = 'all';

  async function loadSwitcherItems() {
    if (switcherItems) return switcherItems;
    try {
      const res = await fetch('/api/quick-search');
      if (res.ok) {
        const data = await res.json();
        switcherItems = data.items || [];
      } else {
        switcherItems = [];
      }
    } catch (e) {
      console.error('[QUICK SWITCHER] Failed to load items:', e);
      switcherItems = [];
    }
    return switcherItems;
  }

  function highlightMatches(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="quick-highlight">$1</mark>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function renderSwitcherResults(query = '') {
    if (!switcherResults) return;

    const trimmed = query.trim().toLowerCase();

    // Filter items
    const matched = (switcherItems || []).filter(item => {
      // Category filter
      if (currentCategory !== 'all' && item.category !== currentCategory) {
        return false;
      }
      if (!trimmed) return true;

      const titleMatch = item.title && item.title.toLowerCase().includes(trimmed);
      const subtitleMatch = item.subtitle && item.subtitle.toLowerCase().includes(trimmed);
      const campusMatch = item.campus && item.campus.toLowerCase().includes(trimmed);
      const codeMatch = item.code && item.code.toLowerCase().includes(trimmed);
      const keywordsMatch = item.keywords && item.keywords.toLowerCase().includes(trimmed);

      return titleMatch || subtitleMatch || campusMatch || codeMatch || keywordsMatch;
    });

    currentFilteredItems = matched;
    currentActiveIndex = 0;

    if (switcherCounter) {
      switcherCounter.textContent = `${matched.length} ${matched.length === 1 ? 'item' : 'items'}`;
    }

    if (matched.length === 0) {
      switcherResults.innerHTML = `
        <div class="quick-switcher-empty">
          <div class="quick-switcher-empty-icon"><i class="bi bi-search"></i></div>
          <div class="quick-switcher-empty-title">No matching items</div>
          <div class="quick-switcher-empty-desc">No applications, pages, or actions found for "${escapeHtml(query)}". Try another search term.</div>
        </div>
      `;
      return;
    }

    // Group items by category
    const groups = {};
    matched.forEach((item, index) => {
      const cat = item.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ item, globalIndex: index });
    });

    let html = '';
    for (const [catName, itemsWithIndex] of Object.entries(groups)) {
      html += `<div class="quick-group-header">${escapeHtml(catName)} (${itemsWithIndex.length})</div>`;
      itemsWithIndex.forEach(({ item, globalIndex }) => {
        const isActive = globalIndex === currentActiveIndex ? ' active' : '';
        const campusBadge = item.campus ? `<span class="quick-tag"><i class="bi bi-building me-1"></i>${escapeHtml(item.campus)}</span>` : '';
        const metaIcon = item.type === 'app' ? '<i class="bi bi-box-arrow-up-right"></i>' : (item.type === 'page' ? '<i class="bi bi-arrow-right"></i>' : '<i class="bi bi-lightning-charge"></i>');

        html += `
          <div class="quick-item${isActive}" data-index="${globalIndex}" data-category="${escapeHtml(item.category || '')}">
            <div class="quick-item-icon">
              <i class="bi bi-${escapeHtml(item.icon || 'app-indicator')}"></i>
            </div>
            <div class="quick-item-info">
              <div class="quick-item-title">
                <span>${highlightMatches(item.title, trimmed)}</span>
              </div>
              <div class="quick-item-subtitle">${highlightMatches(item.subtitle, trimmed)}</div>
            </div>
            <div class="quick-item-meta">
              ${campusBadge}
              <span class="quick-enter-indicator">${metaIcon}</span>
            </div>
          </div>
        `;
      });
    }

    switcherResults.innerHTML = html;

    // Attach click events to items
    switcherResults.querySelectorAll('.quick-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        executeItem(currentFilteredItems[idx]);
      });
      el.addEventListener('mouseenter', () => {
        const idx = parseInt(el.dataset.index, 10);
        setActiveItem(idx, false);
      });
    });
  }

  function setActiveItem(index, scrollIntoView = true) {
    if (currentFilteredItems.length === 0) return;
    currentActiveIndex = Math.max(0, Math.min(index, currentFilteredItems.length - 1));

    const itemEls = switcherResults.querySelectorAll('.quick-item');
    itemEls.forEach((el) => {
      const match = parseInt(el.dataset.index, 10) === currentActiveIndex;
      el.classList.toggle('active', match);
      if (match && scrollIntoView) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  function executeItem(item) {
    if (!item) return;

    closeQuickSwitcher();

    if (item.type === 'app') {
      window.open(item.url, '_blank');
    } else if (item.type === 'page') {
      window.location.href = item.url;
    } else if (item.type === 'action') {
      if (item.actionId === 'toggle-theme') {
        if (typeof window.portalToggleTheme === 'function') {
          window.portalToggleTheme();
        }
      } else if (item.actionId === 'sign-out') {
        window.location.href = item.url;
      }
    } else if (item.type === 'filter') {
      const campus = item.campus;
      const targetTab = document.querySelector(`.filter-tab[data-campus="${campus}"]`);
      if (targetTab) {
        targetTab.click();
        const appGrid = document.getElementById('app-grid');
        if (appGrid) appGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.href = `/?campus=${encodeURIComponent(campus)}`;
      }
    }
  }

  async function openQuickSwitcher() {
    if (!switcherOverlay) return;
    switcherOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (switcherInput) {
      switcherInput.value = '';
      switcherInput.focus();
    }
    if (switcherClearBtn) switcherClearBtn.style.display = 'none';

    // Reset tabs
    currentCategory = 'all';
    switcherTabs.forEach(t => t.classList.toggle('active', t.dataset.category === 'all'));

    if (!switcherItems) {
      const loadingEl = document.getElementById('quickSwitcherLoading');
      if (loadingEl) loadingEl.style.display = 'flex';
      await loadSwitcherItems();
    }

    renderSwitcherResults('');
  }

  function closeQuickSwitcher() {
    if (!switcherOverlay) return;
    switcherOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function toggleQuickSwitcher() {
    if (!switcherOverlay) return;
    if (switcherOverlay.style.display === 'none' || !switcherOverlay.style.display) {
      openQuickSwitcher();
    } else {
      closeQuickSwitcher();
    }
  }

  window.openQuickSwitcher = openQuickSwitcher;
  window.closeQuickSwitcher = closeQuickSwitcher;

  // Global Keyboard shortcuts: Ctrl + K, Cmd + K, or "/"
  window.addEventListener('keydown', (e) => {
    // Ctrl+K or Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggleQuickSwitcher();
      return;
    }

    // Single "/" key when not typing in an input/textarea/editable
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );
      if (!isInput && switcherOverlay && (switcherOverlay.style.display === 'none' || !switcherOverlay.style.display)) {
        e.preventDefault();
        openQuickSwitcher();
        return;
      }
    }

    // Inside opened switcher modal
    if (switcherOverlay && switcherOverlay.style.display !== 'none') {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickSwitcher();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentFilteredItems.length > 0) {
          setActiveItem((currentActiveIndex + 1) % currentFilteredItems.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentFilteredItems.length > 0) {
          setActiveItem((currentActiveIndex - 1 + currentFilteredItems.length) % currentFilteredItems.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentFilteredItems.length > 0 && currentFilteredItems[currentActiveIndex]) {
          executeItem(currentFilteredItems[currentActiveIndex]);
        }
      }
    }
  });

  // Attach search triggers across the app
  const navTrigger = document.getElementById('navQuickSwitcherBtn');
  if (navTrigger) navTrigger.addEventListener('click', openQuickSwitcher);

  const mobileTrigger = document.getElementById('mobileQuickSwitcherBtn');
  if (mobileTrigger) mobileTrigger.addEventListener('click', openQuickSwitcher);

  const dashboardTrigger = document.getElementById('dashboardSearchBtn');
  if (dashboardTrigger) dashboardTrigger.addEventListener('click', openQuickSwitcher);

  // Close & Clear buttons
  if (switcherCloseBtn) switcherCloseBtn.addEventListener('click', closeQuickSwitcher);
  if (switcherBackdrop) switcherBackdrop.addEventListener('click', closeQuickSwitcher);

  if (switcherClearBtn) {
    switcherClearBtn.addEventListener('click', () => {
      if (switcherInput) {
        switcherInput.value = '';
        switcherInput.focus();
        switcherClearBtn.style.display = 'none';
        renderSwitcherResults('');
      }
    });
  }

  if (switcherInput) {
    switcherInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (switcherClearBtn) {
        switcherClearBtn.style.display = val.length > 0 ? 'flex' : 'none';
      }
      renderSwitcherResults(val);
    });
  }

  // Category filter tabs inside modal
  switcherTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switcherTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.category || 'all';
      renderSwitcherResults(switcherInput ? switcherInput.value : '');
    });
  });

  // Pre-load items in background when idle
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => {
      if (switcherOverlay) loadSwitcherItems();
    });
  } else {
    setTimeout(() => {
      if (switcherOverlay) loadSwitcherItems();
    }, 2000);
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
