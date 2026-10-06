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
});
