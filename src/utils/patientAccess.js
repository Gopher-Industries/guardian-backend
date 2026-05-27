const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Patient = require('../models/Patient');
const User = require('../models/User');

function isValidObjectId(value) {
  if (!value) return false;
  const valueString = String(value);
  return (
    mongoose.Types.ObjectId.isValid(valueString) &&
    String(new mongoose.Types.ObjectId(valueString)) === valueString.toLowerCase()
  );
}

function idsEqual(left, right) {
  return left && right && String(left) === String(right);
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value)))];
}

async function getPatientAccessContext(userId) {
  const user = await User.findById(userId).populate('role', 'name').lean();
  if (!user) {
    const error = new Error('Authenticated user not found');
    error.status = 401;
    throw error;
  }

  const linkedOrgIds = await Organization.find({
    $or: [{ createdBy: user._id }, { staff: user._id }]
  }).distinct('_id');

  return {
    user,
    orgIds: uniqueIds([user.organization, ...linkedOrgIds])
  };
}

function buildPatientAccessConditions(context) {
  const { user, orgIds } = context;
  const conditions = [
    { caretaker: user._id },
    { assignedNurses: user._id },
    { assignedDoctor: user._id }
  ];

  if (orgIds.length) {
    conditions.push({ organization: { $in: orgIds } });
  }

  return conditions;
}

function patientMatchesAccess(patient, context) {
  const { user, orgIds } = context;
  if (idsEqual(patient.caretaker, user._id)) return true;
  if ((patient.assignedNurses || []).some(nurseId => idsEqual(nurseId, user._id))) return true;
  if (idsEqual(patient.assignedDoctor, user._id)) return true;
  if (patient.organization && orgIds.some(orgId => idsEqual(orgId, patient.organization))) return true;
  return false;
}

async function getAccessiblePatientIds(userId) {
  const context = await getPatientAccessContext(userId);
  const conditions = buildPatientAccessConditions(context);
  const patients = await Patient.find({
    isDeleted: { $ne: true },
    $or: conditions
  }).select('_id').lean();

  return patients.map(patient => patient._id);
}

async function validateAccessiblePatient(userId, patientId) {
  if (!isValidObjectId(patientId)) {
    return { ok: false, status: 400, error: 'Invalid patientId format' };
  }

  const [context, patient] = await Promise.all([
    getPatientAccessContext(userId),
    Patient.findOne({ _id: patientId, isDeleted: { $ne: true } })
      .select('_id organization caretaker assignedNurses assignedDoctor')
      .lean()
  ]);

  if (!patient) {
    return { ok: false, status: 404, error: 'Patient not found' };
  }

  if (!patientMatchesAccess(patient, context)) {
    return { ok: false, status: 403, error: 'You do not have access to this patient' };
  }

  return { ok: true, patient };
}

async function buildScopedRecordFilter(userId, patientId) {
  if (patientId) {
    const access = await validateAccessiblePatient(userId, patientId);
    if (!access.ok) {
      return { ok: false, status: access.status, error: access.error };
    }
    return { ok: true, filter: { patient: access.patient._id } };
  }

  const accessiblePatientIds = await getAccessiblePatientIds(userId);
  if (!accessiblePatientIds.length) {
    return { ok: true, filter: { user_id: userId } };
  }

  return {
    ok: true,
    filter: {
      $or: [
        { user_id: userId },
        { patient: { $in: accessiblePatientIds } }
      ]
    }
  };
}

module.exports = {
  buildScopedRecordFilter,
  getAccessiblePatientIds,
  validateAccessiblePatient
};
