// Legacy company request routes (kept for compatibility)
const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');

// Company Request Routes
const { authenticateToken } = require('../controllers/authController');

router.post('/requests', authenticateToken, requestController.createRequest);
router.get('/requests', authenticateToken, requestController.getAllRequests);
router.get('/requests/company/:companyId', authenticateToken, requestController.getCompanyRequests);
router.put('/requests/:id', authenticateToken, requestController.updateRequestStatus);
router.delete('/requests/:id', authenticateToken, requestController.deleteRequest);

module.exports = router;
