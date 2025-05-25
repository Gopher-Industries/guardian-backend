
const IncidentReport = require('../models/IncidentReport');
const { buildAuditSignature } = require('../services/signatureService');

exports.createIncidentReport = async (req, res) => {
  try {
    const { patientId } = req.params;
    const data = req.body;

    if (!['nurse', 'pharmacist'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only nurses or pharmacists can create incident reports' });
    }

    const report = new IncidentReport({
      patient: patientId,
      ...data,
      signedBy: buildAuditSignature(req.user),
      revisionHistory: [{
        updatedBy: {
          id: req.user._id,
          name: req.user.name,
          role: req.user.role
        },
        updatedAt: new Date(),
        changes: 'Incident report created'
      }]
    });

    await report.save();
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUnresolvedIncidents = async (req, res) => {
  try {
    const { patientId } = req.params;

    const reports = await IncidentReport.find({
      patient: patientId,
      resolved: { $ne: true },
      isDeleted: false
    }).sort({ createdAt: -1 });

    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
