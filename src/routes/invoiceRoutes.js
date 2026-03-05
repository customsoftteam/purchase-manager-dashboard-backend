const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authenticateToken } = require('../controllers/authController');

// Create invoice
router.post('/invoices', authenticateToken, invoiceController.createInvoice);

// Get invoice by ID
router.get('/invoices/:invoiceId', authenticateToken, invoiceController.getInvoice);

// Get all invoices
router.get('/invoices', authenticateToken, invoiceController.getInvoices);

// Mark invoice as received
router.patch('/invoices/:invoiceId/received', authenticateToken, invoiceController.markInvoiceReceived);

// Accept invoice
router.patch('/invoices/:invoiceId/accept', authenticateToken, invoiceController.acceptInvoice);

// Reject invoice
router.patch('/invoices/:invoiceId/reject', authenticateToken, invoiceController.rejectInvoice);

// Mark invoice as paid
router.patch('/invoices/:invoiceId/paid', authenticateToken, invoiceController.markInvoicePaid);

// Get invoice summary
router.get('/invoices/:invoiceId/summary', authenticateToken, invoiceController.getInvoiceSummary);

module.exports = router;
