
const Patient = require('../models/Patient');

async function getPatientById(patientId) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error('Patient not found');
  return patient;
}

async function updatePatientDetails(patientId, updates) {
  const patient = await Patient.findByIdAndUpdate(patientId, updates, { new: true });
  if (!patient) throw new Error('Patient not found');
  return patient;
}

module.exports = { getPatientById, updatePatientDetails };
