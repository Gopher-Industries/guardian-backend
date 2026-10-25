const mongoose = require('mongoose');
const Vital = require('../models/Vital');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Organization = require('../models/Organization');

const getUserId = (req) => req.user?._id || req.user?.id;

const isSameId = (firstId, secondId) =>
  Boolean(
    firstId &&
    secondId &&
    firstId.toString() === secondId.toString()
  );

const getDoctorOrganizationIds = async (userId) => {
  const user = await User.findById(userId)
    .select('organization')
    .lean();

  if (!user) return [];

  const organizationQuery = [{ staff: userId }];

  if (user.organization) {
    organizationQuery.push({ _id: user.organization });
  }

  const organizations = await Organization.find({
    active: { $ne: false },
    $or: organizationQuery
  })
    .select('_id')
    .lean();

  return organizations.map((organization) =>
    organization._id.toString()
  );
};

const doctorCanAccessPatient = async (userId, patientId) => {
  const patient = await Patient.findOne({
    _id: patientId,
    isDeleted: { $ne: true }
  })
    .select('organization')
    .lean();

  if (!patient || !patient.organization) {
    return false;
  }

  const doctorOrganizations =
    await getDoctorOrganizationIds(userId);

  return doctorOrganizations.some((organizationId) =>
    isSameId(organizationId, patient.organization)
  );
};

const hasVitalData = (vitals = {}) =>
  [
    vitals.temperature,
    vitals.bloodPressure,
    vitals.heartRate,
    vitals.respiratoryRate,
    vitals.oxygenSaturation,
    vitals.notes
  ].some(
    (value) =>
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
  );

const normalizeVitalData = (input = {}) => ({
  temperature:
    input.temperature === '' || input.temperature === undefined
      ? null
      : Number(input.temperature),
  bloodPressure:
    typeof input.bloodPressure === 'string' &&
    input.bloodPressure.trim()
      ? input.bloodPressure.trim()
      : null,
  heartRate:
    input.heartRate === '' || input.heartRate === undefined
      ? null
      : Number(input.heartRate),
  respiratoryRate:
    input.respiratoryRate === '' ||
    input.respiratoryRate === undefined
      ? null
      : Number(input.respiratoryRate),
  oxygenSaturation:
    input.oxygenSaturation === '' ||
    input.oxygenSaturation === undefined
      ? null
      : Number(input.oxygenSaturation),
  notes:
    typeof input.notes === 'string'
      ? input.notes.trim()
      : ''
});

const validateVitalNumbers = (vitals) => {
  const numericFields = [
    'temperature',
    'heartRate',
    'respiratoryRate',
    'oxygenSaturation'
  ];

  for (const field of numericFields) {
    if (
      vitals[field] !== null &&
      !Number.isFinite(vitals[field])
    ) {
      return `${field} must be a valid number.`;
    }
  }

  if (
    vitals.oxygenSaturation !== null &&
    (vitals.oxygenSaturation < 0 ||
      vitals.oxygenSaturation > 100)
  ) {
    return 'oxygenSaturation must be between 0 and 100.';
  }

  if (
    vitals.heartRate !== null &&
    vitals.heartRate < 0
  ) {
    return 'heartRate cannot be negative.';
  }

  if (
    vitals.respiratoryRate !== null &&
    vitals.respiratoryRate < 0
  ) {
    return 'respiratoryRate cannot be negative.';
  }

  return null;
};

exports.createVitalRecord = async ({
  patientId,
  recordedBy,
  data
}) => {
  if (!mongoose.isValidObjectId(patientId)) {
    throw new Error('Patient ID is invalid.');
  }

  const patient = await Patient.findOne({
    _id: patientId,
    isDeleted: { $ne: true }
  })
    .select('_id')
    .lean();

  if (!patient) {
    throw new Error('Patient not found.');
  }

  if (!hasVitalData(data)) {
    throw new Error('At least one vital value is required.');
  }

  const normalized = normalizeVitalData(data);
  const validationError = validateVitalNumbers(normalized);

  if (validationError) {
    throw new Error(validationError);
  }

  return Vital.create({
    patient: patientId,
    recordedBy,
    ...normalized
  });
};

/**
 * @swagger
 * /api/v1/vitals:
 *   post:
 *     summary: Create vitals for a patient
 *     tags: [Vitals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [patientId]
 *             properties:
 *               patientId:
 *                 type: string
 *               temperature:
 *                 type: number
 *               bloodPressure:
 *                 type: string
 *                 example: 120/80
 *               heartRate:
 *                 type: number
 *               respiratoryRate:
 *                 type: number
 *               oxygenSaturation:
 *                 type: number
 *               notes:
 *                 type: string
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Vitals created successfully
 */
exports.createVital = async (req, res) => {
  try {
    const { patientId, ...vitalData } = req.body;
    const userId = getUserId(req);

    if (!patientId) {
      return res.status(400).json({
        error: 'patientId is required.'
      });
    }

    if (req.userRole === 'doctor') {
      const allowed = await doctorCanAccessPatient(
        userId,
        patientId
      );

      if (!allowed) {
        return res.status(403).json({
          error:
            'Doctors can only create vitals for patients in their organization.'
        });
      }
    }

    const vital = await exports.createVitalRecord({
      patientId,
      recordedBy: userId,
      data: vitalData
    });

    return res.status(201).json({
      message: 'Vitals created successfully.',
      vital
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
};

/**
 * @swagger
 * /api/v1/vitals/patient/{patientId}:
 *   get:
 *     summary: Get vital history for a patient
 *     tags: [Vitals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vital history returned successfully
 */
exports.getVitalsForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = getUserId(req);

    if (!mongoose.isValidObjectId(patientId)) {
      return res.status(400).json({
        error: 'Patient ID is invalid.'
      });
    }

    if (req.userRole === 'doctor') {
      const allowed = await doctorCanAccessPatient(
        userId,
        patientId
      );

      if (!allowed) {
        return res.status(403).json({
          error:
            'Doctors can only view vitals for patients in their organization.'
        });
      }
    }

    const vitals = await Vital.find({ patient: patientId })
      .populate('recordedBy', 'fullname email')
      .sort({ created_at: -1 });

    return res.status(200).json({
      total: vitals.length,
      data: vitals
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
};

/**
 * @swagger
 * /api/v1/vitals/{id}:
 *   get:
 *     summary: Get one vital record
 *     tags: [Vitals]
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
 *         description: Vital record returned successfully
 */
exports.getVitalById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Vital ID is invalid.'
      });
    }

    const vital = await Vital.findById(id)
      .populate('patient', 'fullname organization')
      .populate('recordedBy', 'fullname email');

    if (!vital) {
      return res.status(404).json({
        error: 'Vital record not found.'
      });
    }

    if (req.userRole === 'doctor') {
      const allowed = await doctorCanAccessPatient(
        userId,
        vital.patient._id
      );

      if (!allowed) {
        return res.status(403).json({
          error:
            'Doctors can only view vitals for patients in their organization.'
        });
      }
    }

    return res.status(200).json({ vital });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
};
