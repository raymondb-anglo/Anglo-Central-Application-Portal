import 'dotenv/config';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import passport, { configurePassport } from './config/passport.js';
import { testConnection } from './db.js';
import { attachUserToLocals, loadUserRoles } from './middleware/auth.js';

// Routes
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import adminApplicationsRoutes from './routes/admin/applications.js';
import adminUsersRoutes from './routes/admin/users.js';
import adminRolesRoutes from './routes/admin/roles.js';
import adminAuditLogsRoutes from './routes/admin/auditLogs.js';
import ssoApiRoutes from './routes/api/sso.js';
import { isSSOConfigured } from './utils/sso.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust reverse proxy (IIS / Nginx) so HTTPS and secure cookies work properly
app.set('trust proxy', 1);

// ---- Security ----
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "*.cloudflareinsights.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "*.googleusercontent.com"],
      connectSrc: ["'self'", "cdn.jsdelivr.net", "*.cloudflareinsights.com"]
    }
  }
}));

// Suppress 404 for favicon request
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ---- Logging ----
app.use(morgan('short'));

// ---- Body parsing ----
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---- Session ----
app.use(session({
  secret: process.env.SESSION_SECRET || 'anglo-portal-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ---- Passport ----
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// ---- User context for all views ----
app.use(attachUserToLocals);
app.use(loadUserRoles);

// ---- View engine ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Routes ----
app.use('/auth', authRoutes);
app.use('/', dashboardRoutes);
app.use('/admin/applications', adminApplicationsRoutes);
app.use('/admin/users', adminUsersRoutes);
app.use('/admin/roles', adminRolesRoutes);
app.use('/admin/audit-logs', adminAuditLogsRoutes);
app.use('/api/sso', ssoApiRoutes);

// ---- Health check ----
app.get('/health', async (req, res) => {
  const dbOk = await testConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).render('error', {
    layout: 'layout',
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    user: req.user || null
  });
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(500).render('error', {
    layout: 'layout',
    title: 'Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
    user: req.user || null
  });
});

// ---- Start server ----
const port = parseInt(process.env.PORT || '3000', 10);

(async () => {
  // Attempt database connection (non-blocking)
  let dbConnected = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    dbConnected = await testConnection();
    if (dbConnected) break;
    console.log(`[DB] Connection attempt ${attempt}/3 failed. Retrying in ${attempt * 2}s...`);
    await new Promise(r => setTimeout(r, attempt * 2000));
  }

  if (!dbConnected) {
    console.warn('[DB] Database not available — starting server without database.');
    console.warn('[DB] Some features will not work until the database is configured.');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║   Anglo Central Application Portal            ║');
    console.log(`  ║   Running on http://localhost:${port}              ║`);
    console.log(`  ║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(30)}║`);
    console.log(`  ║   Database: ${(dbConnected ? 'Connected' : 'Not connected').padEnd(33)}║`);
    console.log(`  ║   SSO: ${(isSSOConfigured() ? 'Enabled (JWT)' : 'Not configured').padEnd(38)}║`);
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('');
  });
})();
