const express = require('express');

const router = express.Router();

const clinicController = require('../controllers/clinicController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

router.use(verifyToken);


/**
 * @swagger
 * tags:
 *   - name: Clinics
 *     description: Clinic management
 */


/**
 * @swagger
 * /api/v1/clinics:
 *   post:
 *     summary: Create a clinic
 *     tags: [Clinics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               location:
 *                 type: string
 *               rooms:
 *                 type: string
 *               organization:
 *                 type: string
 *               title:
 *                 type: string
 *                 example: "Guardian Clinic"
 *               description:
 *                 type: string
 *                 example: "General medical clinic"
 *     responses:
 *       201:
 *         description: Clinic created successfully
 *       400:
 *         description: Clinic title is required
 */
router.post(
  '/',
  verifyRole('admin'),
  clinicController.createClinic
);


/**
 * @swagger
 * /api/v1/clinics:
 *   get:
 *     summary: Get all clinics
 *     tags: [Clinics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Clinics returned successfully
 */
router.get(
  '/',
  clinicController.getClinics
);


/**
 * @swagger
 * /api/v1/clinics/search:
 *   get:
 *     summary: Search clinic by name
 *     tags: [Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         example: "Guardian"
 *     responses:
 *       200:
 *         description: Clinics returned successfully
 *       400:
 *         description: Clinic name is required
 */
router.get(
  '/search',
  clinicController.searchClinicByName
);


/**
 * @swagger
 * /api/v1/clinics/{id}:
 *   get:
 *     summary: Get clinic by ID
 *     tags: [Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Clinic returned successfully
 *       404:
 *         description: Clinic not found
 */
router.get(
  '/:id',
  clinicController.getClinicById
);


/**
 * @swagger
 * /api/v1/clinics/{id}:
 *   patch:
 *     summary: Update clinic
 *     tags: [Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: string
 *               rooms:
 *                 type: string
 *               organization:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Clinic updated successfully
 *       404:
 *         description: Clinic not found
 */
router.patch(
  '/:id',
  verifyRole('admin'),
  clinicController.updateClinic
);


/**
 * @swagger
 * /api/v1/clinics/{id}:
 *   delete:
 *     summary: Delete clinic
 *     tags: [Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Clinic deleted successfully
 *       404:
 *         description: Clinic not found
 */
router.delete(
  '/:id',
  verifyRole('admin'),
  clinicController.deleteClinic
);


module.exports = router;