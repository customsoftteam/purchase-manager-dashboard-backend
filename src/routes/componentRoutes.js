// Component and vendor component routes
const express = require('express');
const router = express.Router();
const componentController = require('../controllers/componentController');
const { authenticateToken } = require('../controllers/authController');

// Vendor Component Routes (authenticated)
router.get('/vendor/components', authenticateToken, componentController.getVendorComponents);
router.get('/vendor/components-required', authenticateToken, componentController.getRequiredComponents);
router.get('/vendor/available-components', authenticateToken, componentController.getAvailableComponentsForVendor);
router.post('/vendor/components', authenticateToken, componentController.addVendorComponent);
router.post('/vendor/add-available-component', authenticateToken, componentController.addAvailableComponent);

// Component Approval Routes (PM authenticated) - MUST be before generic :componentId routes
router.put('/vendor/components/:componentId/approve', authenticateToken, componentController.approveVendorComponent);
router.put('/vendor/components/:componentId/reject', authenticateToken, componentController.rejectVendorComponent);

// Generic component routes - keep these AFTER specific routes
router.put('/vendor/components/:componentId', authenticateToken, componentController.updateVendorComponent);
router.delete('/vendor/components/:componentId', authenticateToken, componentController.deleteVendorComponent);

// Product components routes (purchase manager - read only)
router.get('/products/:productId/components', authenticateToken, componentController.getProductComponents);
router.put('/components/:componentId/active', authenticateToken, componentController.updateComponentActive);
router.get('/components/:componentCode/vendors', authenticateToken, componentController.getComponentVendors);

// Purchase Manager: Get all vendor components
router.get('/purchase-manager/vendor-components', authenticateToken, componentController.getAllVendorComponents);

// Purchase Manager: Get all components from components table
router.get('/components', authenticateToken, componentController.getAllComponents);

module.exports = router;
