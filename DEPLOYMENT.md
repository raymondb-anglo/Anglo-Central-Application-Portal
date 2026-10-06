# Anglo Central Application Portal — Deployment Guide

## Prerequisites

- Node.js 18+ installed
- Microsoft SQL Server accessible
- PM2 installed globally: `npm install -g pm2`
- Git installed
- Google Cloud Console OAuth 2.0 credentials (Client ID & Secret)

## 1. Clone the Repository

```bash
git clone <your-repo-url> anglo-central-portal
cd anglo-central-portal
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Set to `production` for deployment |
| `DB_HOST` | MSSQL server host |
| `DB_PORT` | MSSQL port (default: 1433) |
| `DB_NAME` | Database name: `AngloCentralPortal` |
| `DB_USER` | Database username |
| `DB_PASSWORD` | Database password |
| `DB_ENCRYPT` | `true` for Azure, `false` for local |
| `SESSION_SECRET` | Random secret string (min 32 chars) |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `GOOGLE_CALLBACK_URL` | `https://apps.anglosingapore.ac.th/auth/google/callback` |

## 4. Set Up MSSQL Database

Create the database:

```sql
CREATE DATABASE AngloCentralPortal;
```

Run the schema:

```bash
sqlcmd -S <server> -U <user> -P <password> -d AngloCentralPortal -i sql/schema.sql
```

Seed initial applications:

```bash
sqlcmd -S <server> -U <user> -P <password> -d AngloCentralPortal -i sql/seed.sql
```

## 5. Test the Application

```bash
node server.js
```

Verify it starts on the configured port and connects to the database.

## 6. Start with PM2

```bash
pm2 start ecosystem.config.cjs
```

## 7. Enable PM2 Startup (Auto-start on Reboot)

```bash
pm2 startup
pm2 save
```

## 8. Deploy to IIS

1. Create a new IIS website pointing to the project directory
2. Ensure iisnode is installed
3. The `web.config` handles URL rewriting and iisnode configuration
4. Configure HTTPS via IIS SSL bindings
5. Set the site binding to `apps.anglosingapore.ac.th`

## 9. Common PM2 Commands

| Command | Description |
|---------|-------------|
| `pm2 status` | Check running processes |
| `pm2 logs anglo-portal` | View live logs |
| `pm2 restart anglo-portal` | Restart the app |
| `pm2 stop anglo-portal` | Stop the app |

## 10. Updating the Application

```bash
cd anglo-central-portal
git pull origin main
npm install
pm2 restart anglo-portal
```

## Architecture

- **Backend**: Node.js + Express.js (ESM modules)
- **Database**: MSSQL via mssql driver
- **View Engine**: EJS + express-ejs-layouts
- **Frontend**: Bootstrap 5, Vanilla JavaScript
- **Auth**: Google OAuth 2.0 via Passport.js
- **Session**: express-session
- **Security**: Helmet.js
- **Process Manager**: PM2
- **Web Server**: IIS + iisnode
