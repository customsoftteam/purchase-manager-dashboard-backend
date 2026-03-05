// Quotation routes
const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { authenticateToken } = require('../controllers/authController');

// Quotation Routes (authenticated)
// Create purchase quotation
router.post('/purchase-quotation', authenticateToken, quotationController.createPurchaseQuotation);
// Vendor creates quotation
router.post('/vendor-quotation', authenticateToken, quotationController.createVendorQuotation);
// Get purchase quotation by ID
router.get('/purchase-quotation/:quotationId', authenticateToken, quotationController.getPurchaseQuotation);
// Get all purchase quotations
router.get('/purchase-quotations', authenticateToken, quotationController.getPurchaseQuotations);
// Update purchase quotation status
router.patch('/purchase-quotation/:quotationId', authenticateToken, quotationController.updatePurchaseQuotation);
// Vendor counter quotation
router.post('/counter-quotation', authenticateToken, quotationController.createCounterQuotation);
// Get all counter quotations
router.get('/counter-quotations', authenticateToken, quotationController.getCounterQuotations);
// Update counter quotation
router.patch('/counter-quotation/:counterId', authenticateToken, quotationController.updateCounterQuotation);

module.exports = router;
