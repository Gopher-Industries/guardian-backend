const IncidentReport = require('../models/IncidentReport');
const { getPatientById } = require('../services/patientLookupService');
const { buildReviewerSignature } = require('../services/signatureService');
const { isUserAssignedToPatient } = require('../services/accessControlService');

// Create a new incident report
exports.createIncidentReport = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { incidentType, description, followUpActions } = req.body;

    const patient = await getPatientById(patientId);
    const assigned = await isUserAssignedToPatient(req.user, patientId);
    if (!assigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    const newReport = new IncidentReport({
      patient: patient._id,
      incidentType,
      description,
      followUpActions,
      reportedBy: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role
      },
      signedBy: buildReviewerSignature(req.user)
    });

    await newReport.save();
    res.status(201).json({ message: 'Incident report created', report: newReport });
  } catch (error) {
    res.status(500).json({ error: 'Error creating incident report', details: error.message });
  }
};

// Fetch all incident reports for a patient
exports.getIncidentReports = async (req, res) => {
  try {
    const { patientId } = req.params;
    const assigned = await isUserAssignedToPatient(req.user, patientId);
    if (!assigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    const reports = await IncidentReport.find({ patient: patientId });
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching incident reports', details: error.message });
  }
};