'use strict';

const express = require('express');
const router = express.Router();

const locationController = require('../controllers/locationController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');

/**
 * @openapi
 * /api/v1/locations:
 *   post:
 *     tags:
 *       - Location
 *     summary: Create a new location
 *     description: Creates a new location and stores it in the database.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Location created successfully.
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
  locationController.createLocation
);

/**
 * @openapi
 * /api/v1/locations:
 *   get:
 *     tags:
 *       - Location
 *     summary: Get all locations
 *     description: Returns all locations in the system.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Locations retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/',
  verifyToken,
  locationController.getAllLocations
);

/**
 * @openapi
 * /api/v1/locations/{id}:
 *   get:
 *     tags:
 *       - Location
 *     summary: Get a location by ID
 *     description: Returns a single location using its MongoDB ObjectId.
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
 *         description: Location retrieved successfully.
 *       400:
 *         description: Invalid location ID.
 *       404:
 *         description: Location not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/:id',
  verifyToken,
  locationController.getLocationById
);

/**
 * @openapi
 * /api/v1/locations/{id}:
 *   patch:
 *     tags:
 *       - Location
 *     summary: Update a location
 *     description: Updates an existing location.
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
 *         description: Location updated successfully.
 *       400:
 *         description: Invalid location ID.
 *       404:
 *         description: Location not found.
 *       500:
 *         description: Internal server error.
 */
router.patch(
  '/:id',
  verifyToken,
  verifyRole(['admin']),
  locationController.updateLocation
);

/**
 * @openapi
 * /api/v1/locations/{id}:
 *   delete:
 *     tags:
 *       - Location
 *     summary: Delete a location
 *     description: Deletes a location from the database.
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
 *         description: Location deleted successfully.
 *       400:
 *         description: Invalid location ID.
 *       404:
 *         description: Location not found.
 *       500:
 *         description: Internal server error.
 */
router.delete(
  '/:id',
  verifyToken,
  verifyRole(['admin']),
  locationController.deleteLocation
);

module.exports = router;