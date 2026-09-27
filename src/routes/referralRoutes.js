const express = require('express');
const router = express.Router();

const {
  generateReferralPdf
} = require('../controllers/referralController');

/**
 * @openapi
 * /api/v1/referral/pdf:
 *   post:
 *     tags:
 *       - REFERRAL
 *     summary: Generate a referral PDF
 *     description: Generates a medical referral PDF and returns it as a downloadable PDF file.
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - data
 *             properties:
 *               patientId:
 *                 type: string
 *                 example: "6a3f8ea9c14556091e6e0e50"
 *
 *               fileName:
 *                 type: string
 *                 example: "referral.pdf"
 *
 *               data:
 *                 type: object
 *                 required:
 *                   - referralDate
 *                   - specialist
 *                   - patient
 *                   - clinicalDetails
 *                   - investigations
 *                   - reasonForReferral
 *                   - referringDoctor
 *
 *                 properties:
 *                   referralDate:
 *                     type: string
 *                     example: "2026-09-26"
 *
 *                   specialist:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Dr Sarah Smith"
 *                       department:
 *                         type: string
 *                         example: "Cardiology"
 *                       hospital:
 *                         type: string
 *                         example: "Melbourne Hospital"
 *                       addressLine1:
 *                         type: string
 *                         example: "123 Example Street"
 *                       addressLine2:
 *                         type: string
 *                         example: "Melbourne VIC 3000"
 *                       salutation:
 *                         type: string
 *                         example: "Dr Smith"
 *
 *                   patient:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "John Smith"
 *                       dateOfBirth:
 *                         type: string
 *                         example: "1950-05-15"
 *                       phone:
 *                         type: string
 *                         example: "0400000000"
 *                       email:
 *                         type: string
 *                         example: "john@example.com"
 *
 *                   clinicalDetails:
 *                     type: object
 *                     properties:
 *                       presentingComplaint:
 *                         type: string
 *                         example: "Persistent chest discomfort"
 *                       duration:
 *                         type: string
 *                         example: "Two weeks"
 *                       relevantFindings:
 *                         type: string
 *                         example: "Elevated blood pressure"
 *                       pastMedicalHistory:
 *                         type: string
 *                         example: "Hypertension"
 *                       currentMedications:
 *                         type: string
 *                         example: "Amlodipine 5mg"
 *
 *                   investigations:
 *                     type: object
 *                     properties:
 *                       recentTests:
 *                         type: string
 *                         example: "ECG and blood tests"
 *                       results:
 *                         type: string
 *                         example: "Further specialist review recommended"
 *
 *                   reasonForReferral:
 *                     type: string
 *                     example: "Cardiology assessment and management"
 *
 *                   referringDoctor:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Dr Michael Brown"
 *                       title:
 *                         type: string
 *                         example: "General Practitioner"
 *                       phone:
 *                         type: string
 *                         example: "0390000000"
 *                       clinic:
 *                         type: string
 *                         example: "Guardian Medical Clinic"
 *
 *     responses:
 *       200:
 *         description: Referral PDF generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *
 *       400:
 *         description: Missing or invalid referral information
 *
 *       404:
 *         description: Patient not found
 *
 *       500:
 *         description: Failed to generate referral PDF
 */

router.post(
  '/pdf',
  generateReferralPdf
);

module.exports = router;