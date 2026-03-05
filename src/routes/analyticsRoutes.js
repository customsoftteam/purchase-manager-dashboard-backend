// Analytics routes for purchase manager
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../controllers/authController');

router.get('/analytics/purchase-manager', authenticateToken, analyticsController.getPurchaseManagerAnalytics);

module.exports = router;
