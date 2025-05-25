
const CarePlan = require('../models/CarePlan');
const { buildAuditSignature } = require('./signatureService');

async function createOrUpdateCarePlan(patientId, data, user) {
  if (!['nurse', 'pharmacist'].includes(user.role)) {
    throw new Error('Only nurses or pharmacists can modify care plans');
  }

  let plan = await CarePlan.findOne({ patient: patientId });

  const signature = buildAuditSignature(user);

  if (!plan) {
    plan = new CarePlan({
      patient: patientId,
      interventions: data.interventions,
      goals: data.goals,
      signedBy: signature,
      revisionHistory: [{
        updatedBy: { id: user._id, name: user.name, role: user.role },
        updatedAt: new Date(),
        changes: 'Initial care plan created'
      }]
    });
  } else {
    plan.interventions = data.interventions;
    plan.goals = data.goals;
    plan.signedBy = signature;
    plan.revisionHistory.push({
      updatedBy: { id: user._id, name: user.name, role: user.role },
      updatedAt: new Date(),
      changes: 'Care plan updated'
    });
  }

  await plan.save();
  return plan;
}

async function getCarePlan(patientId) {
  return await CarePlan.findOne({ patient: patientId, isDeleted: false });
}

module.exports = {
  createOrUpdateCarePlan,
  getCarePlan
};
