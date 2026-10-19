import { z } from 'zod';

/**
 * 1. Application Registry Validation Schema
 * Matches MSSQL ApplicationInformation column constraints.
 * Accepts camelCase or PascalCase field names from forms/APIs.
 */
export const applicationSchema = z.object({
  applicationCode: z
    .string({ required_error: 'Application code is required' })
    .trim()
    .min(2, 'Application code must be at least 2 characters')
    .max(50, 'Application code cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Application code can only contain letters, numbers, hyphens, and underscores'),
  application: z
    .string({ required_error: 'Application name is required' })
    .trim()
    .min(2, 'Application name must be at least 2 characters')
    .max(100, 'Application name cannot exceed 100 characters'),
  campus: z
    .string()
    .trim()
    .max(50, 'Campus name cannot exceed 50 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  link: z
    .string({ required_error: 'Application link URL is required' })
    .trim()
    .max(500, 'Application URL cannot exceed 500 characters')
    .refine(val => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Application link must be a valid HTTP or HTTPS URL (e.g. https://example.com)'),
  description: z
    .string()
    .trim()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  databaseType: z
    .string()
    .trim()
    .max(50, 'Database type cannot exceed 50 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  technology: z
    .string()
    .trim()
    .max(100, 'Technology cannot exceed 100 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  name: z
    .string()
    .trim()
    .max(50, 'Access scope cannot exceed 50 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  icon: z
    .string()
    .trim()
    .max(100, 'Icon name cannot exceed 100 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  displayOrder: z
    .coerce
    .number()
    .int('Display order must be an integer')
    .min(0, 'Display order cannot be negative')
    .default(0),
  status: z
    .enum(['Active', 'Inactive'], { errorMap: () => ({ message: 'Status must be Active or Inactive' }) })
    .default('Active')
});

/**
 * 2. User Management Validation Schema
 * Matches MSSQL Users column constraints.
 */
export const userSchema = z.object({
  email: z
    .string({ required_error: 'Email address is required' })
    .trim()
    .toLowerCase()
    .email('Must be a valid email address')
    .max(255, 'Email cannot exceed 255 characters'),
  firstName: z
    .string()
    .trim()
    .max(100, 'First name cannot exceed 100 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  lastName: z
    .string()
    .trim()
    .max(100, 'Last name cannot exceed 100 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  displayName: z
    .string()
    .trim()
    .max(255, 'Display name cannot exceed 255 characters')
    .optional()
    .nullable()
    .transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  isActive: z
    .preprocess(val => val === '1' || val === 'true' || val === true || val === 'on' ? 1 : 0, z.number())
    .default(1),
  password: z
    .string()
    .trim()
    .max(128, 'Password cannot exceed 128 characters')
    .optional()
    .nullable()
    .refine(val => !val || val.length >= 8, {
      message: 'Password must be at least 8 characters if provided'
    }),
  roles: z
    .preprocess(val => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return [val];
    }, z.array(z.string()))
    .default([])
});

/**
 * Normalizes an object's keys to camelCase for consistent validation.
 */
function normalizeKeysToCamel(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    normalized[camelKey] = value;
  }
  return normalized;
}

/**
 * Express Middleware: Validate Request Body
 * 
 * If validation fails:
 * - Traditional HTML form: re-renders the form view or redirects with friendly ?error=...
 * - JSON / API: returns 400 Bad Request with error details
 */
export function validateBody(schema, onErrorHandler = null) {
  return (req, res, next) => {
    // Normalize keys (supports both applicationCode and ApplicationCode)
    const normalizedBody = normalizeKeysToCamel(req.body);
    const result = schema.safeParse(normalizedBody);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const errorMessage = firstIssue ? firstIssue.message : 'Invalid form input.';

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({
          error: errorMessage,
          details: result.error.flatten().fieldErrors
        });
      }

      if (typeof onErrorHandler === 'function') {
        return onErrorHandler(req, res, errorMessage);
      }

      const redirectUrl = req.headers.referer || '/';
      const separator = redirectUrl.includes('?') ? '&' : '?';
      return res.redirect(`${redirectUrl}${separator}error=${encodeURIComponent(errorMessage)}`);
    }

    req.validatedBody = result.data;
    next();
  };
}
