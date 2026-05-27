const express = require('express');
const router = express.Router();

const patientController = require('../controllers/patientController');
const doctorController = require('../controllers/doctorController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const upload = require('../middleware/multer');
const prescriptionController = require('../controllers/prescriptionController');

/**
 * @openapi
 * /api/v1/patients/add:
 *   post:
 *     tags:
 *       - Patient
 *     summary: Add a new patient with profile photo
 *     description: >
 *       Creates a new patient record. Accepts a multipart/form-data request
 *       that includes patient details and an optional profile photo.
 *       **Roles:** caretaker.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/PatientCreateRequest'
 *           example:
 *             name: "Mary Jane"
 *             age: 72
 *             gender: "female"
 *             condition: "Dementia - Stage 2"
 *             phone: "+61412345678"
 *             address: "12 Elder Street, Melbourne VIC 3000"
 *     responses:
 *       201:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientSummary'
 *             example:
 *               _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *               name: "Mary Jane"
 *               age: 72
 *               gender: "female"
 *               condition: "Dementia - Stage 2"
 *               isActive: true
 *               photo: "uploads/1714000000000-profile.jpg"
 *       400:
 *         description: Validation error — missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *             example:
 *               error: "name, age, and gender are required."
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — only caretakers can add patients
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    '/add',
    verifyToken,
    verifyRole(['caretaker']),
    upload.single('photo'),
    patientController.addPatient
  );

/**
 * @openapi
 * /api/v1/patients/{patientId}:
 *   delete:
 *     tags:
 *       - Patient
 *     summary: Soft delete a patient
 *     description: >
 *       Soft-deletes (deactivates) a patient record by ID.
 *       The patient data is retained but marked as inactive.
 *       **Roles:** All authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     responses:
 *       200:
 *         description: Patient soft-deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Patient deleted successfully."
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:patientId', verifyToken, patientController.deletePatient);

router.post('/add', verifyToken, upload.single('profilePhoto'), patientController.addPatient);
router.delete('/:patientId', verifyToken, patientController.deletePatient);

/**
 * @openapi
 * /api/v1/patients/{patientId}:
 *   put:
 *     tags:
 *       - Patient
 *     summary: Update patient details
 *     description: >
 *       Updates an existing patient's details. Accepts multipart/form-data
 *       to allow updating the profile photo as well.
 *       **Roles:** All authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/PatientUpdateRequest'
 *           example:
 *             name: "Mary Jane"
 *             age: 73
 *             condition: "Dementia - Stage 3"
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientSummary'
 *             example:
 *               _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *               name: "Mary Jane"
 *               age: 73
 *               gender: "female"
 *               condition: "Dementia - Stage 3"
 *               isActive: true
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:patientId', verifyToken, upload.single('profilePhoto'), patientController.updatePatient);

/**
 * @openapi
 * /api/v1/patients:
 *   get:
 *     tags:
 *       - Patient
 *     summary: Get all patients (excluding soft-deleted by default)
 *     description: >
 *       Returns all patients in the system. Soft-deleted patients are excluded by default.
 *       Supports optional search and pagination.
 *       **Roles:** All authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: includeDeleted
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted patients in results
 *         example: false
 *     responses:
 *       200:
 *         description: List of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PatientSummary'
 *             example:
 *               - _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *                 name: "Mary Jane"
 *                 age: 72
 *                 gender: "female"
 *                 condition: "Dementia - Stage 2"
 *                 isActive: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', verifyToken, patientController.getAllPatients);

/**
 * @openapi
 * /api/v1/patients/assign-nurse:
 *   post:
 *     tags:
 *       - Patient
 *     summary: Assign a nurse to a patient
 *     description: >
 *       Assigns a nurse to a specific patient.
 *       **Roles:** caretaker.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignNurseRequest'
 *           example:
 *             patientId: "664f1c2e8b1a2c3d4e5f6a7b"
 *             nurseId: "664f1c2e8b1a2c3d4e5f6a7c"
 *     responses:
 *       200:
 *         description: Nurse assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Nurse assigned to patient successfully."
 *       400:
 *         description: Missing patientId or nurseId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — caretaker only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenError'
 *       404:
 *         description: Patient or nurse not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/assign-nurse', verifyToken, verifyRole(['caretaker']), patientController.assignNurseToPatient);

/**
 * @openapi
 * /api/v1/patients/{patientId}/assign-doctor:
 *   post:
 *     tags:
 *       - Doctor
 *     summary: Assign or unassign a doctor to a patient
 *     description: >
 *       Assigns or unassigns a doctor to/from a specific patient.
 *       Set `unassign: true` in the request body to remove the doctor assignment.
 *       **Roles:** admin, caretaker.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignDoctorRequest'
 *           example:
 *             doctorId: "664f1c2e8b1a2c3d4e5f6a7d"
 *             unassign: false
 *     responses:
 *       200:
 *         description: Doctor assigned/unassigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: "Doctor assigned to patient successfully."
 *       400:
 *         description: Missing doctorId or invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       403:
 *         description: Forbidden — admin or caretaker only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenError'
 *       404:
 *         description: Patient or doctor not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/:patientId/assign-doctor',
  verifyToken,
  verifyRole(['admin', 'caretaker']),
  doctorController.assignDoctorToPatient);

/**
 * @openapi
 * /api/v1/patients/assigned-patients:
 *   get:
 *     tags:
 *       - Patient
 *     summary: Fetch assigned patients for a nurse or caretaker
 *     description: >
 *       Returns the list of patients assigned to the currently authenticated nurse or caretaker.
 *       The user is identified from the JWT token.
 *       **Roles:** All authenticated users.
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
 *                 $ref: '#/components/schemas/PatientSummary'
 *             example:
 *               - _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *                 name: "Mary Jane"
 *                 age: 72
 *                 gender: "female"
 *                 condition: "Dementia - Stage 2"
 *                 isActive: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/assigned-patients', verifyToken, patientController.getAssignedPatients);

/**
 * @openapi
 * /api/v1/patients/activities:
 *   get:
 *     tags:
 *       - EntryReport
 *     summary: Fetch activities for a patient
 *     description: >
 *       Returns all logged activity/entry reports for a given patient.
 *       **Roles:** All authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter activities by patient ID
 *         example: "664f1c2e8b1a2c3d4e5f6a7b"
 *     responses:
 *       200:
 *         description: List of patient activities
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "664f1c2e8b1a2c3d4e5f6a7e"
 *                   patientId:
 *                     type: string
 *                     example: "664f1c2e8b1a2c3d4e5f6a7b"
 *                   activity:
 *                     type: string
 *                     example: "Patient had breakfast and morning walk"
 *                   loggedAt:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-10T08:00:00.000Z"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/activities', verifyToken, patientController.getPatientActivities);

/**
 * @openapi
 * /api/v1/patients/{patientId}:
 *   get:
 *     tags:
 *       - Patient
 *     summary: Fetch patient details by ID
 *     description: >
 *       Returns full details for a single patient identified by their ID.
 *       **Roles:** All authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     responses:
 *       200:
 *         description: Patient details returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientSummary'
 *             example:
 *               _id: "664f1c2e8b1a2c3d4e5f6a7b"
 *               name: "Mary Jane"
 *               age: 72
 *               gender: "female"
 *               condition: "Dementia - Stage 2"
 *               isActive: true
 *               photo: "uploads/1714000000000-profile.jpg"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:patientId', verifyToken, patientController.getPatientDetails);

// EntryReport routes — managed by another team member
router.post('/entryreport', verifyToken, verifyRole(['nurse']), patientController.logEntry);
router.delete('/entryreport/:entryId', verifyToken, patientController.deleteEntry);

/**
 * @openapi
 * /api/v1/patients/{patientId}/prescriptions:
 *   get:
 *     tags:
 *       - Prescription
 *     summary: List prescriptions for a patient
 *     description: >
 *       Returns all prescriptions linked to a specific patient.
 *       **Roles:** All authenticated users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientIdParam'
 *     responses:
 *       200:
 *         description: List of prescriptions for the patient
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "664f1c2e8b1a2c3d4e5f6a7f"
 *                   medication:
 *                     type: string
 *                     example: "Donepezil 10mg"
 *                   dosage:
 *                     type: string
 *                     example: "Once daily at bedtime"
 *                   startDate:
 *                     type: string
 *                     format: date
 *                     example: "2025-05-01"
 *                   isActive:
 *                     type: boolean
 *                     default: true
 *                     example: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundError'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:patientId/prescriptions', verifyToken, prescriptionController.listPrescriptionsForPatient);

module.exports = router;
