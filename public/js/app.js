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
