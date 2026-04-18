const Patient = require('../models/Patient');
const User = require('../models/User');
const EntryReport = require('../models/EntryReport');
const notifyRules = require('../services/notifyRules');
<<<<<<< HEAD
const Role = require('../models/Role');

/**
 * Restricts independent patient-management routes for approved organization-linked
 * nurses and caretakers. These users must use the organization-based workflow.
 */
async function blockIndependentPatientWorkForApprovedOrgMember(userId) {
  const user = await User.findById(userId).populate('role', 'name');
  if (!user) {
    return { blocked: true, message: 'User not found' };
  }

  const roleName = user.role?.name?.toLowerCase();
  if (!['nurse', 'caretaker'].includes(roleName)) {
    return { blocked: false };
  }

  if (user.organization && user.approvalStatus === 'approved') {
    return {
      blocked: true,
      message: 'Approved organization members cannot manage patients independently. Patient work must be handled through admin assignment flow.'
    };
  }

  return { blocked: false };
}

/**
 * @swagger
 * tags:
 *   - name: Patient
 *     description: Endpoints for independent patient management
 *   - name: EntryReport
 *     description: Endpoints for patient activity and entry reporting
 */
=======
const { parseStringArray } = require('../utils/arrayUtils');
>>>>>>> origin/main

/**
 * @swagger
 * /api/v1/patients/add:
 *   post:
 *     summary: Add a new patient with an optional profile photo
 *     description: Creates a new patient in the independent freelance flow for the authenticated caretaker.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
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
 *                 example: John Smith
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: 1980-01-01
 *               gender:
 *                 type: string
<<<<<<< HEAD
 *                 example: Male
=======
 *                 enum: [M, F, other]
>>>>>>> origin/main
 *               profilePhoto:
 *                 type: string
 *                 format: binary
 *                 description: "Patient profile photo (file upload). NOTE: Uploading a photo is currently disabled - submitting with a photo will throw an error. Leave this field empty."
 *               emergencyContactName:
 *                 type: string
 *                 nullable: true
 *                 description: Full name of the emergency contact
 *               emergencyContactNumber:
 *                 type: string
 *                 nullable: true
 *                 description: Phone number of the emergency contact
 *               nextOfKinName:
 *                 type: string
 *                 nullable: true
 *                 description: Full name of the patient's next of kin
 *               nextOfKinRelationship:
 *                 type: string
 *                 nullable: true
 *                 enum: [SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER]
 *                 description: "Relationship of the next of kin to the patient. Only accepted values: SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER"
 *               medicalSummary:
 *                 type: string
 *                 nullable: true
 *                 description: Brief summary of the patient's overall medical history and status
 *               allergies:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *                 description: List of known allergies (e.g. penicillin, peanuts)
 *               conditions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *                 description: List of diagnosed medical conditions (e.g. Type 2 Diabetes, Hypertension)
 *               notes:
 *                 type: string
 *                 nullable: true
 *                 description: Free-text clinical or care notes for the patient
 *     responses:
 *       201:
 *         description: Patient added successfully
 *       400:
<<<<<<< HEAD
 *         description: Missing required fields or invalid request data
 *       403:
 *         description: Approved organization members cannot use independent patient routes
 */
exports.addPatient = async (req, res) => {
  try {
    const accessCheck = await blockIndependentPatientWorkForApprovedOrgMember(req.user._id);
    if (accessCheck.blocked) {
      return res.status(403).json({ message: accessCheck.message });
    }

    const { fullname, dateOfBirth, gender } = req.body;
    const caretakerId = req.user._id;
=======
 *         description: Missing required fields or validation error
 */
exports.addPatient = async (req, res) => {
  try {
    const {
      fullname, dateOfBirth, gender,
      emergencyContactName, emergencyContactNumber,
      nextOfKinName, nextOfKinRelationship, medicalSummary,
      allergies, conditions, notes
    } = req.body;
    const caretakerId = req.user._id; // Extracted from the token middleware
>>>>>>> origin/main

    if (!fullname || !dateOfBirth || !gender) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newPatient = new Patient({
      fullname,
      dateOfBirth,
      gender,
      caretaker: caretakerId,
      profilePhoto: req.file?.filename,
      emergencyContactName,
      emergencyContactNumber,
      nextOfKinName,
      nextOfKinRelationship,
      medicalSummary,
      allergies: parseStringArray(allergies),
      conditions: parseStringArray(conditions),
      notes
    });

    await newPatient.save();
    Promise.resolve(
      notifyRules.patientCreated({
        patientId: newPatient._id,
        actorId: req.user?._id,
        caretakerId
      })
    ).catch(() => {});

    res.status(201).json({
      message: 'Patient added successfully',
      patient: { ...newPatient.toObject(), age: calculateAge(newPatient.dateOfBirth) }
    });
  } catch (err) {
    res.status(400).json({ message: 'Error adding your patient', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patients:
 *   get:
 *     summary: Get patients in the independent freelance flow
 *     description: Returns patients visible to the authenticated user within the independent workflow, with optional filtering, pagination, and sorting.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: John
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           example: Male
 *       - in: query
 *         name: caretakerId
 *         schema:
 *           type: string
 *           example: 661111111111111111111111
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *           example: false
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           example: -created_at
 *     responses:
 *       200:
 *         description: Patients fetched successfully
 *       403:
 *         description: Approved organization members cannot use independent patient routes
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error while fetching patients
 */
exports.getAllPatients = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const { search, gender, caretakerId, includeDeleted, sort = '-created_at' } = req.query;

    const me = await User.findById(req.user._id).populate('role', 'name');
    if (!me) {
      return res.status(404).json({ message: 'User not found' });
    }

    const roleName = me.role?.name?.toLowerCase();
    const filter = {};

    if (!(String(includeDeleted).toLowerCase() === 'true')) {
      filter.isDeleted = { $ne: true };
    }

    if (search) {
      filter.fullname = { $regex: search, $options: 'i' };
    }

    if (gender) {
      filter.gender = gender;
    }

    if (roleName === 'caretaker') {
      if (me.organization && me.approvalStatus === 'approved') {
        return res.status(403).json({
          message: 'Approved organization members cannot view patients through independent patient routes. Use organization-based routes instead.'
        });
      }

      filter.caretaker = me._id;
    } else if (roleName === 'nurse') {
      if (me.organization && me.approvalStatus === 'approved') {
        return res.status(403).json({
          message: 'Approved organization members cannot view patients through independent patient routes. Use organization-based routes instead.'
        });
      }

      filter.assignedNurses = me._id;
    } else if (caretakerId) {
      filter.caretaker = caretakerId;
    }

    const total = await Patient.countDocuments(filter);

    const patients = await Patient.find(filter)
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const formatted = patients.map((patient) => ({
      ...patient.toObject(),
      age: calculateAge(patient.dateOfBirth)
    }));

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      patients: formatted
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching patients',
      details: error.message
    });
  }
};

/**
 * @swagger
 * /api/v1/patients/{patientId}:
 *   put:
 *     summary: Update a patient in the independent freelance flow
 *     description: Updates an existing patient record for an authorized caretaker or assigned nurse within the independent workflow.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *     requestBody:
 *       required: true
 *       content:
<<<<<<< HEAD
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullname:
 *                 type: string
 *               gender:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *               dateOfAdmitting:
 *                 type: string
 *                 format: date
=======
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fullname: { type: string }
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: '1980-01-01'
 *               gender:
 *                 type: string
 *                 enum: [M, F, other]
 *                 description: "Only accepted values: M, F, other"
 *               profilePhoto:
 *                 type: string
 *                 format: binary
 *                 description: "Patient profile photo (file upload). NOTE: Uploading a photo is currently disabled - submitting with a photo will throw an error. Leave this field empty."
 *               emergencyContactName: { type: string, nullable: true }
 *               emergencyContactNumber: { type: string, nullable: true }
 *               nextOfKinName: { type: string, nullable: true, description: "Full name of the patient's next of kin" }
 *               nextOfKinRelationship:
 *                 type: string
 *                 nullable: true
 *                 enum: [SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER]
 *                 description: "Only accepted values: SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER"
 *               medicalSummary: { type: string, nullable: true }
 *               allergies:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               conditions:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               notes: { type: string, nullable: true }
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullname: { type: string }
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: '1980-01-01'
 *               gender:
 *                 type: string
 *                 enum: [M, F, other]
 *                 description: "Only accepted values: M, F, other"
 *               emergencyContactName: { type: string, nullable: true }
 *               emergencyContactNumber: { type: string, nullable: true }
 *               nextOfKinName: { type: string, nullable: true, description: "Full name of the patient's next of kin" }
 *               nextOfKinRelationship:
 *                 type: string
 *                 nullable: true
 *                 enum: [SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER]
 *                 description: "Only accepted values: SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER"
 *               medicalSummary: { type: string, nullable: true }
 *               allergies:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               conditions:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               notes: { type: string, nullable: true }
>>>>>>> origin/main
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *       403:
 *         description: Approved organization members cannot use independent update routes, or the user is not authorized for this patient
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Internal server error while updating the patient
 */
exports.updatePatient = async (req, res) => {
  try {
    const block = await blockIndependentPatientWorkForApprovedOrgMember(req.user._id);
    if (block.blocked) {
      return res.status(403).json({
        message: block.message || 'Approved organization members cannot update patients through independent routes.'
      });
    }

    const patient = await Patient.findOne({
      _id: req.params.patientId,
      isDeleted: { $ne: true }
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const me = await User.findById(req.user._id).populate('role', 'name');
    const roleName = me?.role?.name?.toLowerCase();

    if (roleName === 'caretaker' && String(patient.caretaker) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only update your own patients' });
    }

<<<<<<< HEAD
    if (roleName === 'nurse' && !patient.assignedNurses.some((id) => String(id) === String(req.user._id))) {
      return res.status(403).json({ message: 'You can only update assigned patients' });
=======
    // Accept JSON or multipart/form-data; profilePhoto may come via req.file
    const {
      fullname, dateOfBirth, gender,
      emergencyContactName, emergencyContactNumber,
      nextOfKinName, nextOfKinRelationship, medicalSummary,
      allergies, conditions, notes
    } = req.body;

    if (typeof fullname !== 'undefined' && fullname !== patient.fullname) {
      patient.fullname = fullname;
    }
    if (typeof gender !== 'undefined' && gender !== patient.gender) {
      patient.gender = gender;
>>>>>>> origin/main
    }

    const allowedFields = [
      'fullname',
      'gender',
      'dateOfBirth',
      'description',
      'image',
      'dateOfAdmitting'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'image') {
          patient.profilePhoto = req.body[field];
        } else {
          patient[field] = req.body[field];
        }
      }
<<<<<<< HEAD
=======
      patient.dateOfBirth = d;
    }

    if (req.file && req.file.filename) {
      patient.profilePhoto = req.file.filename;
      // (Optional) TODO: remove older photo file from storage if needed
    }

    if (typeof emergencyContactName !== 'undefined') patient.emergencyContactName = emergencyContactName;
    if (typeof emergencyContactNumber !== 'undefined') patient.emergencyContactNumber = emergencyContactNumber;
    if (typeof nextOfKinName !== 'undefined') patient.nextOfKinName = nextOfKinName;
    if (typeof nextOfKinRelationship !== 'undefined') patient.nextOfKinRelationship = nextOfKinRelationship;
    if (typeof medicalSummary !== 'undefined') patient.medicalSummary = medicalSummary;
    if (typeof allergies !== 'undefined') {
      patient.allergies = parseStringArray(allergies);
>>>>>>> origin/main
    }
    if (typeof conditions !== 'undefined') {
      patient.conditions = parseStringArray(conditions);
    }
    if (typeof notes !== 'undefined') patient.notes = notes;

    await patient.save();

    return res.status(200).json({
      message: 'Patient updated successfully',
      patient: {
        ...patient.toObject(),
        age: calculateAge(patient.dateOfBirth)
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error updating patient',
      details: error.message
    });
  }
};

/**
 * @swagger
 * /api/v1/patients/{patientId}:
 *   delete:
 *     summary: Soft delete a patient in the independent freelance flow
 *     description: Marks a patient as deleted for an authorized caretaker or assigned nurse within the independent workflow.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient deleted successfully
 *       403:
 *         description: Approved organization members cannot use independent delete routes, or the user is not authorized for this patient
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Internal server error while deleting the patient
 */
exports.deletePatient = async (req, res) => {
  try {
    const block = await blockIndependentPatientWorkForApprovedOrgMember(req.user._id);
    if (block.blocked) {
      return res.status(403).json({
        message: block.message || 'Approved organization members cannot delete patients through independent routes.'
      });
    }

    const patient = await Patient.findOne({
      _id: req.params.patientId,
      isDeleted: { $ne: true }
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const me = await User.findById(req.user._id).populate('role', 'name');
    const roleName = me?.role?.name?.toLowerCase();

    if (roleName === 'caretaker' && String(patient.caretaker) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own patients' });
    }

    if (roleName === 'nurse' && !patient.assignedNurses.some((id) => String(id) === String(req.user._id))) {
      return res.status(403).json({ message: 'You can only delete assigned patients' });
    }

    patient.isDeleted = true;
    await patient.save();

    return res.status(200).json({
      message: 'Patient deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error deleting patient',
      details: error.message
    });
  }
};

/**
 * @swagger
 * /api/v1/patients/{patientId}:
 *   get:
 *     summary: Fetch patient details by ID
 *     description: Retrieves a non-deleted patient record by its ID.
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
<<<<<<< HEAD
 *         description: Patient details fetched successfully
 *       400:
 *         description: Invalid patient ID or request error
=======
 *         description: Patient details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 fullname: { type: string }
 *                 gender: { type: string, enum: [M, F, other] }
 *                 dateOfBirth: { type: string, format: date }
 *                 age: { type: integer }
 *                 profilePhoto: { type: string, nullable: true }
 *                 dateOfAdmitting: { type: string, format: date, nullable: true }
 *                 description: { type: string }
 *                 emergencyContactName: { type: string, nullable: true }
 *                 emergencyContactNumber: { type: string, nullable: true }
 *                 nextOfKinName: { type: string, nullable: true, description: "Full name of the patient's next of kin" }
 *                 nextOfKinRelationship:
 *                   type: string
 *                   nullable: true
 *                   enum: [SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER]
 *                   description: Relationship of the next of kin to the patient
 *                 medicalSummary: { type: string, nullable: true }
 *                 allergies:
 *                   type: array
 *                   items: { type: string }
 *                 conditions:
 *                   type: array
 *                   items: { type: string }
 *                 notes: { type: string, nullable: true }
 *                 caretaker:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     _id: { type: string }
 *                     fullname: { type: string }
 *                     email: { type: string }
 *                 assignedNurses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       fullname: { type: string }
 *                       email: { type: string }
>>>>>>> origin/main
 *       404:
 *         description: Patient not found
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
 *     description: Assigns a nurse to a patient and updates both the patient and nurse records.
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
 *       400:
 *         description: Selected user is not a nurse
 *       403:
 *         description: Approved organization members cannot use independent patient routes
 *       404:
 *         description: Invalid nurse or patient ID
 *       500:
 *         description: Internal server error while assigning the nurse
 */
exports.assignNurseToPatient = async (req, res) => {
  try {
    const accessCheck = await blockIndependentPatientWorkForApprovedOrgMember(req.user._id);
    if (accessCheck.blocked) {
      return res.status(403).json({ message: accessCheck.message });
    }

    const { nurseId, patientId } = req.body;

    const patient = await Patient.findById(patientId);
    const nurse = await User.findById(nurseId).populate('role');

    if (!patient || !nurse) {
      return res.status(404).json({ error: 'Invalid nurse or patient ID' });
    }

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
 *     description: Returns patients assigned to the authenticated nurse or caretaker.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned patients fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Patient'
 *       403:
 *         description: Unauthorized role or invalid role information
 *       500:
 *         description: Internal server error while fetching assigned patients
 */
exports.getAssignedPatients = async (req, res) => {
  try {
    // Load the authenticated user and role before applying role-based filters
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

    const patients = await Patient.find(query)
      .populate('assignedNurses', 'fullname email')
      .populate('caretaker', 'fullname email');

    res.status(200).json(patients);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assigned patients', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/entryreport:
 *   post:
 *     summary: Log a patient activity entry
 *     description: Creates a new entry report for a patient activity by the authenticated nurse.
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
 *             properties:
 *               patientId:
 *                 type: string
 *               activityType:
 *                 type: string
 *                 example: eating
 *               comment:
 *                 type: string
 *                 example: Patient finished lunch normally
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 example: 2024-05-01T14:00:00Z
 *     responses:
 *       201:
 *         description: Activity logged successfully
 *       400:
 *         description: Invalid request or error logging activity
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
 *     summary: Fetch activities for a patient
 *     description: Returns all entry reports associated with the provided patient ID.
 *     tags: [EntryReport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient activities fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EntryReport'
 *       400:
 *         description: Missing patientId in query
 *       500:
 *         description: Internal server error while fetching patient activities
 */
exports.getPatientActivities = async (req, res) => {
  try {
    const { patientId } = req.query;
    if (!patientId) {
      return res.status(400).json({ message: 'Missing patientId in query' });
    }

    const activities = await EntryReport.find({ patient: patientId })
      .populate('nurse', 'fullname');

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
 *     description: Deletes an existing entry report by its ID.
 *     tags: [EntryReport]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Entry report ID
 *     responses:
 *       200:
 *         description: Entry deleted successfully
 *       404:
 *         description: Entry not found
 *       400:
 *         description: Invalid request or error deleting entry
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