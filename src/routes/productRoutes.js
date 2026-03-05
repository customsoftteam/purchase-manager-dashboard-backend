// Product routes
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken } = require('../controllers/authController');

// Product Routes (authenticated)
router.post('/products', authenticateToken, productController.createProduct);
router.get('/products', authenticateToken, productController.getAllProducts);
router.get('/products/:id', authenticateToken, productController.getProduct);
router.put('/products/:id', authenticateToken, productController.updateProduct);
router.delete('/products/:id', authenticateToken, productController.deleteProduct);

// Price Update Routes
router.post('/products/price/update', authenticateToken, productController.updateDailyPrice);
router.get('/products/:productId/price-history', authenticateToken, productController.getPriceHistory);

// Purchase Manager routes for vendor products
router.get('/purchase-manager/vendor-products', authenticateToken, productController.getAllVendorProducts);

module.exports = router;