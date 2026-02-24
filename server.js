require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const routes = require("./routes");
const { errorHandler } = require("./middleware");
const connectDB = require("./config/db");
const app = express();
const https = require("https");
const fs = require("fs");
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');

// Connect to database 
connectDB();

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize OAuth2 client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI
);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://drive.google.com','https://academicassignmentmaster.co.in'],
  credentials: true,
  exposedHeaders: ['Content-Disposition']
})); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
	next();
}); 
// Serve uploaded files
app.get("/", (req, res) => {
	res.send("TEST BACKEND 4 july");
});
app.use( 
	(req, res, next) => {
		res.setHeader("Content-Security-Policy", "default-src 'self'");
		res.setHeader("X-Content-Type-Options", "nosniff");

		const filePath = req.path;
		const mimeType = {
			".pdf": "application/pdf",
			".doc": "application/msword",
			".docx":
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			".mp4": "video/mp4",
			".webm": "video/webm",
			".jpg": "image/jpeg",
			".jpeg": "image/jpeg",
			".png": "image/png",
		}[path.extname(filePath).toLowerCase()];

		if (mimeType) {
			res.set("Content-Type", mimeType);
		}
		next();
	},

	express.static(path.join(__dirname, "./uploads"))
);
// API Routes
app.use("/api", routes);

// Error Handler
app.use(errorHandler);

// Handle 404
app.use((req, res) => {
	res.status(404).json({ message: "Route not found" });
});

// Auth routes
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in session
    req.session.tokens = tokens;
    
    // Store in drive service
    const driveService = require('./utils/driveService');
    driveService.setTokens(tokens);
    
    res.redirect('/');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send('Authentication failed');
  }
});

// Check auth status
app.get('/api/check-auth', (req, res) => {
  if (req.session.tokens) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// Start server

const PORT = process.env.PORT || 7000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



//live vps
// const options = {
// 	key: fs.readFileSync(
// 		"/etc/letsencrypt/live/195-35-45-82.sslip.io/privkey.pem"
// 	),
// 	cert: fs.readFileSync(
// 		"/etc/letsencrypt/live/195-35-45-82.sslip.io/fullchain.pem"
// 	),
// };

// https.createServer(options, app).listen(PORT, () => {
// 	console.log(`Server running on port ${PORT} (HTTPS)`);
// });
