const Nurse = require('../models/Nurse');
const Pharmacist = require('../models/Pharmacist');
const Caretaker = require('../models/Caretaker');

const verifyAssignedPatientAccess = async (req, res, next) => {
  try {
    const { role, _id: userId } = req.user;
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({ error: 'Missing patientId in request params' });
    }

    if (role === 'patient') {
      if (userId !== patientId) {
        return res.status(403).json({ error: 'Patients can only access their own data' });
      }
      return next();
    }

    let Model;
    switch (role) {
      case 'nurse':
        Model = Nurse;
        break;
      case 'pharmacist':
        Model = Pharmacist;
        break;
      case 'caretaker':
        Model = Caretaker;
        break;
      default:
        return res.status(403).json({ error: 'Role not authorized for patient data access' });
    }

    const user = await Model.findById(userId).select('assignedPatients');
    if (!user) {
      return res.status(404).json({ error: `${role} not found` });
    }

    const isAssigned = user.assignedPatients.some(
      (p) => p.toString() === patientId
    );

    if (!isAssigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    next();
  } catch (error) {
    console.error('[verifyAssignedPatientAccess] Error:', error.message);
    res.status(500).json({
      error: 'Error verifying patient access',
      details: error.message
    });
  }
};

module.exports = verifyAssignedPatientAccess;
