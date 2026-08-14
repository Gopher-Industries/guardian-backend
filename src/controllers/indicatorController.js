'use strict';

const Indicator = require('../models/Indicator');
const Patient = require('../models/Patient');

/* --------------------------- Helper Functions --------------------------- */

const sendControllerError = (res, err, fallbackMessage) => {
  if (err?.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage, details: err.message });
};

/* ---------------------------------------------------------------------- */

exports.createIndicator = async (req, res) => {
  try {
    const { patient, careplan, indicator_type, severity, notes } = req.body || {};

    if (!patient || !indicator_type) {
      return res.status(400).json({ message: 'patient and indicator_type are required' });
    }

    const patientDoc = await Patient.findById(patient);
    if (!patientDoc) return res.status(404).json({ message: 'Patient not found' });

    const indicator = await Indicator.create({
      patient,
      careplan: careplan || null,
      indicator_type,
      severity,
      notes,
      recorded_by: req.user._id
    });

    return res.status(201).json({ message: 'Indicator recorded', indicator });
  } catch (err) {
    return sendControllerError(res, err, 'Error creating indicator');
  }
};

/* ---------------------------------------------------------------------- */

exports.listIndicators = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = status ? { status } : {};

    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [indicators, total] = await Promise.all([
      Indicator.find(filter)
        .populate('patient', 'fullname')
        .populate('recorded_by', 'fullname email')
        .populate('actions.performed_by', 'fullname email')
        .sort({ created_at: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Indicator.countDocuments(filter)
    ]);

    return res.status(200).json({
      indicators,
      pagination: { total, page: p, pages: Math.ceil(total / l), limit: l }
    });
  } catch (err) {
    return sendControllerError(res, err, 'Error listing indicators');
  }
};

/* ---------------------------------------------------------------------- */

exports.listByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    const indicators = await Indicator.find({ patient: patientId })
      .populate('recorded_by', 'fullname email')
      .populate('actions.performed_by', 'fullname email')
      .sort({ created_at: -1 });

    return res.status(200).json({ indicators });
  } catch (err) {
    return sendControllerError(res, err, 'Error fetching indicators for patient');
  }
};

/* ---------------------------------------------------------------------- */

exports.getIndicator = async (req, res) => {
  try {
    const { id } = req.params;

    const indicator = await Indicator.findById(id)
      .populate('patient', 'fullname')
      .populate('recorded_by', 'fullname email')
      .populate('actions.performed_by', 'fullname email');

    if (!indicator) return res.status(404).json({ message: 'Indicator not found' });

    return res.status(200).json({ indicator });
  } catch (err) {
    return sendControllerError(res, err, 'Error fetching indicator');
  }
};

/* ---------------------------------------------------------------------- */

exports.updateIndicator = async (req, res) => {
  try {
    const { id } = req.params;
    const { severity, status, notes } = req.body || {};

    const updates = {};
    if (severity) updates.severity = severity;
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const indicator = await Indicator.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!indicator) return res.status(404).json({ message: 'Indicator not found' });

    return res.status(200).json({ message: 'Indicator updated', indicator });
  } catch (err) {
    return sendControllerError(res, err, 'Error updating indicator');
  }
};

/* ---------------------------------------------------------------------- */

exports.addAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action_type, description, outcome_notes } = req.body || {};

    if (!action_type) {
      return res.status(400).json({ message: 'action_type is required' });
    }

    const indicator = await Indicator.findById(id);
    if (!indicator) return res.status(404).json({ message: 'Indicator not found' });

    indicator.actions.push({
      action_type,
      description,
      outcome_notes,
      performed_by: req.user._id
    });

    await indicator.save();

    return res.status(201).json({ message: 'Action recorded', indicator });
  } catch (err) {
    return sendControllerError(res, err, 'Error adding action');
  }
};

/* ---------------------------------------------------------------------- */

exports.deleteIndicator = async (req, res) => {
  try {
    const { id } = req.params;

    const indicator = await Indicator.findByIdAndDelete(id);
    if (!indicator) return res.status(404).json({ message: 'Indicator not found' });

    return res.status(200).json({ message: 'Indicator deleted' });
  } catch (err) {
    return sendControllerError(res, err, 'Error deleting indicator');
  }
};