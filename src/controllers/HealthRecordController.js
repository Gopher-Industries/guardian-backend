const mongoose = require('mongoose');
const HealthRecord = require('../models/HealthRecord');
const Patient = require('../models/Patient');
const User = require('../models/User');

const validatePatientId = (patientId, res) => {
  if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
    res.status(400).json({ error: 'Invalid patientId format' });
    return false;
  }

  return true;
};

const ensurePatientAccess = async (patient, userId) => {
  const actor = await User.findById(userId).populate('role', 'name');
  if (!actor) {
    throw new Error('Actor not found');
  }

  const actorRole = actor.role?.name;
  if (!actorRole) {
    return { error: 'User role is missing', status: 403 };
  }

  if (actorRole === 'admin') {
    return null;
  }

  if (actorRole === 'caretaker' && String(patient.caretaker) !== String(actor._id)) {
    return { error: 'You are not assigned to this patient as caretaker', status: 403 };
  }

  if (
    actorRole === 'nurse' &&
    !(patient.assignedNurses || []).some(assignedNurseId => String(assignedNurseId) === String(actor._id))
  ) {
    return { error: 'You are not assigned to this patient as nurse', status: 403 };
  }

  if (actorRole === 'doctor' && String(patient.assignedDoctor) !== String(actor._id)) {
    return { error: 'You are not assigned to this patient as doctor', status: 403 };
  }

  return null;
};

const parseVitals = (vitals = {}) => {
  const { bloodPressure, temperature, heartRate, respiratoryRate } = vitals;
  const isInvalidValue = (value) => value === null || value === undefined || value === '';
  const requiredFields = { bloodPressure, temperature, heartRate, respiratoryRate };
  const missing = Object.keys(requiredFields).filter(key => isInvalidValue(requiredFields[key]));

  if (missing.length) {
    return { error: `Missing required vitals fields: ${missing.join(', ')}` };
  }

  const normalizedVitals = {
    bloodPressure: String(bloodPressure).trim(),
    temperature: Number(temperature),
    heartRate: Number(heartRate),
    respiratoryRate: Number(respiratoryRate),
  };
  const bpRegex = /^\d{2,3}\/\d{2,3}$/;

  if (
    !normalizedVitals.bloodPressure ||
    Number.isNaN(normalizedVitals.temperature) ||
    Number.isNaN(normalizedVitals.heartRate) ||
    Number.isNaN(normalizedVitals.respiratoryRate)
  ) {
    return { error: 'Vitals contain invalid values' };
  }

  if (!bpRegex.test(normalizedVitals.bloodPressure)) {
    return { error: 'bloodPressure must be in systolic/diastolic format e.g. 120/80' };
  }

  return { vitals: normalizedVitals };
};

const resolveCareTeam = async (patient, userId) => {
  const caretakerId = patient.caretaker;
  let nurseId = patient.assignedNurses?.[0] || null;

  if (!userId) {
    return { error: 'Unauthorised: userId is required', status: 401 };
  }

  if (userId) {
    const actor = await User.findById(userId).populate('role', 'name');
    if (!actor) {
      throw new Error('Actor not found');
    }

    const actorRole = actor.role?.name;

    if (actorRole === 'nurse') {
      const isAssigned = (patient.assignedNurses || []).some(
        assignedNurseId => String(assignedNurseId) === String(actor._id)
      );

      if (!isAssigned) {
        return { error: 'You are not assigned to this patient as nurse', status: 403 };
      }

      nurseId = actor._id;
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



exports.getHealthRecords = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!validatePatientId(patientId, res)) return;

    const patient = await Patient.findById(patientId).select('_id caretaker assignedNurses assignedDoctor');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const accessError = await ensurePatientAccess(patient, req.user._id);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const healthRecords = await HealthRecord.find({ patient: patientId })
      .sort({ created_at: -1 })
      .populate('patient', 'fullname')
      .populate('nurse', 'fullname email')
      .populate('caretaker', 'fullname email')
      .lean();
    if (!healthRecords.length) {
      return res.status(404).json({ error: 'No health records found for this patient' });
    }
    return res.status(200).json(healthRecords);
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching health records', details: error.message });
  }
};


exports.createHealthRecords = async (req, res) => {
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
      .populate('caretaker', 'fullname email')
      .lean();

    return res.status(201).json(populatedHealthRecord);
  } catch (error) {
    return res.status(500).json({ error: 'Error creating health record', details: error.message });
  }
};


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
      .populate('caretaker', 'fullname email')
      .lean();
    if (!report.length) {
      return res.status(404).json({ error: 'No report available for this patient' });
    }

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patient report', details: error.message });
  }
};
