const Patient = require('../models/Patient');
const EntryReport = require('../models/EntryReport');
const { parseStringArray } = require('../utils/arrayUtils');

/**
 * @swagger
 * tags:
 *   - name: Patient
 *     description: Endpoints for independent patient management
 *   - name: EntryReport
 *     description: Endpoints for patient activity and entry reporting
 */

/**
 * @swagger
 * /api/v1/patients/add:
 *   post:
 *     summary: Add a new patient
 *     description: Creates a new patient for the authenticated doctor.
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
 *               - firstName
 *               - lastName
 *               - dateOfBirth
 *               - birthSex
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Smith
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: 1980-01-01
 *               birthSex:
 *                 type: string
 *                 enum: [Male, Female, Other]
 *               genderIdentity:
 *                 type: string
 *                 enum: [Male, Female, Non-binary, Other, Prefer not to say]
 *               pronouns:
 *                 type: string
 *                 enum: [He/Him, She/Her, They/Them, Other, Prefer not to say]
 *               emergencyContact:
 *                 type: string
 *                 nullable: true
 *               nextOfKin:
 *                 type: string
 *                 nullable: true
 *               generalNotes:
 *                 type: string
 *                 nullable: true
 *               appointmentNotes:
 *                 type: string
 *                 nullable: true
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
 *     responses:
 *       201:
 *         description: Patient added successfully
 *       400:
 *         description: Missing required fields or invalid request data
 *       403:
 *         description: Approved organization members cannot use independent patient routes
 */
exports.addPatient = async (req, res) => {
  try {
    const {
      title, firstName, lastName, middleName, preferredName, dateOfBirth,
      birthSex, genderIdentity, pronouns, ethnicity, countryOfBirth,
      preferredLanguage, interpreterRequired, addressLine1, addressLine2,
      cityOrSuburb, postCode, homePhone, mobilePhone, workPhone, contactVia,
      email, optOutofDeidentifiedDataSharing, updateAddressOfAllFamilyMembers,
      healthIdentifier, medicareNumber, irn, expiryDate, pensionHccNumber,
      pensionCardType, dvaNumber, usualGP, usualGPID, registeredLocation,
      registeredLocationID, usualAccount, healthInsuranceProvider,
      healthInsuranceNumber, healthInsuranceExpiryDate, religion, headOfFamily,
      nextOfKin, nextOfKinRelationship, emergencyContact, occupation,
      generalNotes, appointmentNotes, isDeceased, dateOfDeath, causeOfDeath,
      assignedDoctor, allergies, conditions
    } = req.body;


    if (!firstName || !lastName || !dateOfBirth || !birthSex) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newPatient = new Patient({
      title, firstName, lastName, middleName, preferredName, dateOfBirth,
      birthSex, genderIdentity, pronouns, ethnicity, countryOfBirth,
      preferredLanguage, interpreterRequired, addressLine1, addressLine2,
      cityOrSuburb, postCode, homePhone, mobilePhone, workPhone, contactVia,
      email, optOutofDeidentifiedDataSharing, updateAddressOfAllFamilyMembers,
      healthIdentifier, medicareNumber, irn, expiryDate, pensionHccNumber,
      pensionCardType, dvaNumber, usualGP, usualGPID, registeredLocation,
      registeredLocationID, usualAccount, healthInsuranceProvider,
      healthInsuranceNumber, healthInsuranceExpiryDate, religion, headOfFamily,
      nextOfKin, nextOfKinRelationship, emergencyContact, occupation,
      generalNotes, appointmentNotes, isDeceased, dateOfDeath, causeOfDeath,
    });

    await newPatient.save();

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
 *         name: birthSex
 *         schema:
 *           type: string
 *           example: Male
 *       - in: query
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
 *       500:
 *         description: Internal server error while fetching patients
 */
exports.getAllPatients = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const { search, birthSex, createdBy, includeDeleted, sort = '-created_at' } = req.query;

    const filter = {};

    if (!(String(includeDeleted).toLowerCase() === 'true')) {
      filter.isDeleted = { $ne: true };
    }

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    if (birthSex) {
      filter.birthSex = birthSex;
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    const total = await Patient.countDocuments(filter);

    const patients = await Patient.find(filter)
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
 *     description: Updates an existing patient record for an authenticated user.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               title: { type: string, nullable: true }
 *               middleName: { type: string, nullable: true }
 *               preferredName: { type: string, nullable: true }
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: '1980-01-01'
 *               birthSex:
 *                 type: string
 *                 enum: [Male, Female, Other]
 *               genderIdentity:
 *                 type: string
 *                 enum: [Male, Female, Non-binary, Other, Prefer not to say]
 *               pronouns:
 *                 type: string
 *                 enum: [He/Him, She/Her, They/Them, Other, Prefer not to say]
 *               emergencyContact: { type: string, nullable: true }
 *               nextOfKin: { type: string, nullable: true }
 *               nextOfKinRelationship: { type: string, nullable: true }
 *               generalNotes: { type: string, nullable: true }
 *               appointmentNotes: { type: string, nullable: true }
 *               allergies:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               conditions:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: '1980-01-01'
 *               birthSex:
 *                 type: string
 *                 enum: [Male, Female, Other]
 *               genderIdentity: { type: string, enum: [Male, Female, Non-binary, Other, Prefer not to say] }
 *               pronouns: { type: string, enum: [He/Him, She/Her, They/Them, Other, Prefer not to say] }
 *               emergencyContact: { type: string, nullable: true }
 *               nextOfKin: { type: string, nullable: true }
 *               nextOfKinRelationship: { type: string, nullable: true }
 *               generalNotes: { type: string, nullable: true }
 *               appointmentNotes: { type: string, nullable: true }
 *               allergies:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               conditions:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *       403:
 *         description: The user is not authorized for this patient
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Internal server error while updating the patient
 */
exports.updatePatient = async (req, res) => {
  try {
    const patient = await Patient.findOne({
      _id: req.params.patientId,
      isDeleted: { $ne: true }
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const {
      title, firstName, lastName, middleName, preferredName, dateOfBirth,
      birthSex, genderIdentity, pronouns, ethnicity, countryOfBirth,
      preferredLanguage, interpreterRequired, addressLine1, addressLine2,
      cityOrSuburb, postCode, homePhone, mobilePhone, workPhone, contactVia,
      email, optOutofDeidentifiedDataSharing, updateAddressOfAllFamilyMembers,
      healthIdentifier, medicareNumber, irn, expiryDate, pensionHccNumber,
      pensionCardType, dvaNumber, usualGP, usualGPID, registeredLocation,
      registeredLocationID, usualAccount, healthInsuranceProvider,
      healthInsuranceNumber, healthInsuranceExpiryDate, religion, headOfFamily,
      nextOfKin,
      nextOfKinRelationship,
      emergencyContact, occupation, generalNotes, appointmentNotes,
      isActive, isDeceased, dateOfDeath, causeOfDeath, assignedDoctor,
      allergies,
      conditions
    } = req.body;

    const patientFields = {
      title, firstName, lastName, middleName, preferredName, birthSex,
      genderIdentity, pronouns, ethnicity, countryOfBirth, preferredLanguage,
      interpreterRequired, addressLine1, addressLine2, cityOrSuburb, postCode,
      homePhone, mobilePhone, workPhone, contactVia, email,
      optOutofDeidentifiedDataSharing, updateAddressOfAllFamilyMembers,
      healthIdentifier, medicareNumber, irn, expiryDate, pensionHccNumber,
      pensionCardType, dvaNumber, usualGP, usualGPID, registeredLocation,
      registeredLocationID, usualAccount, healthInsuranceProvider,
      healthInsuranceNumber, healthInsuranceExpiryDate, religion, headOfFamily,
      nextOfKin, nextOfKinRelationship, emergencyContact, occupation,
      generalNotes, appointmentNotes, isActive, isDeceased, dateOfDeath,
      causeOfDeath, assignedDoctor
    };

    for (const [field, value] of Object.entries(patientFields)) {
      if (typeof value !== 'undefined') patient[field] = value;
    }

    if (typeof dateOfBirth !== 'undefined') {
      const d = new Date(dateOfBirth);
      if (!Number.isNaN(d.getTime())) {
        patient.dateOfBirth = d;
      }
    }

    if (typeof allergies !== 'undefined') {
      patient.allergies = parseStringArray(allergies);
    }

    if (typeof conditions !== 'undefined') {
      patient.conditions = parseStringArray(conditions);
    }

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
 *     description: Marks a patient as deleted for an authenticated user.
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
 *         description: The user is not authorized for this patient
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Internal server error while deleting the patient
 */
exports.deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findOne({
      _id: req.params.patientId,
      isDeleted: { $ne: true }
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
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
 *         description: Patient details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 firstName: { type: string }
 *                 lastName: { type: string }
 *                 birthSex: { type: string, enum: [Male, Female, Other] }
 *                 genderIdentity: { type: string, enum: [Male, Female, Non-binary, Other, Prefer not to say] }
 *                 pronouns: { type: string, enum: [He/Him, She/Her, They/Them, Other, Prefer not to say] }
 *                 dateOfBirth: { type: string, format: date }
 *                 age: { type: integer }
 *                 emergencyContact: { type: string, nullable: true }
 *                 nextOfKin: { type: string, nullable: true }
 *                 nextOfKinRelationship: { type: string, nullable: true }
 *                 generalNotes: { type: string, nullable: true }
 *                 appointmentNotes: { type: string, nullable: true }
 *                 allergies:
 *                   type: array
 *                   items: { type: string }
 *                 conditions:
 *                   type: array
 *                   items: { type: string }
 *                 createdBy: { type: string }
 *                 assignedDoctor: { type: string, nullable: true }
 *       400:
 *         description: Invalid patient ID or request error
 *       404:
 *         description: Patient not found
 */
exports.getPatientDetails = async (req, res) => {
  try {
    const { patientId } = req.params;

    let patient;
    try {
      patient = await Patient.findOne({ _id: patientId, isDeleted: { $ne: true } })
        .populate('createdBy', 'fullname email')
        .populate('assignedDoctor', 'fullname email');
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
