// Payment routes
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../controllers/authController');

// Payment Routes (authenticated)
router.post('/payments', authenticateToken, paymentController.createPayment);
router.get('/payments/:paymentId', authenticateToken, paymentController.getPayment);
router.get('/payments', authenticateToken, paymentController.getPayments);
router.put('/payments/:paymentId/complete', authenticateToken, paymentController.completePayment);
router.put('/payments/:paymentId/fail', authenticateToken, paymentController.failPayment);
router.put('/payments/:paymentId/receipt', authenticateToken, paymentController.sendPaymentReceipt);
router.get('/payments/order/:orderId/summary', authenticateToken, paymentController.getOrderPaymentSummary);

module.exports = router;
