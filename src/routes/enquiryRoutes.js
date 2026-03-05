const express = require('express');
const router = express.Router();
const enquiryController = require('../controllers/enquiryController');
const { authenticateToken } = require('../controllers/authController');

// Create purchase enquiry (authenticated)
router.post('/purchase-enquiry', authenticateToken, enquiryController.createPurchaseEnquiry);
// Get purchase enquiry by ID (authenticated)
router.get('/purchase-enquiry/:enquiryId', authenticateToken, enquiryController.getPurchaseEnquiry);
// Get all purchase enquiries (authenticated)
router.get('/purchase-enquiries', authenticateToken, enquiryController.getPurchaseEnquiries);
// Update purchase enquiry status (authenticated)
router.patch('/purchase-enquiry/:enquiryId', authenticateToken, enquiryController.updatePurchaseEnquiry);
// Reject purchase enquiry (authenticated)
router.patch('/purchase-enquiry/:enquiryId/reject', authenticateToken, enquiryController.rejectPurchaseEnquiry);
// Delete purchase enquiry (authenticated)
router.delete('/purchase-enquiry/:enquiryId', authenticateToken, enquiryController.deletePurchaseEnquiry);

module.exports = router;
