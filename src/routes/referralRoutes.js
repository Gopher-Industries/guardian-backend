const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');

/**
 * @openapi
 * /api/v1/referral:
 *   post:
 *     tags:
 *       - Referal
 *     summary: Upload a referal to the database.
 *     description: >
 *       Uploads a referal to the patient database
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           example:
 *             patientId: "6a3f8ea9c14556091e6e0e50"
 *             filePath: "D:/git/Guardian-backend/sample_doctors_referral.pdf" 
 *             
 *
 *       400:
 *         description: Validation error (missing fields, invalid email, weak password)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "Validation failed: email is required."
 *      
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', referralController.HandleFileUpload);
module.exports = router;