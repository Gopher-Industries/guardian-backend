const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');


/**
 * @openapi
 * /api/v1/test:
 *   post:
 *     tags:
 *       - TEST
 *     summary: test
 *     description: >
 *       This is a test.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           example:
 *             test_var_1: "test" 
 *             test_var_2: "test 2"
 *            
 *     responses:
 *       201:
 *         description: Test worked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: Test worked
 *     
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', testController.Test);
module.exports = router;


