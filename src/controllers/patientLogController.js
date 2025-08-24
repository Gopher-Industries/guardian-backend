// controllers/patientLogController.js
const PatientLog = require('../models/PatientLog');

/**
 * @swagger
 * /api/v1/patient-logs:
 *   post:
 *     summary: Create a patient log entry
 *     description: Allows a nurse to create a log entry for a specific patient.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - patient
 *             properties:
 *               title:
 *                 type: string
 *                 example: Patient fainted briefly
 *               description:
 *                 type: string
 *                 example: Patient lost consciousness for about 10 seconds after standing up quickly. Recovered without intervention.
 *               patient:
 *                 type: string
 *                 example: 688de2621911784a80507314
 *     responses:
 *       201:
 *         description: Log created successfully
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Internal server error
 *
 *     x-testing-guide:
 *       instructions: |
 *         1. First, register or login using a nurse account via `/api/v1/auth/register` or `/api/v1/auth/login`.
 *         2. Copy the returned token from the login response.
 *         3. In your testing tool, include the token in the header:
 *            Authorization: Bearer {your_token_here}
 *         4. Send a POST request to `/api/v1/patient-logs` with body:
 *            {
 *              "title": "briefly describe what happened",
 *              "description": "detailed description",
 *              "patient": "patient id"
 *            }
 */



exports.createLog = async (req, res) => {
  try {
    const { title, description, patient } = req.body;

    if (!title || !description || !patient) {
      return res.status(400).json({ error: 'Title, description, and patient ID are required.' });
    }

    const newLog = await PatientLog.create({
      title,
      description,
      patient,
      createdBy: req.user._id
    });

    res.status(201).json({ message: 'Log created successfully', log: newLog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient-logs/{patientId}:
 *   get:
 *     summary: Get logs by patient ID
 *     description: Returns a list of log entries for a specific patient.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *         example: 688de2621911784a80507314
 *     responses:
 *       200:
 *         description: Logs fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   description:
 *                     type: string
 *                   createdBy:
 *                     type: object
 *                     properties:
 *                       fullname:
 *                         type: string
 *                       role:
 *                         type: string
 *                   createdAt:
 *                     type: string
 *     x-testing-guide:
 *       instructions: |
 *         1. Login as any valid user with access to patient logs (e.g., nurse or caretaker).
 *         2. Use the JWT token in the header:
 *            Authorization: Bearer <your_token_here>
 *         3. Send a GET request to:
 *            /api/v1/patient-logs/688de2621911784a80507314
 */



exports.getLogsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const logs = await PatientLog.find({ patient: patientId })
      .populate('createdBy', 'fullname role')
      .sort({ createdAt: -1 });

    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patient-logs/{id}:
 *   delete:
 *     summary: Delete a log entry
 *     description: Deletes a patient log. Only the creator or admin can delete it.
 *     tags: [Patient Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the log entry to delete
 *     responses:
 *       200:
 *         description: Log deleted successfully
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Log not found
 *       500:
 *         description: Internal server error
 *
 *     x-testing-guide:
 *       instructions: |
 *         1. Login as the nurse who created the log, or as an admin.
 *         2. Use the token in header:
 *            Authorization: Bearer {your_token_here}
 *         3. Send DELETE request to:
 *            /api/v1/patient-logs/<log_id>
 */


exports.deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await PatientLog.findById(id);

    if (!log) return res.status(404).json({ error: 'Log not found' });

    if (!log.createdBy.equals(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await PatientLog.findByIdAndDelete(id);
    res.status(200).json({ message: 'Log deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
