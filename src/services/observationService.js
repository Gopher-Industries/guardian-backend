const NurseObservation = require('../models/NurseObservation');
const { buildNurseSignature } = require('./signatureService');

async function getObservations(patientId) {
  return await NurseObservation.find({ patient: patientId });
}

async function createObservation(patientId, data, user) {
  const obs = new NurseObservation({
    patient: patientId,
    nurse: user._id,
    observations: data.observations,
    notes: data.notes,
    signedBy: buildNurseSignature(user)
  });
  await obs.save();
  return obs;
}
module.exports = { getObservations, createObservation };
