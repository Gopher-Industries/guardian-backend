const Patient = require('../models/Patient');
const User = require('../models/User');
const EntryReport = require('../models/EntryReport');


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
    res.status(201).json({ message: 'Patient added successfully', patient: { ...newPatient.toObject(), age: calculateAge(newPatient.dateOfBirth) } });
  } catch (err) {
    res.status(400).json({ message: 'Error adding your patient', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient/{patientId}:
 *   get:
 *     summary: Fetch patient details
 *     tags: [Patient]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *             properties:
 *               patientId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Patient details
 *       404:
 *         description: Patient not found
 *       400:
 *         description: Error fetching patient details
 */
exports.getPatientDetails = async (req, res) => {
  try {
    const patient = await Patient.findById(req.body.patientId)
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email');

    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const patientObj = patient.toObject(); // Convert Mongoose document to plain object

    if (patientObj.dateOfBirth) {
      patientObj.age = calculateAge(patientObj.dateOfBirth); // Dynamically add age
    }

    res.json(patientObj);
  } catch (error) {
    res.status(400).json({ message: 'Error fetching patient information', details: error.message });
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
  const { nurseId, patientId } = req.body;

  try {
    const patient = await Patient.findById(patientId);
    const nurse = await User.findById(nurseId);

    if (!patient || !nurse) return res.status(404).json({ error: 'Invalid nurse or patient ID' });

    patient.assignedNurses = patient.assignedNurses || [];
    if (!patient.assignedNurses.includes(nurseId)) {
      patient.assignedNurses.push(nurseId);
      await patient.save();
    }

    res.status(200).json({ message: 'Nurse assigned to patient successfully' });
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