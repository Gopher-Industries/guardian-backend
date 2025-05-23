const LabTestRecord = require('../models/LabTestRecord');
const { buildReviewerSignature } = require('./signatureService');

async function getLabTestRecords(patientId) {
  return await LabTestRecord.find({ patient: patientId });
}

async function createLabTestRecord(patientId, data, user) {
  const lab = new LabTestRecord({
    patient: patientId,
    ...data,
    signedBy: buildReviewerSignature(user)
  });
  await lab.save();
  return lab;
}

async function updateLabTestRecord(recordId, updates, user) {
  const lab = await LabTestRecord.findById(recordId);
  if (!lab) throw new Error('Lab test record not found');

  Object.assign(lab, updates);
  lab.signedBy = buildReviewerSignature(user);
  await lab.save();
  return lab;
}
module.exports = { getLabTestRecords, createLabTestRecord,updateLabTestRecord };
