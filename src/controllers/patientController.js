const Patient = require('../models/Patient');
const User = require('../models/User');
const EntryReport = require('../models/EntryReport');
const notifyRules = require('../services/notifyRules');

/**
 * @swagger
 * /api/v1/patients/add:
 *   post:
 *     summary: Add a new patient with profile photo
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - fullname
 *               - dateOfBirth
 *               - gender
 *             properties:
 *               fullname:
 *                 type: string
 *               dateOfBirth:
 *                 type: String
 *                 format: date
 *                 example: '1980-01-01'
 *               gender:
 *                 type: string
 *               profilePhoto:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Patient added successfully
 *       400:
 *         description: Error adding patient
 */
exports.addPatient = async (req, res) => {
  try {
    const { fullname, dateOfBirth, gender } = req.body;
    const caretakerId = req.user._id; // Extracted from the token middleware

    if (!fullname || !dateOfBirth || !gender) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newPatient = new Patient({
      fullname,
      dateOfBirth,
      gender,
      caretaker: caretakerId,
      profilePhoto: req.file?.filename
    });

    await newPatient.save();
    Promise.resolve(
      notifyRules.patientCreated({
        patientId: newPatient._id,
        actorId: req.user?._id,
        caretakerId
      })
    ).catch(() => {});
    res.status(201).json({ message: 'Patient added successfully', patient: { ...newPatient.toObject(), age: calculateAge(newPatient.dateOfBirth) } });
  } catch (err) {
    res.status(400).json({ message: 'Error adding your patient', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patients:
 *   get:
 *     summary: Get all patients (excluding soft-deleted by default)
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: Page number (1-indexed)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *         description: Page size (max 100)
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on fullname
 *       - in: query
 *         name: gender
 *         schema: { type: string, enum: [male, female, other] }
 *         description: Filter by gender
 *       - in: query
 *         name: caretakerId
 *         schema: { type: string }
 *         description: Filter by caretaker ObjectId
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean, default: false }
 *         description: Include soft-deleted records if true
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: "-created_at" }
 *         description: Mongoose-style sort (e.g. "-created_at", "fullname")
 *     responses:
 *       200:
 *         description: Paged list of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 total: { type: integer }
 *                 totalPages: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Patient'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
exports.getAllPatients = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const { search, gender, caretakerId, includeDeleted, sort = '-created_at' } = req.query;

    const filter = {};
    // Soft-delete handling
    if (!(String(includeDeleted).toLowerCase() === 'true')) {
      filter.isDeleted = { $ne: true };
    }

    if (search) {
      filter.fullname = { $regex: search, $options: 'i' };
    }
    if (gender) {
      filter.gender = gender;
    }
    if (caretakerId) {
      filter.caretaker = caretakerId;
    }

    const [total, patients] = await Promise.all([
      Patient.countDocuments(filter),
      Patient.find(filter)
        .populate('caretaker', 'fullname email')
        .populate('assignedNurses', 'fullname email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
    ]);

    // Add computed age to each item (non-destructive)
    const data = patients.map(p => {
      const obj = p.toObject();
      if (obj.dateOfBirth) obj.age = calculateAge(obj.dateOfBirth);
      return obj;
    });

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching patients', details: err.message });
  }
};


/**
 * @swagger
 * /api/v1/patients/{patientId}:
 *   put:
 *     summary: Update patient details
 *     description: Update one or more fields of an existing patient. Accepts JSON or multipart/form-data when uploading a new profile photo.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the patient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullname: { type: string }
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: '1980-01-01'
 *               gender: { type: string }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fullname: { type: string }
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: '1980-01-01'
 *               gender: { type: string }
 *               profilePhoto:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *       400:
 *         description: Invalid patient id or bad input
 *       404:
 *         description: Patient not found
 *       410:
 *         description: Patient is deleted and cannot be updated
 *       500:
 *         description: Server error
 */
exports.updatePatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    // Load existing (and not soft-deleted) patient
    let patient;
    try {
      patient = await Patient.findById(patientId);
    } catch (e) {
      if (e.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid patient id' });
      }
      throw e;
    }

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    if (patient.isDeleted) {
      return res.status(410).json({ message: 'Patient is deleted and cannot be updated' });
    }

    // Accept JSON or multipart/form-data; profilePhoto may come via req.file
    const { fullname, dateOfBirth, gender } = req.body;

    if (typeof fullname !== 'undefined' && fullname !== patient.fullname) {
      patient.fullname = fullname;
    }
    if (typeof gender !== 'undefined' && gender !== patient.gender) {
      patient.gender = gender;
    }

    if (typeof dateOfBirth !== 'undefined') {
      const d = new Date(dateOfBirth);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ message: 'Invalid dateOfBirth; expected YYYY-MM-DD' });
      }
      patient.dateOfBirth = d;
    }

    if (req.file && req.file.filename) {
      patient.profilePhoto = req.file.filename;
      // (Optional) TODO: remove older photo file from storage if needed
    }

    // Track updater (optional)
    if (req.user && req.user._id) {
      patient.updatedBy = req.user._id;
    }

    await patient.save();

    const obj = patient.toObject();
    if (obj.dateOfBirth) {
      obj.age = calculateAge(obj.dateOfBirth);
    }

    return res.status(200).json({ message: 'Patient updated successfully', patient: obj });
  } catch (err) {
    return res.status(500).json({ message: 'Error updating patient', details: err.message });
  }
};
/**
 * @swagger
 * /api/v1/patients/{patientId}:
 *   delete:
 *     summary: Soft delete a patient
 *     description: |
 *       Marks the patient as deleted (non-destructive).
 *       The record remains in the database with isDeleted set to true.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the patient
 *     responses:
 *       '200':
 *         description: Patient soft-deleted
 *       '400':
 *         description: Invalid patient id
 *       '404':
 *         description: Patient not found
 *       '410':
 *         description: Patient already deleted
 *       '500':
 *         description: Server error
 */

exports.deletePatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    // Try to load the patient; catch invalid ObjectId without importing mongoose
    let patient;
    try {
      patient = await Patient.findById(patientId);
    } catch (e) {
      if (e.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid patient id' });
      }
      throw e;
    }

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (patient.isDeleted) {
      return res.status(410).json({ message: 'Patient already deleted' });
    }

    // Soft delete
    patient.isDeleted = true;
    patient.deletedAt = new Date();
    if (req.user && req.user._id) {
      patient.deletedBy = req.user._id;
    }

    await patient.save();
    return res.status(200).json({ message: 'Patient deleted', id: patientId });
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting patient', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/{patientId}:
 *   get:
 *     summary: Fetch patient details by ID
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the patient
 *     responses:
 *       200:
 *         description: Patient details
 *       404:
 *         description: Patient not found
 *       400:
 *         description: Invalid patient id or error fetching details
 */
exports.getPatientDetails = async (req, res) => {
  try {
    const { patientId } = req.params;

    let patient;
    try {
      patient = await Patient.findOne({ _id: patientId, isDeleted: { $ne: true } })
        .populate('caretaker', 'fullname email')
        .populate('assignedNurses', 'fullname email');
    } catch (e) {
      if (e.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid patient id' });
      }
      throw e;
    }

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patientObj = patient.toObject();

    if (patientObj.dateOfBirth) {
      patientObj.age = calculateAge(patientObj.dateOfBirth);
    }

    return res.json(patientObj);
  } catch (error) {
    return res.status(400).json({ message: 'Error fetching patient information', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/assign-nurse:
 *   post:
 *     summary: Assign a nurse to a patient
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nurseId
 *               - patientId
 *             properties:
 *               nurseId:
 *                 type: string
 *               patientId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Nurse assigned successfully
 *       404:
 *         description: Invalid nurse or patient ID
 *       500:
 *         description: Server error
 */
exports.assignNurseToPatient = async (req, res) => {
  try {
    const { nurseId, patientId } = req.body;

    const patient = await Patient.findById(patientId);
    const nurse = await User.findById(nurseId).populate('role');

    if (!patient || !nurse) {
      return res.status(404).json({ error: 'Invalid nurse or patient ID' });
    }

    // Ensure the selected user is a nurse
    if (!nurse.role || nurse.role.name !== 'nurse') {
      return res.status(400).json({ error: 'Selected user is not a nurse' });
    }

    if (!patient.assignedNurses.includes(nurseId)) {
      patient.assignedNurses.push(nurseId);
      await patient.save();
    }

    if (!nurse.assignedPatients.includes(patientId)) {
      nurse.assignedPatients.push(patientId);
      await nurse.save();
    }

    res.status(200).json({
      message: 'Nurse assigned to patient successfully',
      patient: {
        id: patient._id,
        fullname: patient.fullname,
        assignedNurses: patient.assignedNurses
      },
      nurse: {
        id: nurse._id,
        fullname: nurse.fullname,
        assignedPatients: nurse.assignedPatients
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error assigning nurse to patient', details: error.message });
  }
};


/**
 * @swagger
 * /api/v1/patients/assigned-patients:
 *   get:
 *     summary: Fetch assigned patients for a nurse or caretaker
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assigned patients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Patient'
 *       403:
 *         description: Unauthorized role
 *       500:
 *         description: Error fetching assigned patients
 */
exports.getAssignedPatients = async (req, res) => {
  try {
    // Get user from the DB and populate their role
    const user = await User.findById(req.user._id).populate('role');
    if (!user || !user.role || !user.role.name) {
      return res.status(403).json({ message: 'Invalid or missing user role' });
    }

    const query = {};
    if (user.role.name === 'nurse') {
      query.assignedNurses = user;
    } else if (user.role.name === 'caretaker') {
      query.caretaker = user;
    } else {
      return res.status(403).json({ message: 'Unauthorized role' });
    }

    const patients = await Patient.find(query).populate('assignedNurses', 'fullname email').populate('caretaker', 'fullname email');
    res.status(200).json(patients);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assigned patients', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/entryreport:
 *   post:
 *     summary: Nurse logs a patient activity
 *     tags: [EntryReport]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - activityType
 *               - description
 *             properties:
 *               patientId:
 *                 type: string
 *               activityType:
 *                 type: string
 *                 example: eating
 *               description:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 example: 2024-05-01T14:00:00Z
 *     responses:
 *       201:
 *         description: Activity logged successfully
 *       400:
 *         description: Error logging activity
 */
exports.logEntry = async (req, res) => {
  try {
    const nurseId = req.user._id;
    const { patientId, activityType, comment, timestamp } = req.body;

    const newActivity = new EntryReport({
      nurse: nurseId,
      patient: patientId,
      activityType,
      comment,
      activityTimestamp: timestamp || new Date()
    });

    await newActivity.save();
    res.status(201).json({ message: 'Activity logged successfully', activity: newActivity });
  } catch (error) {
    res.status(400).json({ message: 'Error logging activity', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/activities:
 *   get:
 *     summary: Fetch activities for a patients
 *     tags: [EntryReport]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of patient activities
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EntryReport'
 *       403:
 *         description: Unauthorized role
 *       500:
 *         description: Error fetching patient activities
 */
exports.getPatientActivities = async (req, res) => {
  try {
    const { patientId } = req.query;
    if (!patientId) {
      return res.status(400).json({ message: 'Missing patientId in query' });
    }

    const activities = await EntryReport.find({ patient: patientId })
      .populate('nurse', 'fullname');

    // Map nurse field to just the fullname string
    const formattedActivities = activities.map(activity => {
      const obj = activity.toObject();
      obj.nurse = obj.nurse ? obj.nurse.fullname : null;
      return obj;
    });

    res.status(200).json(formattedActivities);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching patient activities', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/entryreport/{entryId}:
 *   delete:
 *     summary: Delete an entry report
 *     tags: [EntryReport]
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the entry to delete
 *     responses:
 *       200:
 *         description: Entry deleted successfully
 *       404:
 *         description: Entry not found
 *       400:
 *         description: Error deleting entry
 */
exports.deleteEntry = async (req, res) => {
  try {
    const entryReport = await EntryReport.findByIdAndDelete(req.params.entryId);
    if (!entryReport) return res.status(404).json({ message: 'Entry not found' });
    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting entry', details: error.message });
  }
};

const calculateAge = dob => {
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};