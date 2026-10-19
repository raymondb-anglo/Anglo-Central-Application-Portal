import rateLimit from 'express-rate-limit';

/**
 * Authentication Rate Limiter
 * 
 * Protects login and password recovery forms against brute-force attacks.
 * - 10 failed attempts allowed per 15 minutes per IP.
 * - skipSuccessfulRequests: true ensures legitimate users who log in successfully
 *   are NEVER locked out or penalized.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true, // Return standard `RateLimit-*` headers
  legacyHeaders: false,
  handler: (req, res) => {
    const errorMsg = 'Too many failed attempts from this IP address. Please try again after 15 minutes.';
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(429).json({ error: errorMsg });
    }
    const tab = req.body?.email ? 'password' : 'google';
    res.status(429).redirect(`/auth/login?tab=${tab}&error=${encodeURIComponent(errorMsg)}`);
  }
});

/**
 * Export Operations Rate Limiter
 * 
 * Protects server CPU and memory from rapid Excel generation requests.
 * - Max 10 export requests per minute per IP.
 */
export const exportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many export requests in a short period. Please wait a minute before generating another export.'
    });
  }
});

/**
 * Public & Internal API Rate Limiter
 * 
 * Protects endpoints like /api/quick-search and /api/health-status from scraping and spam.
 * - Max 120 requests per minute per IP (generous for active users and live polling).
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'API rate limit exceeded. Please slow down your requests.'
    });
  }
});
