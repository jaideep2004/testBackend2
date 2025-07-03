// models/index.js
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");

// User Model
const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
		},
		password: {
			type: String,
			required: true,
		},
		isAdmin: {
			type: Boolean,
			default: false,
		},
		purchasedContent: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Content",
			},
		],
		purchasedProjects: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Project",
			},
		],
		lastLogin: {
			type: Date,
			default: Date.now,
		},
		profileImage: {
			type: String,
			default: "",
		},
	},
	{
		timestamps: true,
	}
);

userSchema.pre("save", async function (next) {
	if (!this.isModified("password")) {
		next();
	}
	const salt = await bcryptjs.genSalt(10);
	this.password = await bcryptjs.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
	return await bcryptjs.compare(enteredPassword, this.password);
};

// Class Model

const classSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
		unique: true,
	},
	description: String,
	order: {
		type: Number,
		default: 0,
	},
	image: {
		type: String,
	},
	isActive: {
		type: Boolean,
		default: true,
	},
	hasSemesters: {
		// Add this field
		type: Boolean,
		default: false,
	},
	semesterCount: {
		// Add this field
		type: Number,
		default: 0,
	},
});
// Add this new schema with the existing schemas

const semesterSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
	},
	classId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Class",
		required: true,
	},
	description: String,
	order: {
		type: Number,
		default: 0,
	},
	isActive: {
		type: Boolean,
		default: true,
	},
});

// Subject Model

const subjectSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
	},
	classId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Class",
		required: true,
	},
	semesterId: {
		// Add this field
		type: mongoose.Schema.Types.ObjectId,
		ref: "Semester",
		required: true,
	},
	description: String,
	order: {
		type: Number,
		default: 0,
	},
	icon: {
		type: String,
	},
	isActive: {
		type: Boolean,
		default: true,
	},
});

// Content Model
const contentSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: true,
		},
		description: {
			type: String,
			required: true,
		},
		type: {
			type: String,
			enum: [
				"MCQs",
				"Previous Year",
				"PDF Notes",
				"Video Lectures",
				"Practice Tests",
			],
			required: true,
		},
		contentType: { type: String },
		subjectId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Subject",
			required: true,
		},
		classId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Class",
			required: true,
		},
		fileUrl: {
			type: String,
			required: true,
		},
		fileId: {
			type: String, // Google Drive file ID
		},
		viewUrl: {
			type: String, // Google Drive view URL
		},
		previewUrl: {
			type: String,
		},
		thumbnailUrl: {
			type: String,
		},
		price: {
			type: Number,
			required: true,
			default: 0,
		},
		semesterId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Semester",
			required: true,
		},
		isFree: {
			type: Boolean,
			default: false,
		},
		downloads: {
			type: Number,
			default: 0,
		},
		views: {
			type: Number,
			default: 0,
		},
		ratings: [
			{
				user: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "User",
				},
				rating: Number,
				review: String,
				date: {
					type: Date,
					default: Date.now,
				},
			},
		],
		avgRating: {
			type: Number,
			default: 0,
		},
		duration: {
			type: Number, // in minutes, for video content
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		tags: [String],
	},
	{
		timestamps: true,
	}
);

// Order Model
const orderSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			required: true,
			ref: "User",
		},
		content: {
			type: mongoose.Schema.Types.ObjectId,
			// required: true,
			ref: "Content",
		},
		project: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Project",
		},
		razorpayOrderId: {
			type: String,
			required: true,
		},
		razorpayPaymentId: {
			type: String,
		},
		amount: {
			type: Number,
			required: true,
		},
		isPaid: {
			type: Boolean,
			default: false,
		},
		paidAt: {
			type: Date,
		},
		status: {
			type: String,
			enum: ["pending", "successful", "failed"],
			default: "pending",
		},
	},
	{
		timestamps: true,
	}
);

const projectSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: true,
		},
		description: {
			type: String,
			required: true,
		},
		subjectId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Subject",
			required: true,
		},
		classId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Class",
			required: true,
		},
		fileUrl: {
			type: String,
			required: true,
		},
		thumbnailUrl: {
			type: String,
		},
		price: {
			type: Number,
			required: true,
			default: 0,
		},
		isFree: {
			type: Boolean,
			default: false,
		},
		difficulty: {
			type: String,
			enum: ["Beginner", "Intermediate", "Advanced"],
			required: true,
		},
		technologies: [String],
		downloads: {
			type: Number,
			default: 0,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		tags: [String],
	},
	{
		timestamps: true,
	}
);

const cartSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		items: [
			{
				itemType: {
					type: String,
					enum: ["content", "project"],
					required: true,
				},
				item: {
					type: mongoose.Schema.Types.ObjectId,
					refPath: "items.itemType",
					required: true,
				},
				quantity: {
					type: Number,
					default: 1,
				},
			},
		],
		totalAmount: {
			type: Number,
			default: 0,
		},
	},
	{
		timestamps: true,
	}
);

const Project = mongoose.model("Project", projectSchema);

const User = mongoose.model("User", userSchema);
const Class = mongoose.model("Class", classSchema);
const Subject = mongoose.model("Subject", subjectSchema);
const Content = mongoose.model("Content", contentSchema);
const Order = mongoose.model("Order", orderSchema);
const Cart = mongoose.model("Cart", cartSchema);

const Semester = mongoose.model("Semester", semesterSchema);

module.exports = {
	User,
	Class,
	Subject,

	Semester,

	Content,
	Order,
	Project,
	Cart,
};
