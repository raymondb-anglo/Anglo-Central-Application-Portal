/**
 * Quick Search API Route
 * 
 * Provides JSON search data for the Global Quick Switcher (Ctrl + K Command Palette).
 * Returns:
 *  - Applications accessible to the user (with direct SSO launch links)
 *  - Portal navigation pages (Dashboard, and Admin tools if user has Admin rights)
 *  - Quick system actions (Theme toggle, Campus filters, Sign out)
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getUserApplications } from '../../utils/appAccess.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const userRoles = req.userRoles || [];
    const isPortalAdmin = userRoles.includes('PortalAdmin');
    const isITAdmin = userRoles.includes('ITAdmin');
    const canAccessAdmin = isPortalAdmin || isITAdmin;

    // 1. Applications accessible to this specific user
    const applications = await getUserApplications(user, userRoles);

    // 2. Build items array for command palette
    const items = [];

    // Applications
    applications.forEach(app => {
      items.push({
        type: 'app',
        id: app.Id,
        title: app.Application,
        subtitle: (app.Campus ? `${app.Campus} • ` : '') + (app.Description || app.ApplicationCode),
        campus: app.Campus || null,
        code: app.ApplicationCode,
        icon: app.Icon || 'app-indicator',
        url: `/launch/${app.Id}`,
        target: '_blank',
        category: 'Applications',
        keywords: [app.Application, app.ApplicationCode, app.Campus, app.Description, app.Technology, app.DatabaseType].filter(Boolean).join(' ')
      });
    });

    // Navigation Pages
    items.push({
      type: 'page',
      title: 'Dashboard',
      subtitle: 'Portal home and application grid',
      icon: 'house-door',
      url: '/',
      category: 'Navigation',
      keywords: 'home dashboard apps portal main'
    });

    if (canAccessAdmin) {
      items.push({
        type: 'page',
        title: 'Application Registry',
        subtitle: 'Manage applications, links, database types, and icons',
        icon: 'app-indicator',
        url: '/admin/applications',
        category: 'Admin Tools',
        keywords: 'admin applications registry links crud new edit manage'
      });
      items.push({
        type: 'page',
        title: 'User Management',
        subtitle: 'Manage user accounts, roles, and per-user access',
        icon: 'people',
        url: '/admin/users',
        category: 'Admin Tools',
        keywords: 'admin users accounts members permissions roles user management'
      });
      items.push({
        type: 'page',
        title: 'Role Management',
        subtitle: 'Configure role-based application access rules',
        icon: 'shield-lock',
        url: '/admin/roles',
        category: 'Admin Tools',
        keywords: 'admin roles permissions rbac access security'
      });
      items.push({
        type: 'page',
        title: 'Audit Logs',
        subtitle: 'Security audit trail, activity filters, and Excel exports',
        icon: 'journal-text',
        url: '/admin/audit-logs',
        category: 'Admin Tools',
        keywords: 'admin audit logs activity compliance export excel security'
      });
    }

    // Quick Actions
    items.push({
      type: 'action',
      actionId: 'toggle-theme',
      title: 'Toggle Theme',
      subtitle: 'Switch between Dark Mode and Light Mode',
      icon: 'circle-half',
      category: 'Quick Actions',
      keywords: 'theme dark mode light mode switch appearance color'
    });

    // Unique Campus filter actions
    const campuses = [...new Set(
      applications.map(a => a.Campus).filter(Boolean)
    )].sort();

    campuses.forEach(campus => {
      items.push({
        type: 'filter',
        actionId: `filter-campus:${campus}`,
        title: `Filter Campus: ${campus}`,
        subtitle: `Filter dashboard to only show ${campus} apps`,
        campus: campus,
        icon: 'building',
        category: 'Campus Filters',
        keywords: `filter campus ${campus} apps`
      });
    });

    if (campuses.length > 0) {
      items.push({
        type: 'filter',
        actionId: 'filter-campus:all',
        title: 'Show All Campuses',
        subtitle: 'Reset dashboard filter to display all campus applications',
        campus: 'all',
        icon: 'grid-fill',
        category: 'Campus Filters',
        keywords: 'filter all reset campuses show all apps'
      });
    }

    items.push({
      type: 'action',
      actionId: 'sign-out',
      title: 'Sign Out',
      subtitle: `Sign out of ${user.Email || 'portal'}`,
      icon: 'box-arrow-right',
      url: '/auth/logout',
      category: 'Account',
      keywords: 'sign out logout disconnect exit leave'
    });

    res.json({
      items,
      count: items.length
    });
  } catch (err) {
    console.error('[QUICK SEARCH API] Error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve quick search data.' });
  }
});

export default router;
