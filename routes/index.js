// routes/index.js
const express = require("express");
const { protect, admin, upload } = require("../middleware");
const { Content, User } = require("../models");
const path = require("path");
const fs = require("fs");

const {
	authController,
	contentController,
	customerController,
	paymentController,
	adminController,
	projectController,
} = require("../controllers");

const router = express.Router();

// Auth Routes
router.post("/auth/register", authController.register);

router.post("/auth/login", authController.login);
router.post("/auth/admin/login", authController.adminLogin);

router.get("/auth/me", protect, authController.getMe);
router.post("/auth/google", authController.googleAuth);
// Content Routes
router.get("/content", contentController.getContents);

// Customer Routes
router.get("/customer/dashboard", protect, customerController.getDashboardData);

// Payment Routes
router.post("/payment/create-order", protect, paymentController.createOrder);
router.post(
	"/payment/verify-payment",
	protect,
	paymentController.verifyPayment
);

// Admin Routes
// Class routes
router.post(
	"/admin/classes",
	protect,
	admin, 
	upload.single("image"),
	adminController.addClass
);
router.get("/admin/classes", adminController.getClasses);

// Add these routes
router.delete(
	"/admin/classes/:id",
	protect,
	admin,
	adminController.deleteClass
);
router.delete(
	"/admin/semesters/:id",
	protect,
	admin,
	adminController.deleteSemester
);
router.delete(
	"/admin/subjects/:id",
	protect,
	admin,
	adminController.deleteSubject
);
// Subject routes
router.post(
	"/admin/subjects",
	protect,
	admin,
	upload.single("icon"),
	adminController.addSubject
);
router.get("/admin/subjects", adminController.getSubjects);

router.post("/admin/semesters", protect, admin, adminController.addSemester);

router.get("/admin/semesters", adminController.getSemesters);
// Content routes
router.post(
	"/content",
	protect,
	admin,
	upload.fields([
		{ name: "file", maxCount: 1 },
		{ name: "thumbnail", maxCount: 1 },
	]),
	contentController.uploadContent
);

router.get("/content", contentController.getContents);
// Content Details Route
router.get("/content/:id", contentController.getContentById);

router.delete("/content/:id", protect, admin, contentController.deleteContent);
// Dashboard stats
router.get("/admin/stats", protect, admin, adminController.getDashboardStats);
// User management routes
router.get("/admin/users", protect, admin, adminController.getUsers);
router.get("/admin/users/:id", protect, admin, adminController.getUserProfile);
router.delete("/admin/users/:id", protect, admin, adminController.deleteUser);

//project
router.post(
	"/projects",
	protect,
	admin,
	upload.fields([
		{ name: "file", maxCount: 1 },
		{ name: "thumbnail", maxCount: 1 },
	]),
	projectController.uploadProject
);

router.get("/projects", projectController.getProjects);
router.get("/projects/:id", projectController.getProjectById);

router.get("/content/:id/preview", contentController.previewContent);
router.get(
	"/content/:id/download",
	protect,
	contentController.downloadContent
);

// Keep old routes for backward compatibility
router.get("/customer/preview/:id", contentController.previewContent);
router.get(
	"/customer/download/:id",
	protect,
	contentController.downloadContent
);
router.get(
	"/projects/download/:id",
	protect,
	projectController.downloadProject
);
router.delete("/projects/:id", protect, admin, projectController.deleteProject);

module.exports = router;
