const NurseObservation = require('../models/NurseObservation');
const { buildAuditSignature } = require('./signatureService');

async function createObservation(patientId, body, user) {
  const observation = new NurseObservation({
    patient: patientId,
    nurse: user._id,
    observations: body.observations,
    notes: body.notes,
    signedBy: buildAuditSignature(user),
    createdAt: new Date()
  });

  await observation.save();
  return observation;
}

async function getObservations(patientId) {
  return await NurseObservation.find({
    patient: patientId,
    isDeleted: false
  }).sort({ createdAt: -1 });
}

async function updateObservation(observationId, body, user) {
  const observation = await NurseObservation.findById(observationId);
  if (!observation) throw new Error('Observation not found');

  observation.observations = body.observations || observation.observations;
  observation.notes = body.notes || observation.notes;

  observation.signedBy = buildAuditSignature(user);

  observation.revisionHistory = observation.revisionHistory || [];
  observation.revisionHistory.push({
    updatedBy: { id: user._id, name: user.name, role: user.role },
    updatedAt: new Date(),
    changes: 'Updated observation'
  });

  await observation.save();
  return observation;
}

module.exports = {
  createObservation,
  getObservations,
  updateObservation
};
