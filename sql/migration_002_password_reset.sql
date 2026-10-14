-- =====================================================
-- Anglo Central Application Portal — Schema Migration 002
-- Adds password reset token fields for forgot password flow
-- Run against existing AngloCentralPortal database
-- =====================================================

-- Add ResetTokenHash for password reset (stores SHA-256 hash, not raw token)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'ResetTokenHash')
  ALTER TABLE Users ADD ResetTokenHash NVARCHAR(255) NULL;

-- Add ResetTokenExpiresAt for token expiry (15-minute TTL)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'ResetTokenExpiresAt')
  ALTER TABLE Users ADD ResetTokenExpiresAt DATETIME NULL;

PRINT 'Migration 002 complete: Password reset columns added to Users table';
