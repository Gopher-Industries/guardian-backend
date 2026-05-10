const DailyReport = require('../models/DailyReport');

/**
 * @swagger
 * /api/v1/caretaker/reports:
 *   post:
 *     summary: Create a daily caretaker report
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient, summary]
 *             properties:
 *               patient:
 *                 type: string
 *               summary:
 *                 type: string
 *               foodWater:
 *                 type: string
 *               medicationSupport:
 *                 type: string
 *               mobility:
 *                 type: string
 *               moodBehaviour:
 *                 type: string
 *               incidents:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Report created successfully
 */

// CREATE
exports.createReport = async (req, res) => {
  try {
    const {
      patient,
      summary,
      foodWater,
      medicationSupport,
      mobility,
      moodBehaviour,
      incidents,
      notes
    } = req.body;

    const caretaker = req.user?._id;

    if (!patient || !summary) {
      return res.status(400).json({ error: 'patient and summary are required' });
    }

    const report = await DailyReport.create({
      patient,
      caretaker,
      summary,
      foodWater,
      medicationSupport,
      mobility,
      moodBehaviour,
      incidents,
      notes
    });

    res.status(201).json({
      message: 'Daily report created successfully',
      report
    });

  } catch (error) {
    res.status(500).json({ error: 'Error creating report', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/caretaker/reports:
 *   get:
 *     summary: Get all daily reports for caretaker
 *     tags: [Caretaker]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of reports
 */

exports.getReports = async (req, res) => {
  try {
    const caretakerId = req.user?._id;

    const reports = await DailyReport.find({ caretaker: req.user._id })
          .populate("patient");
    res.status(200).json(reports);

  } catch (error) {
    res.status(500).json({ error: 'Error fetching reports', details: error.message });
  }
};