const HealthRecord = require('../models/HealthRecord');


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
    const healthRecords = await HealthRecord.find({ patientId: req.params.patientId });
    res.json(healthRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * @swagger
 * /api/v1/patient/{patientId}/health-record:
 *   post:
 *     summary: Update health records of a patient
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
 *                 properties:
 *                   bloodPressure:
 *                     type: string
 *                   temperature:
 *                     type: string
 *                   heartRate:
 *                     type: string
 *     responses:
 *       200:
 *         description: Health records updated successfully
 *       400:
 *         description: Error updating health records
 */
exports.updateHealthRecords = async (req, res) => {
  try {
    const healthRecord = await HealthRecord.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $push: { records: req.body.vitals } },
      { new: true }
    );
    res.json(healthRecord);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

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

    const nurse = await User.findById(req.user._id).populate('assignedPatients');
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }

    const isPatientAssigned = nurse.assignedPatients.some(patient => patient._id.toString() === patientId);
    if (!isPatientAssigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    const report = await HealthRecord.find({ patient: patientId });
    if (!report) {
      return res.status(404).json({ error: 'No report available for this patient' });
    }

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patient report', details: error.message });
  }
};
