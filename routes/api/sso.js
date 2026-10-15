/**
 * SSO API Routes — Token Verification Endpoint
 *
 * External applications call this endpoint to verify SSO tokens
 * issued by the Anglo Central Portal.
 *
 * Endpoint:
 *   POST /api/sso/verify
 *   Body: { "token": "<JWT>" }
 *   Optional Body: { "token": "<JWT>", "app_code": "MaterialRequisition" }
 *
 * Response (200 — valid):
 *   {
 *     "valid": true,
 *     "user": {
 *       "email": "raymond.b@anglosingapore.ac.th",
 *       "name": "Raymond Bastasa",
 *       "given_name": "Raymond",
 *       "family_name": "Bastasa",
 *       "picture": "https://...",
 *       "app_code": "MaterialRequisition",
 *       "app_name": "Material Requisition"
 *     }
 *   }
 *
 * Response (401 — invalid/expired):
 *   { "valid": false, "error": "Token has expired." }
 */

import { Router } from 'express';
import { verifySSOToken, isSSOConfigured } from '../../utils/sso.js';

const router = Router();

/**
 * POST /api/sso/verify — Verify an SSO token
 */
router.post('/verify', (req, res) => {
  // Check SSO configuration
  if (!isSSOConfigured()) {
    return res.status(503).json({
      valid: false,
      error: 'SSO is not configured on this Portal. Set SSO_JWT_SECRET in the environment.'
    });
  }

  const { token, app_code } = req.body;

  if (!token) {
    return res.status(400).json({
      valid: false,
      error: 'Missing required field: token'
    });
  }

  const result = verifySSOToken(token, app_code || undefined);

  if (result.valid) {
    return res.json({
      valid: true,
      user: result.payload
    });
  }

  return res.status(401).json({
    valid: false,
    error: result.error
  });
});

/**
 * GET /api/sso/info — SSO configuration info (public, no auth required)
 *
 * External apps can call this to check if SSO is available and get
 * the issuer and algorithm info needed for local verification.
 */
router.get('/info', (req, res) => {
  res.json({
    sso_enabled: isSSOConfigured(),
    issuer: 'anglo-central-portal',
    algorithm: 'HS256',
    token_ttl_seconds: 300,
    verify_endpoint: '/api/sso/verify',
    documentation: 'Include sso_token query parameter from redirect URL in POST body as { "token": "<value>" }'
  });
});

export default router;
