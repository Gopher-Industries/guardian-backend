const mongoose = require('mongoose');
const Location = require('../models/Location');

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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nameOfBuilding
 *               - address
 *               - openingHours
 *               - contactNumber
 *             properties:
 *               nameOfBuilding:
 *                 type: string
 *                 example: Guardian Aged Care Melbourne
 *               address:
 *                 type: string
 *                 example: 123 Collins Street, Melbourne VIC
 *               openingHours:
 *                 type: string
 *                 example: Monday - Friday, 8:00 AM - 5:00 PM
 *               contactNumber:
 *                 type: string
 *                 example: +61 3 9123 4567
 *               numberOfDoctors:
 *                 type: integer
 *                 example: 10
 *               numberOfNurses:
 *                 type: integer
 *                 example: 25
 *               numberOfRooms:
 *                 type: integer
 *                 example: 40
 *               patientCapacity:
 *                 type: integer
 *                 example: 80
 *               currentOccupancy:
 *                 type: integer
 *                 example: 65
 *               equipment:
 *                 type: string
 *                 example: Wheelchairs, ECG Machine, Oxygen Tanks
 *               facilities:
 *                 type: string
 *                 example: Pharmacy, Physiotherapy, Emergency Room
 *               status:
 *                 type: string
 *                 enum:
 *                   - active
 *                   - inactive
 *                 example: active
 *     responses:
 *       201:
 *         description: Location created successfully.
 *       400:
 *         description: Missing required fields.
 *       500:
 *         description: Internal server error.
 */
exports.createLocation = async (req, res) => {
  try {
    const {
      nameOfBuilding,
      address,
      openingHours,
      contactNumber,
      numberOfDoctors,
      numberOfNurses,
      numberOfRooms,
      patientCapacity,
      currentOccupancy,
      equipment,
      facilities,
      status
    } = req.body;

    if (
      !nameOfBuilding ||
      !address ||
      !openingHours ||
      !contactNumber
    ) {
      return res.status(400).json({
        error: 'Please provide all required fields.'
      });
    }

    const newLocation = new Location({
      nameOfBuilding,
      address,
      openingHours,
      contactNumber,
      numberOfDoctors,
      numberOfNurses,
      numberOfRooms,
      patientCapacity,
      currentOccupancy,
      equipment,
      facilities,
      status
    });

    await newLocation.save();

    res.status(201).json({
      message: 'Location created successfully.',
      location: newLocation
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error creating location.',
      details: error.message
    });
  }
};
/**
 * @openapi
 * /api/v1/locations:
 *   get:
 *     tags:
 *       - Location
 *     summary: Get all locations
 *     description: Returns a list of all locations in the system.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Locations retrieved successfully.
 *       500:
 *         description: Internal server error.
 */
exports.getAllLocations = async (req, res) => {
  try {
    const locations = await Location.find().sort({ createdAt: -1 });

    res.status(200).json({
      message: 'Locations retrieved successfully.',
      total: locations.length,
      locations
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error retrieving locations.',
      details: error.message
    });
  }
};

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
 *         description: MongoDB ObjectId of the location
 *         example: "6890f1b123456789abcdef12"
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
exports.getLocationById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid location ID.'
      });
    }

    const location = await Location.findById(id);

    if (!location) {
      return res.status(404).json({
        error: 'Location not found.'
      });
    }

    res.status(200).json({
      message: 'Location retrieved successfully.',
      location
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error retrieving location.',
      details: error.message
    });
  }
};
/**
 * @openapi
 * /api/v1/locations/{id}:
 *   patch:
 *     tags:
 *       - Location
 *     summary: Update a location
 *     description: Updates an existing location using its MongoDB ObjectId.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the location
 *         example: "6890f1b123456789abcdef12"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nameOfBuilding:
 *                 type: string
 *               address:
 *                 type: string
 *               openingHours:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *               numberOfDoctors:
 *                 type: integer
 *               numberOfNurses:
 *                 type: integer
 *               numberOfRooms:
 *                 type: integer
 *               patientCapacity:
 *                 type: integer
 *               currentOccupancy:
 *                 type: integer
 *               equipment:
 *                 type: string
 *               facilities:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum:
 *                   - active
 *                   - inactive
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
exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid location ID.'
      });
    }

    const updatedLocation = await Location.findByIdAndUpdate(
      id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedLocation) {
      return res.status(404).json({
        error: 'Location not found.'
      });
    }

    res.status(200).json({
      message: 'Location updated successfully.',
      location: updatedLocation
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error updating location.',
      details: error.message
    });
  }
};

/**
 * @openapi
 * /api/v1/locations/{id}:
 *   delete:
 *     tags:
 *       - Location
 *     summary: Delete a location
 *     description: Deletes a location using its MongoDB ObjectId.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the location
 *         example: "6890f1b123456789abcdef12"
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
exports.deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid location ID.'
      });
    }

    const deletedLocation = await Location.findByIdAndDelete(id);

    if (!deletedLocation) {
      return res.status(404).json({
        error: 'Location not found.'
      });
    }

    res.status(200).json({
      message: 'Location deleted successfully.'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error deleting location.',
      details: error.message
    });
  }
};