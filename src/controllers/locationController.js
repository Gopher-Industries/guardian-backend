const Location = require('../models/Location');

// Add a location to an organization
const addLocation = async (req, res) => {
  try {
    const location = await Location.create({
      name: req.body.name,
      organizationId: req.params.organizationId,
      organizationType: req.body.organizationType,
      address: req.body.address,
      description: req.body.description,
      patientCapacity: req.body.patientCapacity,
      currentPatients: req.body.currentPatients,
      facilities: req.body.facilities,
      phone: req.body.phone,
      status: req.body.status,
    });

    res.status(201).json({
      success: true,
      message: 'Location added successfully',
      location,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all locations for one organization
const getOrganizationLocations = async (req, res) => {
  try {
    const locations = await Location.find({
      organizationId: req.params.organizationId,
    });

    res.status(200).json({
      success: true,
      count: locations.length,
      locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get one location
const getLocation = async (req, res) => {
  try {
    const location = await Location.findById(
      req.params.locationId
    );

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    res.status(200).json({
      success: true,
      location,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Edit a location
const editLocation = async (req, res) => {
  try {
    const location = await Location.findById(
      req.params.locationId
    );

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    // Organization ID cannot be changed here
    const updates = { ...req.body };
    delete updates.organizationId;

    Object.assign(location, updates);

    await location.save();

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      location,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a location
const deleteLocation = async (req, res) => {
  try {
    const location = await Location.findByIdAndDelete(
      req.params.locationId
    );

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Location deleted successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  addLocation,
  getOrganizationLocations,
  getLocation,
  editLocation,
  deleteLocation,
};