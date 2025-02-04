// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const routes = require("./routes");
const { errorHandler } = require("./middleware");
const connectDB = require("./config/db");
const app = express();

// Connect to MongoDB
// // Connect to database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.get("/", (req, res) => {
	res.send("TEST BACKEND");
});
app.use(
	"/uploads",
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

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
// 	console.log(`Server running on port ${PORT}`);
// });

// // Handle unhandled promise rejections
// process.on("unhandledRejection", (err) => {
// 	console.error("Unhandled Promise Rejection:", err);
// 	process.exit(1);
// });

const PORT = process.env.PORT || 5000;

// Function to start server
const startServer = () => {
	try {
		app.listen(PORT, () => {
			console.log(`Server running on port ${PORT}`);
		});
	} catch (err) {
		console.error("Error starting server:", err);
		console.log("Restarting server in 5 seconds...");
		setTimeout(startServer, 5000); // Restart the server after 5 seconds
	}
};

// Start server
startServer();

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
	console.error("Unhandled Promise Rejection:", err);
	process.exit(1); // Exit the process to allow the restart logic to kick in
});

// Handle uncaught exceptions (if any)
process.on("uncaughtException", (err) => { 
	console.error("Uncaught Exception:", err);
	console.log("Restarting server...");
	setTimeout(startServer, 5000); // Restart the server after 5 seconds
});
