// Order routes
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken } = require('../controllers/authController');


// Purchase Order Specific Routes (authenticated)
router.post('/orders', authenticateToken, orderController.createPurchaseOrder);
router.get('/orders/:orderId', authenticateToken, orderController.getPurchaseOrder);
router.get('/purchase-orders', authenticateToken, orderController.getPurchaseOrders);
router.put('/orders/:orderId/status', authenticateToken, orderController.updatePurchaseOrderStatus);
router.put('/orders/:orderId/confirm', authenticateToken, orderController.vendorConfirmOrder);
router.delete('/orders/:orderId', authenticateToken, orderController.deletePurchaseOrder);

module.exports = router;
