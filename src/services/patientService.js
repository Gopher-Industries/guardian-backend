
const Patient = require('../models/Patient');
const { buildAuditSignature } = require('./signatureService');

async function getPatientById(patientId) {
  const patient = await Patient.findById(patientId)
    .populate('assignedCaretakers')
    .populate('generalPractitioner')
    .populate('communityPharmacy')
    .populate('assignedNurses');
  if (!patient) throw new Error('Patient not found');
  return patient;
}

async function updatePatientDetails(patientId, updates, user) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error('Patient not found');

  // Restrict patients to only editing their own profile
  if (user.role === 'patient' && user._id.toString() !== patient._id.toString()) {
    throw new Error('Patients can only update their own profile');
  }

  patient.set(updates);

  const signature = buildAuditSignature(user);

  patient.revisionHistory = patient.revisionHistory || [];
  patient.revisionHistory.push({
    updatedBy: {
      id: signature.id,
      name: signature.name,
      role: signature.role
    },
    updatedAt: signature.signedAt,
    fieldsChanged: Object.keys(updates),
    previousValues: {}
  });

  await patient.save();
  return patient;
}

module.exports = {
  getPatientById,
  updatePatientDetails
};
