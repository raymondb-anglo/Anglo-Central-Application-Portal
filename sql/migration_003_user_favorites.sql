-- =====================================================
-- Anglo Central Application Portal — Schema Migration
-- Migration 003: User Favorites / Pinned Applications
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserFavorites')
BEGIN
    CREATE TABLE UserFavorites (
        UserId INT NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
        ApplicationId INT NOT NULL REFERENCES ApplicationInformation(Id) ON DELETE CASCADE,
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        PRIMARY KEY (UserId, ApplicationId)
    );

    CREATE INDEX IX_UserFavorites_UserId ON UserFavorites(UserId);
    CREATE INDEX IX_UserFavorites_AppId ON UserFavorites(ApplicationId);
    PRINT 'Created UserFavorites table successfully.';
END
ELSE
BEGIN
    PRINT 'UserFavorites table already exists.';
END
