

const express = require('express');
const router = express.Router();
const meds2Controller = require('../controllers/meds2Controller');
/**
 * @openapi
 * /api/v1/add-medication:
 *   post:
 *     tags:
 *       - Prescription
 *     summary: Adds a new medication to the medications table
 *     description: >
 *       Adds a new medication to the medications table.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           example:
 *             Name_of_Medication: "amoxicillin"
 *             Doses_sizes: "500 mg"
 *             Company: "GSK"
 *             What_it_does: "antibiotic, it treats bacterial infections"
 *             Potential_Side_Effects: "may cause nausea, diarrhea, or stomach upset"
 *             Directions:  "1 tablet 3 times per day or as doctor advises, take after food"
 *             
 * 
 *     responses:
 *       200:
 *         description: Test successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: Test worked
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', meds2Controller.registerMeds2); 
module.exports = router;