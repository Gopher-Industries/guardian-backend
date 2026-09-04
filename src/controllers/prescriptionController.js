const mongoose = require('mongoose');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const notifyRules = require('../services/notifyRules');


exports.createPrescription = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        error: 'Unauthorized: missing user context'
      });
    }

    const { patientId, patientName, items, notes, medicationName, dose, howMany, timesPerDay, timesOfDay, comment   } = req.body;

    if (!patientId && !patientName) {
      return res.status(400).json({
        error: 'Either patientId or patientName is required'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'At least one prescription item is required'
      });
    }

    for (const [i, it] of items.entries()) {
      if (!it?.name || !it?.dose || !it?.frequency || !it?.durationDays) {
        return res.status(400).json({
          error: `Item ${i + 1} missing required fields: name, dose, frequency, durationDays`
        });
      }

      if (typeof it.name !== 'string' || !it.name.trim()) {
        return res.status(400).json({
          error: `Item ${i + 1}: medicine name is required and cannot be empty`
        });
      }

      if (typeof it.dose !== 'string' || !it.dose.trim()) {
        return res.status(400).json({
          error: `Item ${i + 1}: dose is required`
        });
      }

      const doseNum = parseFloat(it.dose.replace(/[^0-9.-]+/g, ''));
      if (isNaN(doseNum) || doseNum <= 0) {
        return res.status(400).json({
          error: `Item ${i + 1}: dose must be a positive number`
        });
      }

      if (typeof it.frequency !== 'string' || !it.frequency.trim()) {
        return res.status(400).json({
          error: `Item ${i + 1}: frequency is required`
        });
      }

      if (!Number.isInteger(it.durationDays) || it.durationDays <= 0) {
        return res.status(400).json({
          error: `Item ${i + 1}: durationDays must be a positive integer`
        });
      }

      if (
        it.quantity !== undefined &&
        (!Number.isInteger(it.quantity) || it.quantity <= 0)
      ) {
        return res.status(400).json({
          error: `Item ${i + 1}: quantity must be a positive integer`
        });
      }
    }

    let patient = null;

    if (patientId) {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({
          error: 'Invalid patientId format'
        });
      }

      patient = await Patient.findById(patientId);
    } else if (patientName) {
      patient = await Patient.findOne({
        fullname: patientName,
        isDeleted: { $ne: true }
      });
    }

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    const prescription = await Prescription.create({
      patient: patient._id,
      prescriber: req.user._id,
      items,
      notes,
      status: 'active',
      medicationName,
      dose,
      howMany,
      timesPerDay,
      timesOfDay,
      comment  
    });

    // Trigger notifications based on rules
    Promise.resolve(
      notifyRules.prescriptionCreated({
        prescriptionId: prescription._id,
        patientId: patient._id,
      })
    ).catch(() => {});

    return res.status(201).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error creating prescription',
      details: err.message
    });
  }
};


exports.getPrescriptionById = async (req, res) => {
  try {

    if (!req.user?._id) {
      return res.status(401).json({
        error: 'Unauthorized: missing user context'
      });
    }

    const prescription = await Prescription.findById(req.params.id)
      .populate('patient', 'fullname gender dateOfBirth')
      .populate('prescriber', 'fullname email')   // <-- FIX here
      .lean();

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    const userId = String(req.user._id);
    const userRole = req.user.role;
    const userOrganisation = req.user.organisation
      ? String(req.user.organisation)
      : null;

    const prescriberId = prescription.prescriber?._id
      ? String(prescription.prescriber._id)
      : null;

    const patientOrganisation = prescription.patient?.organisation
      ? String(prescription.patient.organisation)
      : null;

    const canRead =
      userRole === 'admin' ||
      prescriberId === userId ||
      (userOrganisation &&
        patientOrganisation &&
        userOrganisation === patientOrganisation);

    if (!canRead) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    return res.status(200).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error fetching prescription',
      details: err.message
    });
  }
};

exports.updatePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const prescription = await Prescription.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription not found'
      });
    }

    return res.status(200).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error updating prescription',
      details: err.message
    });
  }
};


exports.discontinuePrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findByIdAndUpdate(
      id,
      { status: 'discontinued' },
      { new: true }
    );

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription not found'
      });
    }

    return res.status(200).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error discontinuing prescription',
      details: err.message
    });
  }
};


exports.deletePrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findByIdAndDelete(id);

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription not found'
      });
    }

    return res.status(200).json({
      message: 'Prescription deleted successfully',
      prescription
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Error deleting prescription',
      details: err.message
    });
  }
};


exports.listPrescriptionsForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({
        error: 'Invalid patientId format'
      });
    }

    const filter = { patient: patientId };
    if (status) {
      filter.status = status;
    }

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    const [prescriptions, total] = await Promise.all([
      Prescription.find(filter)
        .populate('prescriber', 'fullname email')
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .lean(),
      Prescription.countDocuments(filter)
    ]);

    return res.status(200).json({
      prescriptions,
      pagination: {
        total,
        page: parsedPage,
        pages: Math.ceil(total / parsedLimit),
        limit: parsedLimit
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Error listing prescriptions',
      details: err.message
    });
  }
};
