// Inventory routes
const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// Inventory Routes
router.post('/inventory', inventoryController.updateInventory);
router.get('/inventory', inventoryController.getAllInventory);
router.get('/inventory/:productId', inventoryController.getProductInventory);
router.post('/inventory/reserve', inventoryController.reserveInventory);
router.get('/inventory/low-stock', inventoryController.getLowStockProducts);

module.exports = router;
