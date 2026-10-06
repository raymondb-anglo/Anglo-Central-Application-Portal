-- =====================================================
-- Anglo Central Application Portal — Seed Data
-- Initial application records for the registry
-- =====================================================

-- =====================================================
-- CCA (Co-Curricular Activities)
-- =====================================================
INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('CCA', 'CCA', 'Main Campus', 'https://cca.anglosingapore.ac.th/', 'Co-Curricular Activities management system', 'MSSQL', 'Node.js', 'Student', 'calendar-event', 10, 'Active', 0);

INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('CCA', 'CCA', 'Campus 31', 'https://cca31.anglosingapore.ac.th/', 'Co-Curricular Activities management system', 'MSSQL', 'Node.js', 'Student', 'calendar-event', 11, 'Active', 0);

INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('CCA', 'CCA', 'Korat', 'https://ccakorat.anglosingapore.ac.th/', 'Co-Curricular Activities management system', 'MSSQL', 'Node.js', 'Student', 'calendar-event', 12, 'Active', 0);

-- =====================================================
-- PTM (Parent-Teacher Meeting)
-- =====================================================
INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('PTM', 'PTM', 'Main Campus', 'https://ptm.anglosingapore.ac.th/', 'Parent-Teacher Meeting scheduling system', 'MSSQL', '.NET Core', 'Student', 'people', 20, 'Active', 0);

INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('PTM', 'PTM', 'Campus 31', 'https://ptm31.anglosingapore.ac.th/', 'Parent-Teacher Meeting scheduling system', 'MSSQL', '.NET Core', 'Student', 'people', 21, 'Active', 0);

INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('PTM', 'PTM', 'Korat', 'https://ptmkorat.anglosingapore.ac.th/', 'Parent-Teacher Meeting scheduling system', 'MSSQL', '.NET Core', 'Student', 'people', 22, 'Active', 0);

-- =====================================================
-- PGJ (Personal Growth Journey)
-- =====================================================
INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('PGJ', 'PGJ', 'Main Campus', 'https://pgj.anglosingapore.ac.th/', 'Personal Growth Journey booking system', 'MSSQL', 'Node.js + Express', 'Student', 'journal-richtext', 30, 'Active', 0);

INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('PGJ', 'PGJ', 'Campus 31', 'https://pgj31.anglosingapore.ac.th/', 'Personal Growth Journey booking system', 'MSSQL', 'Node.js + Express', 'Student', 'journal-richtext', 31, 'Active', 0);

INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('PGJ', 'PGJ', 'Korat', 'https://pgjkorat.anglosingapore.ac.th/', 'Personal Growth Journey booking system', 'MSSQL', 'Node.js + Express', 'Student', 'journal-richtext', 32, 'Active', 0);

-- =====================================================
-- Booking
-- =====================================================
INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('BOOKING', 'Booking', NULL, 'https://booking.anglosingapore.ac.th/', 'Facility and resource booking system', 'MSSQL', 'Node.js', 'Staff', 'calendar-check', 40, 'Active', 0);

-- =====================================================
-- Meet
-- =====================================================
INSERT INTO ApplicationInformation (ApplicationCode, Application, Campus, Link, Description, DatabaseType, Technology, Name, Icon, DisplayOrder, Status, RequiresSSO)
VALUES ('MEET', 'Meet', NULL, 'https://meet.anglosingapore.ac.th/', 'Online meeting and conference system', 'MSSQL', 'Node.js', 'Staff', 'camera-video', 50, 'Active', 0);
