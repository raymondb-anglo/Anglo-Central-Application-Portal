/**
 * User Favorites API Route
 * 
 * Provides endpoints for toggling and fetching user's pinned/favorite applications.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import db from '../../db.js';

const router = Router();

const toggleFavoriteSchema = z.object({
  applicationId: z.coerce.number().int().positive('Invalid application ID')
});

/**
 * GET /api/favorites
 * Returns array of application IDs favorited by current user.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.Id;
    const rows = await db.queryRows(
      'SELECT ApplicationId FROM UserFavorites WHERE UserId = @p0',
      [userId]
    );

    const favoriteIds = rows.map(r => r.ApplicationId);
    res.json({ success: true, favorites: favoriteIds });
  } catch (err) {
    console.error('[FAVORITES API] Error loading favorites:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load favorite applications.' });
  }
});

/**
 * POST /api/favorites/toggle
 * Toggles a user's favorite status for an application.
 */
router.post('/toggle', requireAuth, async (req, res) => {
  try {
    const validation = toggleFavoriteSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0]?.message || 'Invalid request'
      });
    }

    const userId = req.user.Id;
    const applicationId = validation.data.applicationId;

    // Check if currently favorited
    const existing = await db.queryRows(
      'SELECT UserId FROM UserFavorites WHERE UserId = @p0 AND ApplicationId = @p1',
      [userId, applicationId]
    );

    let isFavorite = false;
    if (existing.length > 0) {
      await db.query(
        'DELETE FROM UserFavorites WHERE UserId = @p0 AND ApplicationId = @p1',
        [userId, applicationId]
      );
      isFavorite = false;
    } else {
      await db.query(
        'INSERT INTO UserFavorites (UserId, ApplicationId, CreatedAt) VALUES (@p0, @p1, GETDATE())',
        [userId, applicationId]
      );
      isFavorite = true;
    }

    res.json({
      success: true,
      applicationId,
      isFavorite,
      message: isFavorite ? 'Added to favorites' : 'Removed from favorites'
    });
  } catch (err) {
    console.error('[FAVORITES API] Error toggling favorite:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update favorite status.' });
  }
});

export default router;
