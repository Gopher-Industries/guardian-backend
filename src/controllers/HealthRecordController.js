const mongoose = require('mongoose');
const HealthRecord = require('../models/HealthRecord');
const Patient = require('../models/Patient');
const User = require('../models/User');

const validatePatientId = (patientId, res) => {
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    res.status(400).json({ error: 'Invalid patientId format' });
    return false;
  }

  return true;
};

const parseVitals = (vitals = {}) => {
  const { bloodPressure, temperature, heartRate, respiratoryRate } = vitals;

  if (
    bloodPressure == null ||
    temperature == null ||
    heartRate == null ||
    respiratoryRate == null
  ) {
    return { error: 'vitals must include bloodPressure, temperature, heartRate, and respiratoryRate' };
  }

  const normalizedVitals = {
    bloodPressure: String(bloodPressure).trim(),
    temperature: Number(temperature),
    heartRate: Number(heartRate),
    respiratoryRate: Number(respiratoryRate),
  };

  if (
    !normalizedVitals.bloodPressure ||
    Number.isNaN(normalizedVitals.temperature) ||
    Number.isNaN(normalizedVitals.heartRate) ||
    Number.isNaN(normalizedVitals.respiratoryRate)
  ) {
    return { error: 'Vitals contain invalid values' };
  }

  return { vitals: normalizedVitals };
};

const resolveCareTeam = async (patient, userId) => {
  const caretakerId = patient.caretaker;
  let nurseId = patient.assignedNurses?.[0] || null;

  if (userId) {
    const actor = await User.findById(userId).populate('role', 'name');
    const actorRole = actor?.role?.name;

    if (actorRole === 'nurse') {
      nurseId = actor._id;

      const isAssigned = (patient.assignedNurses || []).some(
        assignedNurseId => String(assignedNurseId) === String(actor._id)
      );

      if (!isAssigned) {
        return { error: 'You are not assigned to this patient as nurse', status: 403 };
      }
    }

    if (actorRole === 'caretaker' && String(patient.caretaker) !== String(actor._id)) {
      return { error: 'You are not assigned to this patient as caretaker', status: 403 };
    }
  }

  if (!caretakerId) {
    return { error: 'Patient does not have an assigned caretaker', status: 400 };
  }

  if (!nurseId) {
    return { error: 'Patient does not have an assigned nurse', status: 400 };
  }

  return { caretakerId, nurseId };
};


/**
 * @swagger
 * /api/v1/patient/{patientId}/health-records:
 *   get:
 *     summary: Fetch health records of a patient
 *     tags: [Patient]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Health records
 *       404:
 *         description: Patient not found
 *       400:
 *         description: Error fetching health records
 */
exports.getHealthRecords = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!validatePatientId(patientId, res)) return;

    const patient = await Patient.findById(patientId).select('_id');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const healthRecords = await HealthRecord.find({ patient: patientId })
      .sort({ created_at: -1 })
      .populate('patient', 'fullname')
      .populate('nurse', 'fullname email')
      .populate('caretaker', 'fullname email');
    if (!healthRecords.length) {
      return res.status(404).json({ error: 'No health records found for this patient' });
    }
    return res.status(200).json(healthRecords);
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching health records', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/patient/{patientId}/health-record:
 *   post:
 *     summary: Create a health record for a patient
 *     tags: [Patient]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vitals:
 *                 type: object
 *                 required:
 *                   - bloodPressure
 *                   - temperature
 *                   - heartRate
 *                   - respiratoryRate
 *                 properties:
 *                   bloodPressure:
 *                     type: string
 *                   temperature:
 *                     type: number
 *                   heartRate:
 *                     type: number
 *                   respiratoryRate:
 *                     type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Health record created successfully
 *       400:
 *         description: Error updating health records
 */
exports.updateHealthRecords = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!validatePatientId(patientId, res)) return;

    const patient = await Patient.findById(patientId).select('caretaker assignedNurses');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { vitals, notes } = req.body || {};
    const parsedVitals = parseVitals(vitals);
    if (parsedVitals.error) {
      return res.status(400).json({ error: parsedVitals.error });
    }

    const careTeam = await resolveCareTeam(patient, req.user?._id);
    if (careTeam.error) {
      return res.status(careTeam.status).json({ error: careTeam.error });
    }

    const healthRecord = await HealthRecord.create({
      patient: patient._id,
      nurse: careTeam.nurseId,
      caretaker: careTeam.caretakerId,
      vitals: parsedVitals.vitals,
      notes,
    });

    const populatedHealthRecord = await HealthRecord.findById(healthRecord._id)
      .populate('patient', 'fullname')
      .populate('nurse', 'fullname email')
      .populate('caretaker', 'fullname email');

    return res.status(201).json(populatedHealthRecord);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

/**
 * @swagger
 * /api/v1/patient/{patientId}/report:
 *   get:
 *     summary: Get the report for a patient assigned to nurse
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Report fetched successfully
 *       404:
 *         description: Patient not found or no report available
 *       400:
 *         description: Error fetching patient report
 */
exports.getPatientReport = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!validatePatientId(patientId, res)) return;

    const nurse = await User.findById(req.user._id).select('_id');
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }

    const patient = await Patient.findById(patientId).select('assignedNurses');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const isPatientAssigned = (patient.assignedNurses || []).some(
      assignedNurseId => String(assignedNurseId) === String(nurse._id)
    );
    if (!isPatientAssigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    const report = await HealthRecord.find({ patient: patientId })
      .sort({ created_at: -1 })
      .populate('patient', 'fullname')
      .populate('nurse', 'fullname email')
      .populate('caretaker', 'fullname email');
    if (!report.length) {
      return res.status(404).json({ error: 'No report available for this patient' });
    }

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patient report', details: error.message });
  }
};
