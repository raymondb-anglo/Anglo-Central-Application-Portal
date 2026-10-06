import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import db from '../db.js';

/**
 * Configure Passport.js with Google OAuth 2.0 strategy.
 * Called once during server startup.
 */
export function configurePassport() {
  // Serialize user ID into session
  passport.serializeUser((user, done) => {
    done(null, user.Id);
  });

  // Deserialize user from session by ID
  passport.deserializeUser(async (id, done) => {
    try {
      const rows = await db.queryRows(
        'SELECT Id, GoogleSubjectId, Email, DisplayName, FirstName, LastName, ProfilePicture, IsActive FROM Users WHERE Id = @p0',
        [id]
      );
      if (rows.length === 0) return done(null, false);
      done(null, rows[0]);
    } catch (err) {
      done(err, null);
    }
  });

  // Google OAuth 2.0 Strategy
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback';

  if (!clientID || clientID === 'your_google_client_id') {
    console.warn('[AUTH] Google OAuth not configured — skipping strategy registration.');
    console.warn('[AUTH] Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Google login.');
    return;
  }

  passport.use(new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value || '';
        const displayName = profile.displayName || '';
        const firstName = profile.name?.givenName || '';
        const lastName = profile.name?.familyName || '';
        const profilePicture = profile.photos?.[0]?.value || '';

        // Check if user exists
        let rows = await db.queryRows(
          'SELECT Id, GoogleSubjectId, Email, DisplayName, FirstName, LastName, ProfilePicture, IsActive FROM Users WHERE GoogleSubjectId = @p0',
          [googleId]
        );

        let user;

        if (rows.length > 0) {
          user = rows[0];

          if (!user.IsActive) {
            return done(null, false, { message: 'Account is deactivated.' });
          }

          // Update last login and profile info
          await db.query(
            'UPDATE Users SET LastLoginAt = GETDATE(), DisplayName = @p0, FirstName = @p1, LastName = @p2, ProfilePicture = @p3, Email = @p4 WHERE GoogleSubjectId = @p5',
            [displayName, firstName, lastName, profilePicture, email, googleId]
          );

          user.DisplayName = displayName;
          user.FirstName = firstName;
          user.LastName = lastName;
          user.ProfilePicture = profilePicture;
        } else {
          // Create new user
          const result = await db.query(
            `INSERT INTO Users (GoogleSubjectId, Email, DisplayName, FirstName, LastName, ProfilePicture, IsActive, CreatedAt, LastLoginAt)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5, 1, GETDATE(), GETDATE());
             SELECT SCOPE_IDENTITY() AS Id;`,
            [googleId, email, displayName, firstName, lastName, profilePicture]
          );

          const newId = result.recordset[0].Id;
          user = {
            Id: newId,
            GoogleSubjectId: googleId,
            Email: email,
            DisplayName: displayName,
            FirstName: firstName,
            LastName: lastName,
            ProfilePicture: profilePicture,
            IsActive: true
          };
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  ));
}

export default passport;
