// Authentication and registration routes
const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// Public routes
router.post('/auth/register', authController.registerVendor);
router.post('/auth/login', authController.loginVendor); // Unified login for both vendors and purchase managers


// Vendor routes (authenticated)
router.get('/vendor/profile', authController.authenticateToken, authController.getOwnVendorProfile);
router.get('/vendor/profile/:vendorId', authController.authenticateToken, authController.getVendorProfile);
router.put('/vendor/profile/:vendorId', authController.authenticateToken, authController.updateVendorProfileById);
router.put('/vendor/profile', authController.authenticateToken, authController.updateVendorProfile);
router.get('/vendor/profile', authController.authenticateToken, authController.getVendorProfile);


// Vendor registration management routes
router.get('/auth/registrations', authController.authenticateToken, authController.getRegistrationRequests);
router.get('/auth/registrations/:id', authController.authenticateToken, authController.getRegistrationRequest);
router.put('/auth/registrations/:id/approve', authController.authenticateToken, authController.approveRegistration);
router.put('/auth/registrations/:id/reject', authController.authenticateToken, authController.rejectRegistration);
router.put('/auth/registrations/:id/certificate', authController.authenticateToken, authController.updateCertificateStatus);

module.exports = router;
