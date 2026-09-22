'use strict';

const express = require('express');
const router = express.Router();

const correspondenceController = require('../controllers/correspondenceController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * @openapi
 * /api/v1/correspondence:
 *   post:
 *     tags:
 *       - Correspondence
 *     summary: Create a new correspondence document
 *     description: Creates a new correspondence document and stores it in the database.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Correspondence created successfully.
 *       400:
 *         description: Invalid request.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post(
    '/',
    verifyToken,
    verifyRole(['admin']),
    correspondenceController.createCorrespondence
);

/**
 * @openapi
 * /api/v1/correspondence/patient/{patientId}:
 *   get:
 *     tags:
 *       - Correspondence
 *     summary: Get all correspondence for a patient
 *     description: Returns all correspondence records linked to a patient.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Correspondence retrieved successfully.
 *       400:
 *         description: Invalid patient ID.
 *       404:
 *         description: Patient not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
    '/patient/:patientId',
    verifyToken,
    correspondenceController.getCorrespondenceByPatient
);

/**
 * @openapi
 * /api/v1/correspondence/staff/{staffId}:
 *   get:
 *     tags:
 *       - Correspondence
 *     summary: Get all correspondence created by a staff member
 *     description: Returns all correspondence records linked to a staff member.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Correspondence retrieved successfully.
 *       400:
 *         description: Invalid staff ID.
 *       404:
 *         description: Staff not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
    '/staff/:staffId',
    verifyToken,
    correspondenceController.getCorrespondenceByStaff
);

/**
 * @openapi
 * /api/v1/correspondence/{correspondenceId}:
 *   get:
 *     tags:
 *       - Correspondence
 *     summary: Get correspondence by ID
 *     description: Returns a correspondence document using its ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: correspondenceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Correspondence retrieved successfully.
 *       400:
 *         description: Invalid correspondence ID.
 *       404:
 *         description: Correspondence not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
    '/:correspondenceId',
    verifyToken,
    correspondenceController.getCorrespondenceById
);

/**
 * @openapi
 * /api/v1/correspondence/{correspondenceId}:
 *   patch:
 *     tags:
 *       - Correspondence
 *     summary: Update a correspondence document
 *     description: Updates an existing correspondence document.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: correspondenceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Correspondence updated successfully.
 *       400:
 *         description: Invalid correspondence ID.
 *       404:
 *         description: Correspondence not found.
 *       500:
 *         description: Internal server error.
 */
router.patch(
    '/:correspondenceId',
    verifyToken,
    verifyRole(['admin']),
    correspondenceController.updateCorrespondence
);

/**
 * @openapi
 * /api/v1/correspondence/{correspondenceId}:
 *   delete:
 *     tags:
 *       - Correspondence
 *     summary: Delete a correspondence document
 *     description: Deletes a correspondence document from the database.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: correspondenceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Correspondence deleted successfully.
 *       400:
 *         description: Invalid correspondence ID.
 *       404:
 *         description: Correspondence not found.
 *       500:
 *         description: Internal server error.
 */
router.delete(
    '/:correspondenceId',
    verifyToken,
    verifyRole(['admin']),
    correspondenceController.deleteCorrespondence
);

module.exports = router;