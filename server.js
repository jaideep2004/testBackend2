//server.js  live
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

// Connect to MongoDB
// // Connect to database
connectDB();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://drive.google.com'],
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
	res.send("TEST BACKEND 3 july");
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



const PORT = process.env.PORT || 7000;


// app.listen(PORT, () => {
// 	console.log(`Server running on port ${PORT}`);
// });


const options = {
	key: fs.readFileSync(path.join(__dirname, "certs/privkey.pem")),
	cert: fs.readFileSync(path.join(__dirname, "certs/fullchain.pem")),
};
https.createServer(options, app).listen(PORT, () => {
	console.log(`Server running on port ${PORT} (HTTPS)`);
});

