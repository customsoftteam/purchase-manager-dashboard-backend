// LOI routes
const express = require('express');
const router = express.Router();
const loiController = require('../controllers/loiController');
const { authenticateToken } = require('../controllers/authController');

// LOI Routes (authenticated)
router.post('/lois', authenticateToken, loiController.createLOI);
router.get('/lois', authenticateToken, loiController.getAllLOIs);
router.get('/lois/:id', authenticateToken, loiController.getLOI);
router.patch('/lois/:id', authenticateToken, loiController.updateLOI);
router.put('/vendor/loi/:loiId/accept', authenticateToken, loiController.acceptLOI);
router.put('/vendor/loi/:loiId/reject', authenticateToken, loiController.rejectLOI);
// router.get('/lois/company/:companyId', loiController.getCompanyLOIs);
// router.put('/lois/:id', loiController.updateLOIStatus);

module.exports = router;
