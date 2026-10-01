const express = require('express');
const router = express.Router();
const {
  createBilling,
  getBillingById,
  getAllBillings,
  updateBilling,
  deleteBilling
} = require('../controllers/billingController');

/**
 * @swagger
 * /api/v1/billing:
 *   post:
 *     summary: Create a new billing record
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - service_rendered
 *               - payee_name
 *               - payer_name
 *               - amount_owed
 *             properties:
 *               patientId:
 *                 type: string
 *                 example: 64f1a2b3c4d5e6f7a8b9c0d1
 *               service_rendered:
 *                 type: string
 *                 example: Physiotherapy session
 *               payee_name:
 *                 type: string
 *                 example: Gopher Physiotherapy Clinic
 *               payer_name:
 *                 type: string
 *                 example: Medicare
 *               amount_owed:
 *                 type: number
 *                 example: 120.00
 *               payment_status:
 *                 type: string
 *                 enum: [sent, received, paid, rejected]
 *     responses:
 *       201:
 *         description: Billing record created successfully
 *       400:
 *         description: Invalid input / validation error
 */
router.post('/', createBilling);

/**
 * @swagger
 * /api/v1/billing:
 *   get:
 *     summary: Get all billing records
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: List of billing records
 *       500:
 *         description: Server error
 */
router.get('/', getAllBillings);

/**
 * @swagger
 * /api/v1/billing/{id}:
 *   get:
 *     summary: Get a single billing record by ID
 *     tags: [Billing]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Billing record found
 *       404:
 *         description: Billing record not found
 */
router.get('/:id', getBillingById);

/**
 * @swagger
 * /api/v1/billing/{id}:
 *   put:
 *     summary: Update a billing record by ID
 *     tags: [Billing]
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
 *               payment_status:
 *                 type: string
 *                 enum: [sent, received, paid, rejected]
 *               amount_owed:
 *                 type: number
 *     responses:
 *       200:
 *         description: Billing record updated successfully
 *       404:
 *         description: Billing record not found
 *       400:
 *         description: Invalid input / validation error
 */
router.put('/:id', updateBilling);

/**
 * @swagger
 * /api/v1/billing/{id}:
 *   delete:
 *     summary: Delete a billing record by ID
 *     tags: [Billing]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Billing record deleted successfully
 *       404:
 *         description: Billing record not found
 */
router.delete('/:id', deleteBilling);

module.exports = router;
