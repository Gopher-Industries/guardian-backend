
const LabTestRecord = require('../models/LabTestRecord');

async function addLabTestResult(patientId, body, user) {
  const { testName, result, unit, notes } = body;

  const record = new LabTestRecord({
    patient: patientId,
    testName,
    result,
    unit,
    notes,
    signedBy: {
      id: user._id,
      name: user.name,
      signedAt: new Date()
    },
    revisionHistory: [{
      updatedBy: { id: user._id, name: user.name, role: user.role },
      updatedAt: new Date(),
      changes: 'Initial test entry'
    }]
  });

  await record.save();
  return record;
}

async function getLabTestRecords(patientId) {
  return await LabTestRecord.find({
    patient: patientId,
    isDeleted: false
  }).sort({ createdAt: -1 });
}

async function updateLabTestRecord(recordId, body, user) {
  const record = await LabTestRecord.findById(recordId);
  if (!record) throw new Error('Lab test record not found');

  record.set(body);
  record.signedBy = {
    id: user._id,
    name: user.name,
    signedAt: new Date()
  };
  record.revisionHistory.push({
    updatedBy: { id: user._id, name: user.name, role: user.role },
    updatedAt: new Date(),
    changes: 'Updated lab result'
  });

  await record.save();
  return record;
}

module.exports = {
  addLabTestResult,
  getLabTestRecords,
  updateLabTestRecord
};
