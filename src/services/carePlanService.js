const CarePlan = require('../models/CarePlan');

async function createOrUpdateCarePlan(patientId, tasks) {
  let carePlan = await CarePlan.findOne({ patient: patientId });

  if (!carePlan) {
    carePlan = new CarePlan({ patient: patientId, tasks });
  } else {
    carePlan.tasks = tasks;
  }

  await carePlan.save();
  return carePlan;
}

async function getCarePlan(patientId) {
  const plan = await CarePlan.findOne({ patient: patientId });
  if (!plan) throw new Error('Care plan not found');
  return plan;
}

async function updateCarePlanDetails(patientId, updates) {
  const plan = await CarePlan.findOne({ patient: patientId });
  if (!plan) throw new Error('Care plan not found');

  Object.assign(plan, updates);
  await plan.save();
  return plan;
}

module.exports = { createOrUpdateCarePlan, getCarePlan, updateCarePlanDetails };
