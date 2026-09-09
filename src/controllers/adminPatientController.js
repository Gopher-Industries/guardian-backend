'use strict';

const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { parseStringArray } = require('../utils/arrayUtils');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');
const EntryReport = require('../models/EntryReport');

const {
  calculateAge,
  addAssignedPatient,
  removeAssignedPatient,
} = require('../services/patientService');

const { ensureUserWithRole } = require('../services/userService');

const {
  assertSameOrg,
  findAdminOrg,
  linkCaretakerToOrgIfFreelance,
  isUserInOrg,
  toId, // Safely extracts an ObjectId-compatible value
} = require('../services/orgService');

/* --------------------------- Helper Functions --------------------------- */

/**
 * Converts a value into a MongoDB ObjectId after safely extracting its id.
 * Returns undefined if no valid id can be derived.
 */
const toObjectId = (val) => {
  const id = toId(val);
  if (!id) return undefined;
  return new mongoose.Types.ObjectId(String(id));
};

const sendControllerError = (res, err, fallbackMessage) => {
  if (err?.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage, details: err.message });
};

/**
 * Ensures that a staff member (nurse or doctor) belongs to the given organization.
 *
 * Behaviour:
 * - If already linked to the organization, access is allowed.
 * - If not linked in the user document but present in org.staff, the organization link is auto-fixed.
 * - Otherwise, the user is rejected as not belonging to the organization.
 */
async function ensureStaffBoundToOrg(userDoc, orgDoc, options = {}) {
  if (!userDoc || !orgDoc) return { ok: false, reason: 'missing' };
  if (assertSameOrg(orgDoc, userDoc)) return { ok: true };

  if (isUserInOrg(userDoc, orgDoc) || isUserInOrg({ _id: userDoc._id }, orgDoc)) {
    if (options.applyLink) {
      const User = require('../models/User');
      await User.updateOne({ _id: userDoc._id }, { $set: { organization: toObjectId(orgDoc._id) } });
    }
    return { ok: true, linked: Boolean(options.applyLink), needsOrgLink: true };
  }

  return { ok: false, reason: 'not_in_staff' };
}


exports.createPatient = async (req, res) => {
  try {
    if (req.body && typeof req.body === 'object' && 'organization' in req.body) {
      delete req.body.organization;
    }

    const {
      fullname, gender, dateOfBirth,
      caretakerId, nurseId, doctorId,
      profilePhoto, image, dateOfAdmitting, description,
      emergencyContactName, emergencyContactNumber,
      nextOfKinName, nextOfKinRelationship, medicalSummary,
      allergies, conditions, notes
    } = req.body || {};
    const postCommitOrgLinks = new Set();

    if (!fullname || !gender || !dateOfBirth || !caretakerId) {
      return res.status(400).json({
        message: 'fullname, gender, dateOfBirth and caretakerId are required'
      });
    }

    const adminOrg = await findAdminOrg(req.user._id, req.query.orgId);
    if (!adminOrg) return res.status(404).json({ message: 'Organization not found for admin' });

    // caretaker must be valid and have role caretaker
    const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
    if (!caretaker) {
      return res.status(400).json({ message: 'caretakerId must be a caretaker' });
    }

    let orgId = adminOrg._id;
    if (caretaker.organization) {
      if (!assertSameOrg(adminOrg, caretaker)) {
        return res.status(400).json({ message: 'Caretaker belongs to another organization' });
      }
      orgId = caretaker.organization;
    } else {
      postCommitOrgLinks.add(String(caretaker._id));
    }

    let nurse = null;
    if (nurseId) {
      const nd = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nd) {
        return res.status(400).json({ message: 'nurseId must be a nurse' });
      }

      const ensured = await ensureStaffBoundToOrg(nd, adminOrg);
      if (!ensured.ok) return res.status(400).json({ message: 'nurseId must be a nurse in this org' });
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(nd._id));
      nurse = nd;
    }

    let doctor = null;
    if (doctorId) {
      const dd = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!dd) {
        return res.status(400).json({ message: 'doctorId must be a doctor' });
      }

      const ensured = await ensureStaffBoundToOrg(dd, adminOrg);
      if (!ensured.ok) return res.status(400).json({ message: 'doctorId must be a doctor in this org' });
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(dd._id));
      doctor = dd;
    }

    const patient = await Patient.create({
      fullname,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      organization: orgId,
      caretaker: caretaker._id,
      assignedNurses: nurse ? [nurse._id] : [],
      assignedDoctor: doctor ? doctor._id : null,
      profilePhoto: profilePhoto || image || null,
      dateOfAdmitting: dateOfAdmitting ? new Date(dateOfAdmitting) : null,
      description: description || '',
      emergencyContactName,
      emergencyContactNumber,
      nextOfKinName,
      nextOfKinRelationship,
      medicalSummary,
      allergies: parseStringArray(allergies),
      conditions: parseStringArray(conditions),
      notes,
      isDeleted: false
    });

    const postCommitOps = [];
    for (const userId of postCommitOrgLinks) {
      postCommitOps.push(
        User.updateOne({ _id: userId }, { $set: { organization: toObjectId(adminOrg._id) } })
      );
    }
    postCommitOps.push(addAssignedPatient(caretaker._id, patient._id));
    if (nurse) postCommitOps.push(addAssignedPatient(nurse._id, patient._id));
    if (doctor) postCommitOps.push(addAssignedPatient(doctor._id, patient._id));
    await Promise.all(postCommitOps);

    return res.status(201).json({
      message: 'Patient created',
      patient: { ...patient.toObject(), age: calculateAge(patient.dateOfBirth) }
    });
  } catch (err) {
    return sendControllerError(res, err, 'Error creating patient');
  }
};

/* ---------------------------------------------------------------------- */

exports.reassign = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    const { nurseId, caretakerId, doctorId } = req.body || {};
    const updates = {};
    const reverseLinksToAdd = new Set();
    const reverseLinksToRemove = new Set();
    const postCommitOrgLinks = new Set();

    if (!nurseId && !caretakerId && !doctorId) {
      return res.status(400).json({
        message: 'At least one of nurseId, doctorId, or caretakerId is required'
      });
    }

    // Assign nurse
    if (nurseId) {
      const nurse = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nurse) {
        return res.status(400).json({ message: 'nurseId must be a nurse' });
      }

      const ensured = await ensureStaffBoundToOrg(nurse, org);
      if (!ensured.ok) {
        return res.status(400).json({
          message: 'nurseId must be a nurse in this org'
        });
      }
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(nurse._id));

      const currentNurseIds = (patient.assignedNurses || []).map(String);
      const nextNurseId = String(nurse._id);
      if (!currentNurseIds.includes(nextNurseId)) {
        reverseLinksToAdd.add(nextNurseId);
        updates.assignedNurses = [
          ...(patient.assignedNurses || []).map((nId) => toObjectId(nId)),
          toObjectId(nurse._id),
        ];
      }
    }

    // Assign doctor
    if (doctorId) {
      const doctor = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!doctor) {
        return res.status(400).json({ message: 'doctorId must be a doctor' });
      }

      const ensured = await ensureStaffBoundToOrg(doctor, org);
      if (!ensured.ok) {
        return res.status(400).json({
          message: 'doctorId must be a doctor in this org'
        });
      }
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(doctor._id));

      if (patient.assignedDoctor && String(patient.assignedDoctor) !== String(doctor._id)) {
        reverseLinksToRemove.add(String(patient.assignedDoctor));
      }
      if (String(patient.assignedDoctor || '') !== String(doctor._id)) {
        reverseLinksToAdd.add(String(doctor._id));
      }

      updates.assignedDoctor = toObjectId(doctor._id);
    }

    // Assign caretaker
    if (caretakerId) {
      const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
      if (!caretaker) {
        return res.status(400).json({ message: 'caretakerId must be a caretaker' });
      }

      const caretakerUnchanged =
        patient.caretaker && String(patient.caretaker) === String(caretaker._id);

      if (!caretakerUnchanged) {
        const linkResult = await linkCaretakerToOrgIfFreelance(caretaker, org, { applyLink: false });
        if (linkResult.movedFromOtherOrg) {
          return res.status(400).json({
            message: 'Caretaker belongs to another organization'
          });
        }
        if (linkResult.needsOrgLink) postCommitOrgLinks.add(String(caretaker._id));
        if (patient.caretaker) reverseLinksToRemove.add(String(patient.caretaker));
        reverseLinksToAdd.add(String(caretaker._id));

        updates.caretaker = toObjectId(caretaker._id);
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(200).json({
        message: 'No assignment changes applied',
        data: {
          patientId: patient._id,
        }
      });
    }

    const updated = await Patient.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email');

    const postCommitOps = [];
    for (const userId of postCommitOrgLinks) {
      postCommitOps.push(
        User.updateOne({ _id: userId }, { $set: { organization: toObjectId(org._id) } })
      );
    }
    for (const userId of reverseLinksToRemove) {
      postCommitOps.push(removeAssignedPatient(userId, patient._id));
    }
    for (const userId of reverseLinksToAdd) {
      postCommitOps.push(addAssignedPatient(userId, patient._id));
    }
    await Promise.all(postCommitOps);

    const age = calculateAge(updated?.dateOfBirth);

    return res.status(200).json({
      message: 'Assignments updated',
      patient: { ...updated.toObject(), age }
    });
  } catch (err) {
    return sendControllerError(res, err, 'Error reassigning');
  }
};

/* ---------------------------------------------------------------------- */

exports.listPatients = async (req, res) => {
  try {
    const { orgId, q, page = 1, limit = 10, active = 'true' } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const text = q ? { fullname: new RegExp(q, 'i') } : {};
    const filter = {
      organization: toObjectId(org._id),
      isDeleted: String(active).toLowerCase() === 'false' ? true : false,
      ...text,
    };

    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [docs, total] = await Promise.all([
      Patient.find(filter)
        .populate('caretaker', 'fullname email')
        .populate('assignedNurses', 'fullname email')
        .populate('assignedDoctor', 'fullname email')
        .sort({ created_at: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Patient.countDocuments(filter),
    ]);

    const patients = docs.map(d => ({ ...d, age: calculateAge(d.dateOfBirth) }));

    return res.status(200).json({
      patients,
      pagination: { total, page: p, pages: Math.ceil(total / l), limit: l },
    });
  } catch (err) {
    return sendControllerError(res, err, 'Error listing patients');
  }
};

/* ---------------------------------------------------------------------- */

exports.patientOverview = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(id)
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email');

    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    const [healthRecords, carePlan, tasks, logs] = await Promise.all([
      HealthRecord.find({ patient: id }).sort({ created_at: -1 }).lean(),
      CarePlan.findOne({ patient: id, status: 'active' }).sort({ created_at: -1 }).populate('tasks').lean(),
      Task.find({ patient: id }).lean(),
      EntryReport.find({ patient: id }).sort({ activityTimestamp: -1 }).lean(),
    ]);

    const taskCompletionRate = tasks.length
      ? (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100
      : 0;

    const age = calculateAge(patient.dateOfBirth);

    return res.status(200).json({
      patient: { ...patient.toObject(), age },
      healthRecords,
      carePlan,
      tasks,
      logs,
      taskCompletionRate,
    });
  } catch (err) {
    return sendControllerError(res, err, 'Error fetching patient overview');
  }
};

/* ---------------------------------------------------------------------- */

exports.deactivatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;
    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    await Patient.findByIdAndUpdate(id, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    });

    await Promise.all([
      patient.caretaker ? removeAssignedPatient(patient.caretaker, id) : Promise.resolve(),
      ...(patient.assignedNurses || []).map(nId => removeAssignedPatient(nId, id)),
      patient.assignedDoctor ? removeAssignedPatient(patient.assignedDoctor, id) : Promise.resolve(),
    ]);

    return res.status(200).json({ message: 'Patient deactivated' });
  } catch (err) {
    return sendControllerError(res, err, 'Error deactivating patient');
  }
};
