const User = require('../models/User');

// calculate patient age from date of birth
const calculateAge = (dob) => {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// add patient id into User.assignedPatients (for caretaker/nurse/doctor dashboards)
const addAssignedPatient = async (userId, patientId) => {
  if (!userId) return;
  await User.updateOne({ _id: userId }, { $addToSet: { assignedPatients: patientId } });
};

// remove patient id from User.assignedPatients
const removeAssignedPatient = async (userId, patientId) => {
  if (!userId) return;
  await User.updateOne({ _id: userId }, { $pull: { assignedPatients: patientId } });
};

module.exports = {
  calculateAge,
  addAssignedPatient,
  removeAssignedPatient,
};
