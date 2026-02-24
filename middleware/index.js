// middleware/index.js
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const { User } = require("../models");
const fs = require("fs");
// Auth Middleware

const protect = async (req, res, next) => {
	try {
		const token = req.headers.authorization?.split(" ")[1];

		if (!token) {
			return res.status(401).json({ message: "Not authorized" });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const user = await User.findById(decoded.id).select("-password");

		if (!user) {
			return res.status(401).json({ message: "User not found" });
		}

		req.user = user;
		next();
	} catch (error) {
		if (error.name === "TokenExpiredError") {
			return res.status(401).json({ message: "Token expired" });
		}
		res.status(401).json({ message: "Not authorized" });
	}
};

const admin = (req, res, next) => {
	if (req.user && req.user.isAdmin) {
		next();
	} else {
		res.status(403).json({ message: "Not authorized as admin" });
	}
};

// Upload Middleware

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		let uploadPath = "uploads/";

		// Create specific folders based on content type
		if (file.mimetype.startsWith("video")) {
			uploadPath += "videos/";
		} else if (file.mimetype.startsWith("image")) {
			uploadPath += "images/";
		} else if (file.mimetype === "application/.zip") {
			uploadPath += "archives/"; // Custom folder for ZIP files
		} else {
			uploadPath += "documents/";
		}

		// Create directory if it doesn't exist
		fs.mkdirSync(uploadPath, { recursive: true });

		cb(null, uploadPath);
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(
			null,
			file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
		);
	},
});

const fileFilter = (req, file, cb) => {
	const allowedTypes = {
		image: ["image/jpeg", "image/png", "image/jpg"],
		video: ["video/mp4", "video/webm"],
		document: [
			"application/pdf",
			"application/msword",
			"application/zip", // ZIP files
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/x-zip-compressed",
			"application/octet-stream",
			"image/jpeg", // Add allowed types you want
			"image/png",
			"application/pdf",
		],
	};

	const fileType = file.mimetype;
	let isAllowed = false;

	Object.values(allowedTypes).forEach((types) => {
		if (types.includes(fileType)) {
			isAllowed = true;
		}
	});

	if (isAllowed) {
		cb(null, true);
	} else {
		cb(
			new Error(
				"Invalid file type. Allowed types: JPG, PNG, PDF, DOC, DOCX, MP4, ZIP"
			)
		);
	}
};

// Disk storage for general uploads
const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 1000 * 1024 * 1024, // 100MB max file size
	},
});

// Memory storage for Google Drive uploads (to avoid saving locally first)
const memoryStorage = multer.memoryStorage();
const uploadToDrive = multer({
	storage: memoryStorage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 1000 * 1024 * 1024, // 100MB max file size
	},
});

// Error Handler Middleware
const errorHandler = (err, req, res, next) => {
	const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
	res.status(statusCode).json({
		message: err.message,
		stack: process.env.NODE_ENV === "production" ? null : err.stack,
	});
};

module.exports = {
	protect,
	admin,
	upload,
	uploadToDrive,
	errorHandler,
};
