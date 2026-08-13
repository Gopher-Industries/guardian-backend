const router = express.Router();
const medsController =require('.. /controllers/medsController');
const express = require('express');


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
 *             Name_of_Medication: "oxy-diphosphate"
 *             Doses_sizes: "2.5 mg"
 *             Company: "panadol ltd"
 *             What_it_does: "antibioits, it kills bacterior"
 *             Potential_Side_Effects: "may cause drowsyness"
 *             Directions:  "take twice daily or as directed by doctor"
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
router.post('/add-medication', medsController.registerMeds); 
module.exports = router;