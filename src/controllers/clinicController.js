const Clinic = require('../models/Clinic');


// Create clinic
exports.createClinic = async (req, res) => {
  try {
    const {
      location,
      rooms,
      organization,
      title,
      description
    } = req.body;

    if (!title) {
      return res.status(400).json({
        message: 'Clinic title is required'
      });
    }

    const clinic = await Clinic.create({
      location,
      rooms,
      organization,
      title,
      description
    });

    return res.status(201).json({
      message: 'Clinic created successfully',
      clinic
    });

  } catch (error) {
    return res.status(500).json({
      message: 'Error creating clinic',
      details: error.message
    });
  }
};


// Get all clinics
exports.getClinics = async (req, res) => {
  try {
    const clinics = await Clinic.find();

    return res.status(200).json(clinics);

  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching clinics',
      details: error.message
    });
  }
};


// Search clinic by name
exports.searchClinicByName = async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({
        message: 'Clinic name is required'
      });
    }

    const clinics = await Clinic.find({
      title: {
        $regex: name,
        $options: 'i'
      }
    });

    return res.status(200).json(clinics);

  } catch (error) {
    return res.status(500).json({
      message: 'Error searching clinics',
      details: error.message
    });
  }
};


// Get clinic by ID
exports.getClinicById = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);

    if (!clinic) {
      return res.status(404).json({
        message: 'Clinic not found'
      });
    }

    return res.status(200).json(clinic);

  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching clinic',
      details: error.message
    });
  }
};


// Update clinic
exports.updateClinic = async (req, res) => {
  try {
    const clinic = await Clinic.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!clinic) {
      return res.status(404).json({
        message: 'Clinic not found'
      });
    }

    return res.status(200).json({
      message: 'Clinic updated successfully',
      clinic
    });

  } catch (error) {
    return res.status(500).json({
      message: 'Error updating clinic',
      details: error.message
    });
  }
};


// Delete clinic
exports.deleteClinic = async (req, res) => {
  try {
    const clinic = await Clinic.findByIdAndDelete(req.params.id);

    if (!clinic) {
      return res.status(404).json({
        message: 'Clinic not found'
      });
    }

    return res.status(200).json({
      message: 'Clinic deleted successfully'
    });

  } catch (error) {
    return res.status(500).json({
      message: 'Error deleting clinic',
      details: error.message
    });
  }
};