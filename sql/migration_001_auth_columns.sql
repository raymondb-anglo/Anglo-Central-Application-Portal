-- =====================================================
-- Anglo Central Application Portal — Schema Migration
-- Adds authentication columns for password & OTP login
-- Run against existing AngloCentralPortal database
-- =====================================================

-- Add PasswordHash for username/password login
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'PasswordHash')
  ALTER TABLE Users ADD PasswordHash NVARCHAR(255) NULL;

-- Add OTP fields for email verification login
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'OTPCode')
  ALTER TABLE Users ADD OTPCode NVARCHAR(10) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'OTPExpiresAt')
  ALTER TABLE Users ADD OTPExpiresAt DATETIME NULL;

-- Add ProfilePicture for Google avatar
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'ProfilePicture')
  ALTER TABLE Users ADD ProfilePicture NVARCHAR(500) NULL;

PRINT 'Migration complete: Auth columns added to Users table';
