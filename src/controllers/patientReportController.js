const PatientReport = require('../models/PatientReport');

/**
 * Create a new patient report.
 */
exports.createReport = async (req, res) => {
  try {
    const { patientId, caretakerId, reportDetails } = req.body;

    const newReport = new PatientReport({
      patient: patientId,
      caretaker: caretakerId,
      reportDetails,
      createdAt: Date.now(),
    });

    await newReport.save();
    res.status(201).json({ message: 'Patient report created successfully', report: newReport });
  } catch (error) {
    res.status(500).json({ error: 'Error creating patient report', details: error.message });
  }
};

/**
 * Get all patient reports.
 */
exports.getAllReports = async (req, res) => {
  try {
    const reports = await PatientReport.find().populate('patient').populate('caretaker');
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patient reports', details: error.message });
  }
};

/**
 * Get a specific patient report by ID.
 */
exports.getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await PatientReport.findById(reportId).populate('patient').populate('caretaker');
    if (!report) {
      return res.status(404).json({ error: 'Patient report not found' });
    }

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patient report', details: error.message });
  }
};

/**
 * Update a patient report by ID.
 */
exports.updateReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const updateData = req.body;

    const updatedReport = await PatientReport.findByIdAndUpdate(reportId, updateData, { new: true });

    if (!updatedReport) {
      return res.status(404).json({ error: 'Patient report not found' });
    }

    res.status(200).json({ message: 'Patient report updated successfully', report: updatedReport });
  } catch (error) {
    res.status(500).json({ error: 'Error updating patient report', details: error.message });
  }
};

/**
 * Delete a patient report by ID.
 */
exports.deleteReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const deletedReport = await PatientReport.findByIdAndDelete(reportId);

    if (!deletedReport) {
      return res.status(404).json({ error: 'Patient report not found' });
    }

    res.status(200).json({ message: 'Patient report deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting patient report', details: error.message });
  }
};
