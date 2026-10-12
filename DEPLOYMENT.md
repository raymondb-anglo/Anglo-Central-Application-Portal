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

## 6. Create Logs Directory

PM2 writes stdout and stderr logs to `./logs`:

```bash
mkdir -p logs
```

## 7. Start with PM2

Start via PM2 ecosystem configuration:

```bash
pm2 start ecosystem.config.cjs
```

Or via npm script:

```bash
npm run pm2:start
```

## 8. Enable PM2 Startup (Auto-start on Reboot)

```bash
pm2 startup
pm2 save
```

## 9. Common PM2 Commands

| Command | Description |
|---------|-------------|
| `pm2 status` / `pm2 list` | Check running processes |
| `pm2 logs anglo-portal` | View live logs |
| `pm2 logs anglo-portal --lines 50` | View last 50 log lines |
| `pm2 restart anglo-portal` | Restart the app |
| `pm2 stop anglo-portal` | Stop the app |
| `pm2 delete anglo-portal` | Remove from PM2 |
| `pm2 monit` | Real-time terminal monitoring |

## 10. Log Files

PM2 logs are stored in:

- Output: `./logs/pm2-out.log`
- Errors: `./logs/pm2-error.log`

## 11. IIS Reverse Proxy Setup (ARR + URL Rewrite)

On your Windows IIS Server (`apps.anglosingapore.ac.th`):

1. **Prerequisites in IIS**:
   - Install **Application Request Routing (ARR)** and **URL Rewrite** module.
   - Enable Proxy in ARR (*Application Request Routing* -> *Server Proxy Settings* -> check *Enable proxy*).
2. **Allowed Server Variables**:
   - In IIS Manager, select your site -> double-click **URL Rewrite**.
   - Under Actions (right panel), click **View Server Variables...**
   - Add:
     - `HTTP_X_FORWARDED_PROTO`
     - `HTTP_X_FORWARDED_HOST`
3. **`web.config`**:
   Place the following `web.config` inside the IIS website root directory:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyToAngloPortal" stopProcessing="true">
          <match url="^(.*)$" />
          <action type="Rewrite" url="http://172.16.10.20:3000/{R:1}" appendQueryString="true" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
            <set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
    <directoryBrowse enabled="false" />
  </system.webServer>
</configuration>
```

4. **SSL Bindings**:
   - Bind port 443 with your wildcard SSL Certificate (`*.anglosingapore.ac.th`).
   - Host name: `apps.anglosingapore.ac.th`.

## 12. Updating the Application

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
- **Security**: Helmet.js + trust proxy
- **Process Manager**: PM2 (Linux server: `172.16.10.20`)
- **Web Server / Gateway**: IIS (Reverse Proxy with ARR + SSL)
