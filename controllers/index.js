// controllers/index.js
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const {
	User,
	Content,
	Class,
	Subject,
	Order,
	Project,
	Semester,
} = require("../models");

dotenv.config();
const path = require("path");
const fs = require("fs");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const razorpay = new Razorpay({
	key_id: process.env.RAZORPAY_KEY_ID,
	key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Auth Controller Functions
const authController = {
	generateToken: (id, isAdmin) => {
		return jwt.sign({ id, isAdmin }, process.env.JWT_SECRET, {
			expiresIn: "12h",
		});
	},

	login: async (req, res) => {
		try {
			const { email, password } = req.body;
			const user = await User.findOne({ email });

			if (user && (await user.matchPassword(password))) {
				user.lastLogin = Date.now();
				await user.save();

				res.json({
					_id: user._id,
					name: user.name,
					email: user.email,
					isAdmin: user.isAdmin,
					token: authController.generateToken(user._id, user.isAdmin),
					redirectUrl: user.isAdmin
						? "/admin/dashboard"
						: "/customer/dashboard",
				});
			} else {
				res.status(401).json({ message: "Invalid email or password" });
			}
		} catch (error) {
			res.status(500).json({ message: "Login failed", error: error.message });
		}
	},

	adminLogin: async (req, res) => {
		try {
			const { email, password } = req.body;
			const user = await User.findOne({ email, isAdmin: true });

			if (user && (await user.matchPassword(password))) {
				user.lastLogin = Date.now();
				await user.save();

				res.json({
					_id: user._id,
					name: user.name,
					email: user.email,
					isAdmin: true,
					token: authController.generateToken(user._id, true),
					redirectUrl: "/admin/dashboard",
				});
			} else {
				res.status(401).json({ message: "Invalid admin credentials" });
			}
		} catch (error) {
			res
				.status(500)
				.json({ message: "Admin login failed", error: error.message });
		}
	},

	register: async (req, res) => {
		try {
			const { name, email, password } = req.body;

			const userExists = await User.findOne({ email });
			if (userExists) {
				return res.status(400).json({ message: "User already exists" });
			}

			const user = await User.create({ name, email, password });
			res.status(201).json({
				_id: user._id,
				name: user.name,
				email: user.email,
				isAdmin: user.isAdmin,
				token: authController.generateToken(user._id),
				redirectUrl: "/customer/dashboard",
			});
		} catch (error) {
			res
				.status(500)
				.json({ message: "Registration failed", error: error.message });
		}
	},
	getMe: async (req, res) => {
		try {
			// Since this route will be protected, we'll have access to req.user
			// from the auth middleware
			const user = await User.findById(req.user._id).select("-password");

			if (!user) {
				return res.status(404).json({ message: "User not found" });
			}

			res.json({
				_id: user._id,
				name: user.name,
				email: user.email,
				isAdmin: user.isAdmin,
				purchasedContent: user.purchasedContent,
			});
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching user data", error: error.message });
		}
	},

	googleAuth: async (req, res) => {
		try {
			const { credential } = req.body;

			// Verify Google token
			const ticket = await client.verifyIdToken({
				idToken: credential,
				audience: process.env.GOOGLE_CLIENT_ID,
			});

			const payload = ticket.getPayload();

			// Check if user exists
			let user = await User.findOne({ email: payload.email });

			if (!user) {
				// Create new user if doesn't exist
				user = await User.create({
					name: payload.name,
					email: payload.email,
					password: Math.random().toString(36).slice(-8), // Random password
					googleId: payload.sub,
					isVerified: true,
				});
			}

			// Generate JWT token
			const token = authController.generateToken(user._id, user.isAdmin);

			res.json({
				_id: user._id,
				name: user.name,
				email: user.email,
				isAdmin: user.isAdmin,
				token,
				redirectUrl: "/customer/dashboard",
			});
		} catch (error) {
			res.status(500).json({
				message: "Google authentication failed",
				error: error.message,
			});
		}
	},
};

// Content Controller Functions
const contentController = {
	uploadContent: async (req, res) => {
		try {
			const {
				title,
				description,
				type,
				subjectId,
				classId,
				semesterId,
				price,
				isFree,
				tags,
				duration,
			} = req.body;

			// Validate semesterId
			if (!mongoose.Types.ObjectId.isValid(semesterId)) {
				return res.status(400).json({
					message: "Invalid semester ID format",
				});
			}

			const fileObj = req.files["file"] ? req.files["file"][0] : null;
			
			// Handle thumbnail - save to disk if it came from memory storage
			let thumbnailUrl = null;
			if (req.files["thumbnail"] && req.files["thumbnail"][0]) {
				const thumbnailFile = req.files["thumbnail"][0];
				if (thumbnailFile.buffer) {
					// Thumbnail came from memory storage, save to disk
					const fs = require('fs');
					const path = require('path');
					
					// Create uploads/thumbnails directory if it doesn't exist
					const uploadDir = 'uploads/thumbnails';
					fs.mkdirSync(uploadDir, { recursive: true });
					
					// Generate unique filename
					const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
					const fileName = `thumbnail-${uniqueSuffix}${path.extname(thumbnailFile.originalname)}`;
					const filePath = path.join(uploadDir, fileName);
					
					// Write thumbnail to disk
					fs.writeFileSync(filePath, thumbnailFile.buffer);
					thumbnailUrl = filePath;
				} else {
					// Thumbnail came from disk storage
					thumbnailUrl = thumbnailFile.path;
				}
			}

			// Determine fileBuffer to use for Google Drive upload
			let fileBufferForDrive;
			const fs = require('fs');
			if (fileObj) {
				if (fileObj.buffer) {
					// Multer memory storage
					fileBufferForDrive = fileObj.buffer;
				} else if (fileObj.path) {
					// Multer disk storage - read the file into buffer
					fileBufferForDrive = fs.readFileSync(fileObj.path);
					// Delete the local file after reading into buffer
					fs.unlinkSync(fileObj.path);
				} else {
					fileBufferForDrive = null;
				}
			} else {
				fileBufferForDrive = null;
			}

			if (!fileObj) {
				return res.status(400).json({
					message: "Main content file is required",
				});
			}

			// Import the Google Drive service
			const { uploadFileToDrive } = require('../utils/driveService');
			
			// Upload file to Google Drive
			let fileUrl, fileId, viewUrl;
			
			try {
				// Determine MIME type based on content type
				let mimeType = 'application/pdf';
				if (type === "Video Lectures") {
					mimeType = 'video/mp4';
				} else if (type === "MCQs" || type === "PDF Notes" || type === "Previous Year") {
					mimeType = 'application/pdf';
				}
				
				// Upload the file to Google Drive with the correct MIME type
				const uploadResult = await uploadFileToDrive(fileBufferForDrive, fileObj.originalname, mimeType);
				
				// Store both the download URL and file ID
				fileUrl = uploadResult.url;
				fileId = uploadResult.id;
				viewUrl = uploadResult.downloadUrl;
				
				console.log('File uploaded to Google Drive successfully:', uploadResult);
			} catch (driveError) {
				console.error('Google Drive upload failed:', driveError);
				return res.status(500).json({
					message: "Failed to upload file to Google Drive",
					error: driveError.message
				});
			}

			const content = await Content.create({
				title,
				description,
				type,
				subjectId,
				classId,
				semesterId,
				fileUrl,
				fileId, // Store Google Drive file ID
				viewUrl, // Store Google Drive view URL
				thumbnailUrl,
				price: Number(price),
				isFree: isFree === "true",
				tags: tags?.split(",").map((tag) => tag.trim()),
				duration: Number(duration) || 0,
			});

			res.status(201).json(content);
		} catch (error) {
			console.error("Content upload error:", error);
			res.status(500).json({
				message: "Content upload failed",
				error: error.message,
				details: error.stack,
			});
		}
	},

	getContents: async (req, res) => {
		try {
			const {
				type,
				subjectId,
				classId,
				semesterId,
				search,
				sort,
				limit = 10,
				page = 1,
			} = req.query;
			const filter = {};

			if (type) filter.type = type;
			if (subjectId) filter.subjectId = subjectId;
			if (classId) filter.classId = classId;
			if (semesterId) filter.semesterId = semesterId;
			if (search) {
				filter.$or = [
					{ title: { $regex: search, $options: "i" } },
					{ description: { $regex: search, $options: "i" } },
					{ tags: { $in: [new RegExp(search, "i")] } },
				];
			}

			const sortOptions = {
				newest: { createdAt: -1 },
				popular: { downloads: -1 },
				price: { price: 1 },
				// Add other sort options as needed
			};

			const contents = await Content.find(filter)
				.sort(sortOptions[sort] || sortOptions.newest)
				.populate("subjectId", "name semesterId")
				.populate({
					path: "subjectId",
					populate: { path: "semesterId", select: "name" },
				})
				.populate("classId", "name")
				.limit(Number(limit))
				.skip((Number(page) - 1) * Number(limit));

			const total = await Content.countDocuments(filter);

			res.json({
				contents,
				page: Number(page),
				pages: Math.ceil(total / Number(limit)),
				total,
			});
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching contents", error: error.message });
		}
	},

	getContentById: async (req, res) => {
		try {
			const { id } = req.params;
			const content = await Content.findById(id)
				.populate("subjectId", "name")
				.populate("classId", "name");
			if (!content) {
				return res.status(404).json({ message: "Content not found" });
			}
			res.json(content);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching content", error: error.message });
		}
	},

	deleteContent: async (req, res) => {
		try {
			const content = await Content.findById(req.params.id);

			if (!content) {
				return res.status(404).json({ message: "Content not found" });
			}

			// Import the Google Drive service
			const { deleteFileFromDrive } = require('../utils/driveService');

			// Delete file from Google Drive if fileId exists
			if (content.fileId) {
				try {
					await deleteFileFromDrive(content.fileId);
					console.log(`File deleted from Google Drive: ${content.fileId}`);
				} catch (driveError) {
					console.error('Failed to delete file from Google Drive:', driveError);
					// Continue with deletion even if Drive deletion fails
				}
			} 
			// Fallback to local file deletion if no fileId (for backward compatibility)
			else if (content.fileUrl && !content.fileUrl.includes('drive.google.com')) {
				const filePath = path.join(__dirname, "..", content.fileUrl);
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			}

			// Delete local thumbnail if it exists
			if (content.thumbnailUrl) {
				const thumbnailPath = path.join(__dirname, "..", content.thumbnailUrl);
				if (fs.existsSync(thumbnailPath)) {
					fs.unlinkSync(thumbnailPath);
				}
			}

			// Remove content from users' purchasedContent arrays
			await User.updateMany(
				{ purchasedContent: content._id },
				{ $pull: { purchasedContent: content._id } }
			);

			// Delete the content document
			await content.deleteOne();

			res.json({ message: "Content deleted successfully" });
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error deleting content", error: error.message });
		}
	},

	previewContent: async (req, res) => {
		try {
			const content = await Content.findById(req.params.id);
			if (!content) {
				return res.status(404).json({ message: "Content not found" });
			}

			// If content has Google Drive URLs, return the URL instead of redirecting
			if (content.viewUrl || (content.fileUrl && content.fileUrl.includes('drive.google.com'))) {
				// Increment view count
				content.views = (content.views || 0) + 1;
				await content.save();
				
				// Get the Google Drive URL
				let driveUrl = content.viewUrl || content.fileUrl;
				
				// Extract the file ID if it's in the standard Google Drive format
				const idMatch = driveUrl.match(/[-\w]{25,}/);
				const fileId = idMatch ? idMatch[0] : null;
				
				// For preview, use the /preview endpoint instead of /view
				if (fileId) {
					driveUrl = `https://drive.google.com/file/d/${fileId}/preview`;
				}
				
				return res.json({
					previewUrl: driveUrl,
					fileType: content.type === "Video Lectures" ? "video" : "pdf"
				});
			}
			
			// Legacy handling for local files
			// Get the file path
			const filePath = path.join(__dirname, "..", content.fileUrl);

			// Check if file exists
			if (!fs.existsSync(filePath)) {
				return res.status(404).json({ message: "File not found" });
			}

			// Get file extension
			const ext = path.extname(filePath).toLowerCase();

			// Set appropriate content type
			const contentTypes = {
				".pdf": "application/pdf",
				".mp4": "video/mp4",
				".jpg": "image/jpeg",
				".jpeg": "image/jpeg",
				".png": "image/png",
			};

			const contentType = contentTypes[ext] || "application/octet-stream";
			res.setHeader("Content-Type", contentType);

			// For security, prevent caching of preview content
			res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
			res.setHeader("Pragma", "no-cache");
			res.setHeader("Expires", "0");

			// Stream the file
			const stream = fs.createReadStream(filePath);
			stream.pipe(res);
		} catch (error) {
			console.error("Preview error:", error);
			res.status(500).json({ message: "Error previewing content" });
		}
	},

	downloadContent: async (req, res) => {
		try {
			const content = await Content.findById(req.params.id);
			if (!content) {
				return res.status(404).json({ message: "Content not found" });
			}

			// Get user and verify purchase
			const user = await User.findById(req.user._id);
			const isPurchased =
				content.isFree ||
				user.purchasedContent.some(
					(id) => id.toString() === content._id.toString()
				);

			if (!isPurchased) {
				return res.status(403).json({ message: "Content not purchased" });
			}

			// Increment download count
			content.downloads = (content.downloads || 0) + 1;
			await content.save();

			// If content has a Google Drive URL, return the URL instead of redirecting
			if (content.fileUrl && content.fileUrl.includes('drive.google.com')) {
				// Get file extension based on content type
				let fileExtension = '.pdf';
				if (content.type === "Video Lectures") {
					fileExtension = '.mp4';
				}
				
				// Format the URL for direct download
				let driveUrl = content.fileUrl;
				// Extract the file ID if it's in the standard Google Drive format
				const idMatch = driveUrl.match(/[-\w]{25,}/);
				const fileId = idMatch ? idMatch[0] : null;
				
				if (fileId) {
					// Use the direct download URL format
					driveUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
				}
				
				return res.json({
					directUrl: driveUrl,
					fileName: content.title + fileExtension,
					fileType: content.type
				});
			}

			// Legacy handling for local files
			const filePath = path.join(__dirname, "..", content.fileUrl);

			if (!fs.existsSync(filePath)) {
				return res.status(404).json({ message: "File not found" });
			}

			// Determine content type based on file extension or content type
			const ext = path.extname(filePath).toLowerCase();
			let contentType = "application/octet-stream";
			
			// Set appropriate content type based on file extension or content.type
			if (ext === '.pdf' || content.type === "PDF Notes" || content.type === "Previous Year") {
				contentType = "application/pdf";
			} else if (ext === '.mp4' || content.type === "Video Lectures") {
				contentType = "video/mp4";
			} else if (ext === '.jpg' || ext === '.jpeg') {
				contentType = "image/jpeg";
			} else if (ext === '.png') {
				contentType = "image/png";
			}

			// Set download headers
			const filename = path.basename(content.fileUrl);
			const safeFilename = content.title.replace(/[^a-zA-Z0-9._-]/g, '_') + ext;
			
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${safeFilename}"`
			);
			res.setHeader("Content-Type", contentType);

			// Stream the file
			const stream = fs.createReadStream(filePath);
			stream.pipe(res);
		} catch (error) {
			console.error("Download error:", error);
			res.status(500).json({ message: "Error downloading content" });
		}
	},
};

// Customer Controller Functions
const customerController = {
	getDashboardData: async (req, res) => {
		try {
			const userId = req.user._id;

			// Get user's purchased content with populated fields
			const purchasedContent = await Content.find({
				_id: { $in: req.user.purchasedContent },
			})
				.populate("subjectId", "name")
				.populate("classId", "name")
				.sort("-createdAt")
				.limit(5);

			// Get user's purchased projects
			const purchasedProjects = await Project.find({
				_id: { $in: req.user.purchasedProjects },
			})
				.populate("subjectId", "name")
				.populate("classId", "name")
				.sort("-createdAt")
				.limit(5);

			// Get recommended content (excluding purchased)
			const recommendedContent = await Content.find({
				_id: { $nin: req.user.purchasedContent },
				isFree: false,
			})
				.populate("subjectId", "name")
				.populate("classId", "name")
				.sort("-avgRating")
				.limit(5);

			// Get recommended projects (excluding purchased)
			const recommendedProjects = await Project.find({
				// _id: { $nin: req.user.purchasedProjects },
				isFree: false,
			})
				.populate("subjectId", "name")
				.populate("classId", "name")
				.sort("-createdAt")
				.limit(5);

			const freeProjects = await Project.find({
				// _id: { $nin: req.user.purchasedProjects },
				isFree: true,
			})
				.populate("subjectId", "name")
				.populate("classId", "name")
				.sort("-createdAt")
				.limit(5);

			console.log("Recommended Projects Query:", {
				purchasedProjects: req.user.purchasedProjects,
				count: await Project.countDocuments({ isFree: false }),
				results: recommendedProjects,
			});

			// Get latest free content
			const freeContent = await Content.find({ isFree: true })
				.populate("subjectId", "name")
				.populate("classId", "name")
				.sort("-createdAt")
				.limit(5);

			// Get popular content
			const popularContent = await Content.find({
				_id: { $nin: req.user.purchasedContent },
				isFree: false,
			})
				.sort("-downloads")
				.populate("subjectId", "name")
				.populate("classId", "name")
				.limit(5);

			res.json({
				purchasedContent,
				purchasedProjects,
				recommendedContent,
				recommendedProjects,
				freeContent,
				popularContent,
				freeProjects,
			});
		} catch (error) {
			res.status(500).json({
				message: "Error fetching dashboard data",
				error: error.message,
			});
		}
	},
};

// Payment Controller Functions
const paymentController = {
	createOrder: async (req, res) => {
		try {
			const { contentId, projectId, amount } = req.body;

			// Check if content or project is being purchased
			let item;
			if (contentId) {
				item = await Content.findById(contentId);
				if (!item) {
					return res.status(404).json({ message: "Content not found" });
				}
			} else if (projectId) {
				item = await Project.findById(projectId);
				if (!item) {
					return res.status(404).json({ message: "Project not found" });
				}
			} else {
				return res
					.status(400)
					.json({ message: "Content or Project ID required" });
			}

			const options = {
				amount: amount * 100,
				currency: "INR",
				receipt: `receipt_${Date.now()}`,
			};

			const order = await razorpay.orders.create(options);

			// Create order with only the provided ID
			const dbOrder = await Order.create({
				user: req.user._id,
				...(contentId && { content: contentId }),
				...(projectId && { project: projectId }),
				razorpayOrderId: order.id,
				amount: amount,
			});

			res.json({
				id: order.id,
				amount: order.amount,
				currency: order.currency,
				orderId: dbOrder._id,
			});
		} catch (error) {
			console.error("Order creation error:", error);
			res.status(500).json({
				message: "Error creating order",
				error: error.message,
			});
		}
	},

	verifyPayment: async (req, res) => {
		try {
			const { razorpayPaymentId, razorpayOrderId, orderId } = req.body;

			const order = await Order.findById(orderId);
			if (!order) {
				return res.status(404).json({ message: "Order not found" });
			}

			// Verify payment with Razorpay
			order.razorpayPaymentId = razorpayPaymentId;
			order.isPaid = true;
			order.paidAt = Date.now();
			order.status = "successful";
			await order.save();

			// Add content or project to user's purchased items
			if (order.content) {
				await User.findByIdAndUpdate(req.user._id, {
					$addToSet: { purchasedContent: order.content },
				});
			} else if (order.project) {
				await User.findByIdAndUpdate(req.user._id, {
					$addToSet: { purchasedProjects: order.project },
				});
			}

			res.json({ message: "Payment successful" });
		} catch (error) {
			res
				.status(500)
				.json({ message: "Payment verification failed", error: error.message });
		}
	},
};

// Admin Controller Functions

const adminController = {
	addClass: async (req, res) => {
		try {
			const { name, description, order } = req.body;
			const imageUrl = req.file ? req.file.path : null;

			const newClass = await Class.create({
				name,
				description,
				order: Number(order) || 0,
				image: imageUrl,
			});

			res.status(201).json(newClass);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error adding class", error: error.message });
		}
	},

	getClasses: async (req, res) => {
		try {
			const classes = await Class.find({ isActive: true }).sort("order").lean(); // Add lean() for better performance
			res.json(classes);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching classes", error: error.message });
		}
	},

	addSemester: async (req, res) => {
		try {
			const { name, classId, description, order } = req.body;

			// Create the semester
			const newSemester = await Semester.create({
				name,
				classId,
				description,
				order: Number(order) || 0,
			});

			// Update the class
			await Class.findByIdAndUpdate(classId, {
				hasSemesters: true,
				$inc: { semesterCount: 1 },
			});

			res.status(201).json(newSemester);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error adding semester", error: error.message });
		}
	},

	getSemesters: async (req, res) => {
		try {
			const { classId } = req.query;
			const filter = { isActive: true };

			if (classId) {
				filter.classId = classId;
			}

			const semesters = await Semester.find(filter)
				.populate("classId", "name")
				.sort("order");
			res.json(semesters);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching semesters", error: error.message });
		}
	},

	addSubject: async (req, res) => {
		try {
			const { name, classId, semesterId, description, order } = req.body;
			const iconUrl = req.file ? req.file.path : null;

			const newSubject = await Subject.create({
				name,
				classId,
				semesterId, // Add this
				description,
				order: Number(order) || 0,
				icon: iconUrl,
			});

			res.status(201).json(newSubject);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error adding subject", error: error.message });
		}
	},

	getSubjects: async (req, res) => {
		try {
			const { classId, semesterId } = req.query;
			const filter = { isActive: true };

			if (classId) filter.classId = classId;
			if (semesterId) filter.semesterId = semesterId;

			const subjects = await Subject.find(filter)
				.populate("classId", "name")
				.populate("semesterId", "name")
				.sort("order");
			res.json(subjects);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching subjects", error: error.message });
		}
	},

	getDashboardStats: async (req, res) => {
		try {
			// Get basic stats
			const [totalUsers, totalContent, totalOrders, recentOrders] =
				await Promise.all([
					User.countDocuments({ isAdmin: false }),
					Content.countDocuments(),
					Order.countDocuments({ status: "successful" }),
					Order.find({ status: "successful" })
						.sort("-createdAt")
						.limit(5)
						.populate("user", "name email")
						.populate("content", "title price"),
				]);

			// Calculate total revenue
			const revenueResult = await Order.aggregate([
				{ $match: { status: "successful" } },
				{ $group: { _id: null, total: { $sum: "$amount" } } },
			]);
			const totalRevenue = revenueResult[0]?.total || 0;

			// Get monthly revenue for the last 12 months
			const monthlyRevenue = await Order.aggregate([
				{
					$match: {
						status: "successful",
						createdAt: {
							$gte: new Date(
								new Date().setFullYear(new Date().getFullYear() - 1)
							),
						},
					},
				},
				{
					$group: {
						_id: {
							year: { $year: "$createdAt" },
							month: { $month: "$createdAt" },
						},
						amount: { $sum: "$amount" },
					},
				},
				{
					$project: {
						_id: 0,
						month: {
							$concat: [
								{ $toString: "$_id.year" },
								"-",
								{
									$cond: {
										if: { $lt: ["$_id.month", 10] },
										then: { $concat: ["0", { $toString: "$_id.month" }] },
										else: { $toString: "$_id.month" },
									},
								},
							],
						},
						amount: 1,
					},
				},
				{ $sort: { month: 1 } },
			]);

			res.json({
				totalUsers,
				totalContent,
				totalOrders,
				totalRevenue,
				recentOrders,
				monthlyRevenue,
			});
		} catch (error) {
			console.error("Dashboard stats error:", error);
			res.status(500).json({
				message: "Error fetching dashboard stats",
				error: error.message,
			});
		}
	},

	getUsers: async (req, res) => {
		try {
			const users = await User.find({ _id: { $ne: req.user._id } })
				.select("-password")
				.sort("-createdAt");

			res.json(users);
		} catch (error) {
			res.status(500).json({
				message: "Error fetching users",
				error: error.message,
			});
		}
	},

	getUserProfile: async (req, res) => {
		try {
			const user = await User.findById(req.params.id)
				.select("-password")
				.populate({
					path: "purchasedContent",
					select: "title type price",
					populate: {
						path: "subjectId",
						select: "name",
					},
				})
				.populate({
					path: "purchasedProjects",
					select: "title difficulty price",
				});

			if (!user) {
				return res.status(404).json({ message: "User not found" });
			}

			// Get order history
			const orders = await Order.find({ user: user._id })
				.populate("content", "title price")
				.populate("project", "title price")
				.sort("-createdAt");

			res.json({
				user,
				orders,
				statistics: {
					totalSpent: orders.reduce((sum, order) => sum + order.amount, 0),
					totalPurchases: orders.length,
					contentPurchased: user.purchasedContent.length,
					projectsPurchased: user.purchasedProjects.length,
				},
			});
		} catch (error) {
			res.status(500).json({
				message: "Error fetching user profile",
				error: error.message,
			});
		}
	},

	deleteUser: async (req, res) => {
		try {
			const user = await User.findById(req.params.id);

			if (!user) {
				return res.status(404).json({ message: "User not found" });
			}

			if (user.isAdmin) {
				return res.status(403).json({ message: "Cannot delete admin user" });
			}

			// Delete user's orders
			await Order.deleteMany({ user: user._id });

			// Delete the user
			await user.deleteOne();

			res.json({ message: "User deleted successfully" });
		} catch (error) {
			res.status(500).json({
				message: "Error deleting user",
				error: error.message,
			});
		}
	},
	deleteClass: async (req, res) => {
		try {
			const classId = req.params.id;

			// Get all semesters for this class
			const semesters = await Semester.find({ classId });

			// Get all subjects for this class
			const subjects = await Subject.find({ classId });

			// Get all content and projects
			const contents = await Content.find({ classId });
			const projects = await Project.find({ classId });

			// Delete all associated files
			[...contents, ...projects].forEach((item) => {
				if (item.fileUrl) {
					const filePath = path.join(__dirname, "..", item.fileUrl);
					if (fs.existsSync(filePath)) {
						fs.unlinkSync(filePath);
					}
				}
				if (item.thumbnailUrl) {
					const thumbnailPath = path.join(__dirname, "..", item.thumbnailUrl);
					if (fs.existsSync(thumbnailPath)) {
						fs.unlinkSync(thumbnailPath);
					}
				}
			});

			// Delete all related data
			await Promise.all([
				Content.deleteMany({ classId }),
				Project.deleteMany({ classId }),
				Subject.deleteMany({ classId }),
				Semester.deleteMany({ classId }),
				Class.findByIdAndDelete(classId),
			]);

			// Remove items from users' purchased lists
			await User.updateMany(
				{},
				{
					$pull: {
						purchasedContent: { $in: contents.map((c) => c._id) },
						purchasedProjects: { $in: projects.map((p) => p._id) },
					},
				}
			);

			res.json({
				message: "Class and all related content deleted successfully",
			});
		} catch (error) {
			res.status(500).json({
				message: "Error deleting class",
				error: error.message,
			});
		}
	},

	deleteSemester: async (req, res) => {
		try {
			const semesterId = req.params.id;

			// Get all subjects for this semester
			const subjects = await Subject.find({ semesterId });

			// Get all content and projects
			const contents = await Content.find({ semesterId });
			const projects = await Project.find({ semesterId });

			// Delete all associated files
			[...contents, ...projects].forEach((item) => {
				if (item.fileUrl) {
					const filePath = path.join(__dirname, "..", item.fileUrl);
					if (fs.existsSync(filePath)) {
						fs.unlinkSync(filePath);
					}
				}
				if (item.thumbnailUrl) {
					const thumbnailPath = path.join(__dirname, "..", item.thumbnailUrl);
					if (fs.existsSync(thumbnailPath)) {
						fs.unlinkSync(thumbnailPath);
					}
				}
			});

			// Delete all related data
			await Promise.all([
				Content.deleteMany({ semesterId }),
				Project.deleteMany({ semesterId }),
				Subject.deleteMany({ semesterId }),
				Semester.findByIdAndDelete(semesterId),
			]);

			// Remove items from users' purchased lists
			await User.updateMany(
				{},
				{
					$pull: {
						purchasedContent: { $in: contents.map((c) => c._id) },
						purchasedProjects: { $in: projects.map((p) => p._id) },
					},
				}
			);

			res.json({
				message: "Semester and all related content deleted successfully",
			});
		} catch (error) {
			res.status(500).json({
				message: "Error deleting semester",
				error: error.message,
			});
		}
	},

	deleteSubject: async (req, res) => {
		try {
			const subjectId = req.params.id;

			// Get all content and projects
			const contents = await Content.find({ subjectId });
			const projects = await Project.find({ subjectId });

			// Delete all associated files
			[...contents, ...projects].forEach((item) => {
				if (item.fileUrl) {
					const filePath = path.join(__dirname, "..", item.fileUrl);
					if (fs.existsSync(filePath)) {
						fs.unlinkSync(filePath);
					}
				}
				if (item.thumbnailUrl) {
					const thumbnailPath = path.join(__dirname, "..", item.thumbnailUrl);
					if (fs.existsSync(thumbnailPath)) {
						fs.unlinkSync(thumbnailPath);
					}
				}
			});

			// Delete all related data
			await Promise.all([
				Content.deleteMany({ subjectId }),
				Project.deleteMany({ subjectId }),
				Subject.findByIdAndDelete(subjectId),
			]);

			// Remove items from users' purchased lists
			await User.updateMany(
				{},
				{
					$pull: {
						purchasedContent: { $in: contents.map((c) => c._id) },
						purchasedProjects: { $in: projects.map((p) => p._id) },
					},
				}
			);

			res.json({
				message: "Subject and all related content deleted successfully",
			});
		} catch (error) {
			res.status(500).json({
				message: "Error deleting subject",
				error: error.message,
			});
		}
	},
};

const projectController = {
	uploadProject: async (req, res) => {
		try {
			const {
				title,
				description,
				subjectId,
				classId,
				price,
				isFree,
				difficulty,
				technologies,
				tags,
			} = req.body;

			const fileObj = req.files["file"] ? req.files["file"][0] : null;
			
			// Handle thumbnail - save to disk if it came from memory storage
			let thumbnailUrl = null;
			if (req.files["thumbnail"] && req.files["thumbnail"][0]) {
				const thumbnailFile = req.files["thumbnail"][0];
				if (thumbnailFile.buffer) {
					// Thumbnail came from memory storage, save to disk
					const fs = require('fs');
					const path = require('path');
					
					// Create uploads/thumbnails directory if it doesn't exist
					const uploadDir = 'uploads/thumbnails';
					fs.mkdirSync(uploadDir, { recursive: true });
					
					// Generate unique filename
					const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
					const fileName = `thumbnail-${uniqueSuffix}${path.extname(thumbnailFile.originalname)}`;
					const filePath = path.join(uploadDir, fileName);
					
					// Write thumbnail to disk
					fs.writeFileSync(filePath, thumbnailFile.buffer);
					thumbnailUrl = filePath;
				} else {
					// Thumbnail came from disk storage
					thumbnailUrl = thumbnailFile.path;
				}
			}

			if (!fileObj) {
				return res.status(400).json({ message: "Project file is required" });
			}

			// Determine fileBuffer to use for Google Drive upload
			let fileBufferForDrive;
			const fs = require('fs');
			if (fileObj) {
				if (fileObj.buffer) {
					// Multer memory storage
					fileBufferForDrive = fileObj.buffer;
				} else if (fileObj.path) {
					// Multer disk storage - read the file into buffer
					fileBufferForDrive = fs.readFileSync(fileObj.path);
					// Delete the local file after reading into buffer
					fs.unlinkSync(fileObj.path);
				} else {
					fileBufferForDrive = null;
				}
			} else {
				fileBufferForDrive = null;
			}

			// Import the Google Drive service
			const { uploadFileToDrive } = require('../utils/driveService');
			
			// Upload file to Google Drive
			let fileUrl, fileId, viewUrl;
			
			try {
				// Determine MIME type based on file extension
				const ext = fileObj.originalname.split('.').pop().toLowerCase();
				const mimeTypeMap = {
					'pdf': 'application/pdf',
					'doc': 'application/msword',
					'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
					'zip': 'application/zip',
					'rar': 'application/vnd.rar',
					'txt': 'text/plain',
					'jpg': 'image/jpeg',
					'jpeg': 'image/jpeg',
					'png': 'image/png',
				};
				const mimeType = mimeTypeMap[ext] || 'application/octet-stream';
				
				// Upload the file to Google Drive with the correct MIME type
				const uploadResult = await uploadFileToDrive(fileBufferForDrive, fileObj.originalname, mimeType);
				
				// Store both the download URL and file ID
				fileUrl = uploadResult.url;
				fileId = uploadResult.id;
				viewUrl = uploadResult.downloadUrl;
				
				console.log('Project file uploaded to Google Drive successfully:', uploadResult);
			} catch (driveError) {
				console.error('Google Drive project upload failed:', driveError);
				return res.status(500).json({
					message: "Failed to upload project file to Google Drive",
					error: driveError.message
				});
			}

			const project = await Project.create({
				title,
				description,
				subjectId,
				classId,
				fileUrl,
				fileId, // Store Google Drive file ID
				viewUrl, // Store Google Drive view URL
				thumbnailUrl,
				price: Number(price),
				isFree: isFree === "true",
				difficulty,
				technologies: technologies?.split(",").map((tech) => tech.trim()),
				tags: tags?.split(",").map((tag) => tag.trim()),
			});

			res.status(201).json(project);
		} catch (error) {
			console.error("Project upload error:", error);
			res
				.status(500)
				.json({ message: "Project upload failed", error: error.message });
		}
	},

	getProjects: async (req, res) => {
		try {
			const {
				subjectId,
				classId,
				difficulty,
				search,
				sort,
				limit = 10,
				page = 1,
			} = req.query;
			const filter = { isActive: true };

			if (subjectId) filter.subjectId = subjectId;
			if (classId) filter.classId = classId;
			if (difficulty) filter.difficulty = difficulty;
			if (search) {
				filter.$or = [
					{ title: { $regex: search, $options: "i" } },
					{ description: { $regex: search, $options: "i" } },
					{ technologies: { $in: [new RegExp(search, "i")] } },
					{ tags: { $in: [new RegExp(search, "i")] } },
				];
			}

			const sortOptions = {
				newest: { createdAt: -1 },
				popular: { downloads: -1 },
				price: { price: 1 },
			};

			const projects = await Project.find(filter)
				.sort(sortOptions[sort] || sortOptions.newest)
				.populate("subjectId", "name")
				.populate("classId", "name")
				.limit(Number(limit))
				.skip((Number(page) - 1) * Number(limit));

			const total = await Project.countDocuments(filter);

			res.json({
				projects,
				page: Number(page),
				pages: Math.ceil(total / Number(limit)),
				total,
			});
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching projects", error: error.message });
		}
	},

	getProjectById: async (req, res) => {
		try {
			const { id } = req.params;
			const project = await Project.findById(id)
				.populate("subjectId", "name")
				.populate("classId", "name");

			if (!project) {
				return res.status(404).json({ message: "Project not found" });
			}

			res.json(project);
		} catch (error) {
			res
				.status(500)
				.json({ message: "Error fetching project", error: error.message });
		}
	},

	downloadProject: async (req, res) => {
		try {
			const project = await Project.findById(req.params.id);
			if (!project) {
				return res.status(404).json({ message: "Project not found" });
			}

			// Verify purchase
			const user = await User.findById(req.user._id);
			const isPurchased =
				project.isFree ||
				user.purchasedProjects.some(
					(id) => id.toString() === project._id.toString()
				);

			if (!isPurchased) {
				return res.status(403).json({ message: "Project not purchased" });
			}

			// Increment download count
			project.downloads = (project.downloads || 0) + 1;
			await project.save();

			// If project has a Google Drive URL, return the URL instead of redirecting
			if (project.fileUrl && project.fileUrl.includes('drive.google.com')) {
				// Get file extension based on file type
				let fileExtension = '.zip';
				
				// Format the URL for direct download
				let driveUrl = project.fileUrl;
				// Extract the file ID if it's in the standard Google Drive format
				const idMatch = driveUrl.match(/[-\w]{25,}/);
				const fileId = idMatch ? idMatch[0] : null;
				
				if (fileId) {
					// Use the direct download URL format
					driveUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
				}
				
				return res.json({
					directUrl: driveUrl,
					fileName: project.title + fileExtension,
				});
			}

			// Legacy handling for local files
			const filePath = path.join(__dirname, "..", project.fileUrl);

			if (!fs.existsSync(filePath)) {
				return res.status(404).json({ message: "File not found" });
			}

			// Set download headers
			const filename = path.basename(project.fileUrl);
			const safeFilename = project.title.replace(/[^a-zA-Z0-9._-]/g, '_') + path.extname(filename);
				
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${safeFilename}"`
			);
			res.setHeader("Content-Type", "application/octet-stream");

			// Stream the file
			const stream = fs.createReadStream(filePath);
			stream.pipe(res);
		} catch (error) {
			console.error("Project download error:", error);
			res.status(500).json({ message: "Error downloading project" });
		}
	},
	deleteProject: async (req, res) => {
		try {
			const project = await Project.findById(req.params.id);

			if (!project) {
				return res.status(404).json({
					success: false,
					message: "Project not found",
				});
			}

			// Import the Google Drive service
			const { deleteFileFromDrive } = require('../utils/driveService');

			// Delete file from Google Drive if fileId exists
			if (project.fileId) {
				try {
					await deleteFileFromDrive(project.fileId);
					console.log(`Project file deleted from Google Drive: ${project.fileId}`);
				} catch (driveError) {
					console.error('Failed to delete project file from Google Drive:', driveError);
					// Continue with deletion even if Drive deletion fails
				}
			} 
			// Fallback to local file deletion if no fileId (for backward compatibility)
			else if (project.fileUrl && !project.fileUrl.includes('drive.google.com')) {
				const filePath = path.join(__dirname, "..", project.fileUrl);
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			}

			// Delete local thumbnail if it exists
			if (project.thumbnailUrl) {
				const thumbnailPath = path.join(__dirname, "..", project.thumbnailUrl);
				if (fs.existsSync(thumbnailPath)) {
					fs.unlinkSync(thumbnailPath);
				}
			}

			// Delete project from database
			await project.deleteOne();

			res.status(200).json({
				success: true,
				message: "Project deleted successfully",
			});
		} catch (error) {
			console.error("Project deletion error:", error);
			res.status(500).json({
				success: false,
				message: "Error deleting project",
				error: error.message,
			});
		}
	},
};

module.exports = {
	authController,
	contentController,
	customerController,
	paymentController,
	adminController,
	projectController,
};
