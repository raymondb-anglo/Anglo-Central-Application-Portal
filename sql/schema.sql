-- =====================================================
-- Anglo Central Application Portal — Database Schema
-- Database: MSSQL (Microsoft SQL Server)
-- =====================================================

-- =====================================================
-- 1. Users (Google-authenticated identities)
-- =====================================================
CREATE TABLE Users (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    GoogleSubjectId NVARCHAR(255) UNIQUE NOT NULL,
    Email           NVARCHAR(255) NOT NULL,
    DisplayName     NVARCHAR(255),
    FirstName       NVARCHAR(100),
    LastName        NVARCHAR(100),
    ProfilePicture  NVARCHAR(500),
    IsActive        BIT DEFAULT 1,
    CreatedAt       DATETIME2 DEFAULT GETDATE(),
    LastLoginAt     DATETIME2
);

CREATE INDEX IX_Users_Email ON Users(Email);
CREATE INDEX IX_Users_GoogleSubjectId ON Users(GoogleSubjectId);

-- =====================================================
-- 2. Roles
-- =====================================================
CREATE TABLE Roles (
    Id          INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(50) UNIQUE NOT NULL,
    Description NVARCHAR(255)
);

-- Default roles
INSERT INTO Roles (Name, Description) VALUES ('PortalAdmin', 'Full portal administration access');
INSERT INTO Roles (Name, Description) VALUES ('ApplicationAdmin', 'Application-level administration');
INSERT INTO Roles (Name, Description) VALUES ('ITAdmin', 'IT infrastructure administration');
INSERT INTO Roles (Name, Description) VALUES ('Staff', 'School staff member');
INSERT INTO Roles (Name, Description) VALUES ('Teacher', 'Teacher');
INSERT INTO Roles (Name, Description) VALUES ('Student', 'Student');

-- =====================================================
-- 3. UserRoles
-- =====================================================
CREATE TABLE UserRoles (
    UserId  INT NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
    RoleId  INT NOT NULL REFERENCES Roles(Id) ON DELETE CASCADE,
    PRIMARY KEY (UserId, RoleId)
);

-- =====================================================
-- 4. ApplicationInformation (Database-driven registry)
-- =====================================================
CREATE TABLE ApplicationInformation (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    ApplicationCode NVARCHAR(50) NOT NULL,
    Application     NVARCHAR(100) NOT NULL,
    Campus          NVARCHAR(50),
    Link            NVARCHAR(500) NOT NULL,
    Description     NVARCHAR(500),
    DatabaseType    NVARCHAR(50),
    Technology      NVARCHAR(100),
    Name            NVARCHAR(50),
    Icon            NVARCHAR(100),
    DisplayOrder    INT DEFAULT 0,
    Status          NVARCHAR(20) DEFAULT 'Active',
    RequiresSSO     BIT DEFAULT 0,
    CreatedAt       DATETIME2 DEFAULT GETDATE(),
    UpdatedAt       DATETIME2 DEFAULT GETDATE()
);

CREATE INDEX IX_AppInfo_Status ON ApplicationInformation(Status);
CREATE INDEX IX_AppInfo_AppCode ON ApplicationInformation(ApplicationCode);
CREATE INDEX IX_AppInfo_Campus ON ApplicationInformation(Campus);

-- =====================================================
-- 5. ApplicationRoles (role-based app access)
-- =====================================================
CREATE TABLE ApplicationRoles (
    ApplicationId INT NOT NULL REFERENCES ApplicationInformation(Id) ON DELETE CASCADE,
    RoleId        INT NOT NULL REFERENCES Roles(Id) ON DELETE CASCADE,
    CanAccess     BIT DEFAULT 1,
    PRIMARY KEY (ApplicationId, RoleId)
);

-- =====================================================
-- 6. UserApplications (per-user overrides)
-- =====================================================
CREATE TABLE UserApplications (
    UserId        INT NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
    ApplicationId INT NOT NULL REFERENCES ApplicationInformation(Id) ON DELETE CASCADE,
    CanAccess     BIT DEFAULT 1,
    PRIMARY KEY (UserId, ApplicationId)
);

-- =====================================================
-- 7. AuditLogs
-- =====================================================
CREATE TABLE AuditLogs (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    UserId        INT REFERENCES Users(Id),
    Action        NVARCHAR(100) NOT NULL,
    ApplicationId INT REFERENCES ApplicationInformation(Id),
    Timestamp     DATETIME2 DEFAULT GETDATE(),
    IPAddress     NVARCHAR(45),
    Details       NVARCHAR(MAX)
);

CREATE INDEX IX_AuditLogs_UserId ON AuditLogs(UserId);
CREATE INDEX IX_AuditLogs_Timestamp ON AuditLogs(Timestamp);
CREATE INDEX IX_AuditLogs_Action ON AuditLogs(Action);

-- =====================================================
-- 8. Sessions (MSSQL-backed session store for Express)
--    Used by connect-mssql-v2 to persist user sessions
--    across PM2 restarts and server reboots.
-- =====================================================
CREATE TABLE [dbo].[sessions](
    [sid]     [nvarchar](255)  NOT NULL PRIMARY KEY,
    [session] [nvarchar](max)  NOT NULL,
    [expires] [datetime]       NOT NULL
);
