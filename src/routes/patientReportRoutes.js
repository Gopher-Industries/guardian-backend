const express = require('express');
const router = express.Router();
const patientReportController = require('../controllers/patientReportController');
const verifyToken = require('../middleware/verifyToken');

// CRUD APIs for Patient Reports
router.post('/', verifyToken, patientReportController.createReport); // Create a patient report
router.get('/', verifyToken, patientReportController.getAllReports); // Get all reports
router.get('/:reportId', verifyToken, patientReportController.getReportById); // Get a specific report
router.put('/:reportId', verifyToken, patientReportController.updateReport); // Update a report
router.delete('/:reportId', verifyToken, patientReportController.deleteReport); // Delete a report

module.exports = router;
