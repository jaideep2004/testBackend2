// controllers/index.js
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
const path = require("path");
const fs = require("fs");

const razorpay = new Razorpay({
	key_id: process.env.RAZORPAY_KEY_ID,
	key_secret: process.env.RAZORPAY_SECRET,
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

			const fileUrl = req.files["file"] ? req.files["file"][0].path : null;
			const thumbnailUrl = req.files["thumbnail"]
				? req.files["thumbnail"][0].path
				: null;

			if (!fileUrl) {
				return res.status(400).json({
					message: "Main content file is required",
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

			// Delete associated files
			if (content.fileUrl) {
				const filePath = path.join(__dirname, "..", content.fileUrl);
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			}

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

			const normalizedPath = content.fileUrl.replace(/\\/g, "/");
			const filePath = path.join(__dirname, "..", normalizedPath);

			if (!fs.existsSync(filePath)) {
				return res.status(404).json({ message: "File not found" });
			}

			// Add security headers
			res.setHeader(
				"Content-Security-Policy",
				"default-src 'self'; script-src 'none'; object-src 'none';"
			);
			res.setHeader("X-Content-Type-Options", "nosniff");
			res.setHeader("X-Frame-Options", "SAMEORIGIN");
			res.setHeader(
				"Cache-Control",
				"no-store, no-cache, must-revalidate, private"
			);
			res.setHeader("Pragma", "no-cache");
			res.setHeader("Expires", "0");

			// Set content type and disposition
			const ext = path.extname(filePath).toLowerCase();
			const contentType = content.type.toLowerCase();

			let mimeType = "application/octet-stream";
			if (
				ext === ".pdf" ||
				["previous year", "question paper", "notes"].includes(contentType)
			) {
				mimeType = "application/pdf";
			} else if (ext === ".mp4" || contentType.includes("video")) {
				mimeType = "video/mp4";
			}

			res.setHeader("Content-Type", mimeType);
			res.setHeader("Content-Disposition", 'inline; filename="preview"');

			// Stream the file
			const fileStream = fs.createReadStream(filePath);
			fileStream.pipe(res);
		} catch (error) {
			console.error("Preview error:", error);
			res
				.status(500)
				.json({ message: "Error previewing content", error: error.message });
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
			});
		} catch (error) {
			res.status(500).json({
				message: "Error fetching dashboard data",
				error: error.message,
			});
		}
	},

	downloadContent: async (req, res) => {
		try {
			const content = await Content.findById(req.params.id);
			if (!content) {
				return res.status(404).json({ message: "Content not found" });
			}

			const hasPurchased = req.user.purchasedContent.includes(content._id);
			if (!content.isFree && !hasPurchased) {
				return res.status(403).json({ message: "Content not purchased" });
			}

			// Map content types to MIME types
			const mimeTypes = {
				"Video Lectures": "video/mp4",
				"PDF Notes": "application/pdf",
				Documents: "application/pdf",
				// Add more mappings as needed
			};

			// Get the MIME type based on content type
			const contentType = mimeTypes[content.type];
			if (!contentType) {
				return res.status(400).json({ message: "Unsupported content type" });
			}

			// Get file extension from the original file
			const fileExtension = path.extname(content.fileUrl);

			// Construct the full file path (adjust the base path according to your server setup)
			const fullPath = path.join(__dirname, "..", content.fileUrl);

			// Check if file exists
			if (!fs.existsSync(fullPath)) {
				return res.status(404).json({ message: "File not found" });
			}

			// Update download count
			content.downloads += 1;
			await content.save();

			// Set headers for file download
			res.setHeader("Content-Type", contentType);
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${content.title}${fileExtension}"`
			);

			// Stream the file
			const fileStream = fs.createReadStream(fullPath);
			fileStream.pipe(res);
		} catch (error) {
			console.error("Download error:", error);
			res.status(500).json({
				message: "Error downloading content",
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
			console.log("Uploaded Files:", req.files);
			console.log("Project File:", req.files["file"]);
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

			// Fix the file path access
			const fileUrl = req.files["file"] ? req.files["file"][0].path : null;
			const thumbnailUrl = req.files["thumbnail"]
				? req.files["thumbnail"][0].path
				: null;

			if (!fileUrl) {
				return res.status(400).json({ message: "Project file is required" });
			}

			const project = await Project.create({
				title,
				description,
				subjectId,
				classId,
				fileUrl,
				thumbnailUrl,
				price: Number(price),
				isFree: isFree === "true",
				difficulty,
				technologies: technologies?.split(",").map((tech) => tech.trim()),
				tags: tags?.split(",").map((tag) => tag.trim()),
			});

			res.status(201).json(project);
		} catch (error) {
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

			const hasPurchased = req.user.purchasedProjects?.includes(project._id);
			if (!project.isFree && !hasPurchased) {
				return res.status(403).json({ message: "Project not purchased" });
			}

			// Get file extension from the original file
			const fileExtension = path.extname(project.fileUrl);

			// Construct the full file path
			const fullPath = path.join(__dirname, "..", project.fileUrl);

			// Check if file exists
			if (!fs.existsSync(fullPath)) {
				return res.status(404).json({ message: "File not found" });
			}

			// Update download count
			project.downloads += 1;
			await project.save();

			// Set headers for file download
			res.setHeader("Content-Type", "application/zip");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${project.title}${fileExtension}"`
			);

			// Stream the file
			const fileStream = fs.createReadStream(fullPath);
			fileStream.pipe(res);
		} catch (error) {
			console.error("Download error:", error);
			res.status(500).json({
				message: "Error downloading project",
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
