# SSO Integration Guide — External Applications

> **For developers** of external applications (Material Requisition, CCA, PTM, etc.)
> that need to accept SSO tokens from the Anglo Central Application Portal.

## Overview

When a user launches an application from the Portal, the Portal automatically
generates a signed **JWT (JSON Web Token)** and appends it to the redirect URL:

```
https://your-app.anglosingapore.ac.th/?sso_token=eyJhbGciOiJIUzI1NiIs...
```

Your application reads this token, verifies it, and creates a local session
for the user — **without requiring them to log in again**.

---

## Step 1 — Read the Token from the URL

When your application receives a request with `?sso_token=...`, extract it:

### ASP.NET Core (C#)
```csharp
// In your landing page or middleware
string ssoToken = Request.Query["sso_token"];
if (!string.IsNullOrEmpty(ssoToken))
{
    // Proceed to verify the token (Step 2)
}
```

### Node.js / Express
```javascript
app.get('/', (req, res) => {
  const ssoToken = req.query.sso_token;
  if (ssoToken) {
    // Proceed to verify the token (Step 2)
  }
});
```

---

## Step 2 — Verify the Token

### Option A: Remote Verification (Recommended)

Call the Portal's verification API. This is the simplest approach —
your app does not need the JWT secret.

```
POST https://apps.anglosingapore.ac.th/api/sso/verify
Content-Type: application/json

{
  "token": "<JWT from URL>",
  "app_code": "MaterialRequisition"
}
```

**Success Response (200):**
```json
{
  "valid": true,
  "user": {
    "email": "raymond.b@anglosingapore.ac.th",
    "name": "Raymond Bastasa",
    "given_name": "Raymond",
    "family_name": "Bastasa",
    "picture": "https://lh3.googleusercontent.com/...",
    "app_code": "MaterialRequisition",
    "app_name": "Material Requisition",
    "issued_at": "2026-10-15T08:00:00.000Z",
    "expires_at": "2026-10-15T08:05:00.000Z"
  }
}
```

**Failure Response (401):**
```json
{
  "valid": false,
  "error": "Token has expired. Please re-launch the application from the Portal."
}
```

#### ASP.NET Core Example (Remote Verification)
```csharp
using System.Net.Http;
using System.Text.Json;

public async Task<SSOUser?> VerifySSOToken(string token)
{
    using var client = new HttpClient();
    var payload = new { token, app_code = "MaterialRequisition" };
    var content = new StringContent(
        JsonSerializer.Serialize(payload),
        System.Text.Encoding.UTF8,
        "application/json"
    );

    var response = await client.PostAsync(
        "https://apps.anglosingapore.ac.th/api/sso/verify",
        content
    );

    var json = await response.Content.ReadAsStringAsync();
    var result = JsonSerializer.Deserialize<SSOVerifyResponse>(json);

    if (result?.valid == true)
    {
        return result.user;
    }

    return null;
}

// Models
public class SSOUser
{
    public string email { get; set; }
    public string name { get; set; }
    public string given_name { get; set; }
    public string family_name { get; set; }
    public string picture { get; set; }
}

public class SSOVerifyResponse
{
    public bool valid { get; set; }
    public SSOUser? user { get; set; }
    public string? error { get; set; }
}
```

#### Node.js Example (Remote Verification)
```javascript
async function verifySSOToken(token) {
  const response = await fetch('https://apps.anglosingapore.ac.th/api/sso/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, app_code: 'MaterialRequisition' })
  });
  return await response.json();
}
```

---

### Option B: Local Verification

If you have the shared `SSO_JWT_SECRET`, you can verify the token locally
without making a network call to the Portal.

| Setting | Value |
|---------|-------|
| Algorithm | `HS256` |
| Issuer | `anglo-central-portal` |
| Secret | Same `SSO_JWT_SECRET` from the Portal's `.env` |

#### ASP.NET Core Example (Local Verification)
```csharp
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Text;

public ClaimsPrincipal? ValidateSSOToken(string token, string ssoSecret)
{
    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ssoSecret));
    var handler = new JwtSecurityTokenHandler();

    try
    {
        var principal = handler.ValidateToken(token, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "anglo-central-portal",
            ValidateAudience = true,
            ValidAudience = "MaterialRequisition",
            ValidateLifetime = true,
            IssuerSigningKey = key,
            ClockSkew = TimeSpan.FromSeconds(30)
        }, out _);

        return principal;
    }
    catch (SecurityTokenException)
    {
        return null;
    }
}
```

#### Node.js Example (Local Verification)
```javascript
import jwt from 'jsonwebtoken';

function verifySSOToken(token, ssoSecret) {
  try {
    return jwt.verify(token, ssoSecret, {
      issuer: 'anglo-central-portal',
      audience: 'MaterialRequisition',
      algorithms: ['HS256']
    });
  } catch (err) {
    console.error('SSO token invalid:', err.message);
    return null;
  }
}
```

---

## Step 3 — Create a Local Session

Once the token is verified, create a session in your application for the user:

### ASP.NET Core Example
```csharp
// In your login controller or middleware
var ssoUser = await VerifySSOToken(ssoToken);
if (ssoUser != null)
{
    // Find or create the user in your local database
    var localUser = await _userService.FindOrCreateByEmail(ssoUser.email, ssoUser.name);

    // Sign them in using ASP.NET Identity
    await _signInManager.SignInAsync(localUser, isPersistent: false);

    return RedirectToAction("Index", "Home");
}
```

### Node.js Example
```javascript
app.get('/', async (req, res) => {
  const ssoToken = req.query.sso_token;

  if (ssoToken) {
    const result = await verifySSOToken(ssoToken);
    if (result.valid) {
      // Create session
      req.session.user = result.user;
      return res.redirect('/dashboard');
    }
  }

  // Fall back to normal login
  res.render('login');
});
```

---

## Security Notes

| Concern | How It's Handled |
|---------|-----------------|
| Token expiry | Tokens expire after **5 minutes** — prevents replay attacks |
| Signature | HMAC-SHA256 signed with 128-character hex secret |
| Audience check | Token contains `aud` claim matching the app code |
| One-time use | Best practice: mark tokens as consumed after first verification |
| HTTPS only | All Portal URLs use HTTPS in production |

---

## SSO Info Endpoint

Check the Portal's SSO status at any time:

```
GET https://apps.anglosingapore.ac.th/api/sso/info
```

Response:
```json
{
  "sso_enabled": true,
  "issuer": "anglo-central-portal",
  "algorithm": "HS256",
  "token_ttl_seconds": 300,
  "verify_endpoint": "/api/sso/verify"
}
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Token has expired` | User waited > 5 min before clicking | Re-launch from Portal |
| `Invalid token signature` | Wrong `SSO_JWT_SECRET` | Ensure Portal and app share the same secret |
| `SSO is not configured` | `SSO_JWT_SECRET` missing from Portal `.env` | Set the secret and restart the Portal |
| Token not in URL | SSO not set up on Portal side | Ensure Portal is running latest version |

---

## Contact

For SSO integration support, contact Anglo Singapore IT:
- **Email**: it@anglosingapore.ac.th
- **Portal Admin**: raymond.b@anglosingapore.ac.th
