

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
 *     description: Adds a new medication to the medications table.
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
 *     responses:
 *       200:
 *         description: Test successful
 *       500:
 *         description: Internal server error
 */
router.post('/', meds2Controller.registerMeds2); 

/**
 * @openapi
 * /api/v1/add-medication/{id}:
 *   delete:
 *     tags:
 *       - Prescription
 *     summary: Deletes a medication record by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the medication to delete
 *     responses:
 *       200:
 *         description: Medication deleted successfully
 *       404:
 *         description: Medication not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', meds2Controller.deleteMedication);

module.exports = router;
