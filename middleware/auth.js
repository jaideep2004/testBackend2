const { OAuth2Client } = require('google-auth-library');
const driveService = require('../utils/driveService');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.tokens) {
    return res.status(401).json({ 
      error: 'Not authenticated',
      authUrl: '/auth/google' // Frontend can redirect to this URL
    });
  }
  
  // Set up the OAuth client with the stored tokens
  try {
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );
    
    oauth2Client.setCredentials(req.session.tokens);
    // Initialize the drive service with the tokens
    driveService.setTokens(req.session.tokens);
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

module.exports = { requireAuth };
