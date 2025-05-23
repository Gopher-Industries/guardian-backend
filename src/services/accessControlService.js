const Nurse = require('../models/Nurse');
const Pharmacist = require('../models/Pharmacist');
const Caretaker = require('../models/Caretaker');

async function isUserAssignedToPatient(user, patientId) {
  if (user.role === 'patient') return user._id.toString() === patientId;

  const modelMap = {
    nurse: Nurse,
    pharmacist: Pharmacist,
    caretaker: Caretaker
  };

  const Model = modelMap[user.role];
  if (!Model) return false;

  const dbUser = await Model.findById(user._id).select('assignedPatients');
  if (!dbUser) return false;

  return dbUser.assignedPatients.some(pid => pid.toString() === patientId);
}

module.exports = { isUserAssignedToPatient };