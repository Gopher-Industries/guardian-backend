const MedicationRecord = require('../models/MedicationRecord');

async function submitOrUpdateMedication(patientId, body, user) {
  const { allergies, records, changes } = body;

  if (!Array.isArray(allergies) || allergies.length === 0) {
    throw new Error('Allergies are required');
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('At least one medication record is required');
  }

  const reviewer = {
    id: user._id,
    name: user.name,
    signedAt: new Date()
  };

  let medRecord = await MedicationRecord.findOne({ patient: patientId });
  if (!medRecord) {
    medRecord = new MedicationRecord({
      patient: patientId,
      allergies,
      records,
      reviewerSignature: reviewer,
      revisionHistory: [{
        updatedBy: { id: user._id, name: user.name, role: user.role },
        updatedAt: new Date(),
        changes: changes || 'Initial submission'
      }]
    });
  } else {
    medRecord.allergies = allergies;
    medRecord.records = records;
    medRecord.reviewerSignature = reviewer;
    medRecord.revisionHistory.push({
      updatedBy: { id: user._id, name: user.name, role: user.role },
      updatedAt: new Date(),
      changes: changes || 'Updated record'
    });
  }

  await medRecord.save();
  return medRecord;
}

async function getMedicationRecord(patientId) {
  const record = await MedicationRecord.findOne({ patient: patientId });
  if (!record) {
    throw new Error('No medication record found for this patient');
  }
  return record;
}

module.exports = {
  submitOrUpdateMedication,
  getMedicationRecord
};
