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
      title, firstName, lastName, middleName, preferredName, birthSex, dateOfBirth,
      genderIdentity, pronouns, ethnicity, countryOfBirth, preferredLanguage, interpreterRequired, 
      addressLine1, addressLine2, cityOrSuburb, postCode, homePhone, mobilePhone, workPhone, contactVia, email,
      optOutofDeidentifiedDataSharing, updateAddressOfAllFamilyMembers,
      healthIdentifier, medicareNumber, irn, expiryDate, pensionHccNumber, pensionCardType, dvaNumber,
      doctorId, nurseIds, caretakerId,
      organization, usualAccount, healthInsuranceProvider, healthInsuranceNumber, healthInsuranceExpiryDate,
      religion, headOfFamily, nextOfKin, nextOfKinRelationship, emergencyContact,
      occupation, isActive, isDeceased, dateOfDeath, causeOfDeath,
      generalNotes, appointmentNotes, allergies, conditions
    } = req.body || {};
    const postCommitOrgLinks = new Set();
    const nursesIds = nurseIds == null
      ? []
      : (Array.isArray(nursesIds) ? nursesIds : [nursesIds]);

    if (!firstName || !lastName || !birthSex || !dateOfBirth || !caretakerId) {
      return res.status(400).json({
        message: 'firstName, lastName, birthSex, dateOfBirth and caretakerId are required'
      });
    }

    const adminOrg = await findAdminOrg(req.user._id, req.query.orgId);
    if (!adminOrg) return res.status(404).json({ message: 'Organization not found for admin' });

    // caretaker must be valid and have role caretaker
    const ct = await ensureUserWithRole(toId(caretakerId), 'caretaker');
    if (!ct) {
      return res.status(400).json({ message: 'caretakerId must be a caretaker' });
    }

    const orgId = adminOrg._id;
    if (ct.organization) {
      if (!assertSameOrg(adminOrg, ct)) {
        return res.status(400).json({ message: 'Caretaker belongs to another organization' });
      }
    } else {
      postCommitOrgLinks.add(String(ct._id));
    }

    const nurses = [];
    for (const nurseId of nurseIds) {
      const nd = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nd) {
        return res.status(400).json({ message: 'assignedNurses must be a nurse' });
      }

      const ensured = await ensureStaffBoundToOrg(nd, adminOrg);
      if (!ensured.ok) return res.status(400).json({ message: 'assignedNurses must be a nurse in this org' });
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(nd._id));
      if (!nurses.some((nurse) => String(nurse._id) === String(nd._id))) nurses.push(nd);
    }

    let doctor = null;
    if (doctorId) {
      const dd = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!dd) {
        return res.status(400).json({ message: 'doctorId must be a doctor' });
      }

      const ensured = await ensureStaffBoundToOrg(dd, adminOrg);
      if (!ensured.ok) return res.status(400).json({ message: 'assignedDoctor must be a doctor in this org' });
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(dd._id));
      doctor = dd;
    }

    const patient = await Patient.create({
      title,
      firstName,
      lastName,
      middleName,
      preferredName,
      birthSex,
      dateOfBirth: new Date(dateOfBirth),
      genderIdentity,
      pronouns,
      ethnicity,
      countryOfBirth,
      preferredLanguage,
      interpreterRequired,
      addressLine1,
      addressLine2,
      cityOrSuburb,
      postCode,
      homePhone,
      mobilePhone,
      workPhone,
      contactVia,
      email,
      optOutofDeidentifiedDataSharing,
      updateAddressOfAllFamilyMembers,
      healthIdentifier,
      medicareNumber,
      irn,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      pensionHccNumber,
      pensionCardType,
      dvaNumber,
      doctorId: doctor ? doctor._id : null,
      nurseIds: nurses ? nurses : [],
      caretakerId: caretaker ? caretaker._id : null,
      organization: orgId,
      usualAccount,
      healthInsuranceProvider,
      healthInsuranceNumber,
      healthInsuranceExpiryDate: healthInsuranceExpiryDate ? new Date(healthInsuranceExpiryDate) : null,
      religion,
      headOfFamily,
      nextOfKin,
      nextOfKinRelationship,
      emergencyContact,
      occupation,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      isDeceased: isDeceased !== undefined ? Boolean(isDeceased) : false,
      dateOfDeath: dateOfDeath ? new Date(dateOfDeath) : null,
      causeOfDeath,
      organization: orgId,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      generalNotes,
      appointmentNotes,
      allergies: parseStringArray(allergies),
      conditions: parseStringArray(conditions),
      isDeleted: false
    });

    const postCommitOps = [];
    for (const userId of postCommitOrgLinks) {
      postCommitOps.push(
        User.updateOne({ _id: userId }, { $set: { organization: toObjectId(adminOrg._id) } })
      );
    }
    postCommitOps.push(addAssignedPatient(ct._id, patient._id));
    for (const nurse of nurses) postCommitOps.push(addAssignedPatient(nurse._id, patient._id));
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

    const { nurseIds, caretakerId, doctorId } = req.body || {};
    const updates = {};
    const reverseLinksToAdd = new Set();
    const reverseLinksToRemove = new Set();
    const postCommitOrgLinks = new Set();

    if (!nurseIds && !caretakerId && !doctorId) {
      return res.status(400).json({
        message: 'At least one of nurseIds, doctorId, or caretakerId is required'
      });
    }

    // Assign nurse
    if (nurseIds && nurseIds.length > 0) {
      const nurse = await ensureUserWithRole(toId(nurseIds[0]), 'nurse');
      if (!nurse) {
        return res.status(400).json({ message: 'nurseIds must be a nurse' });
      }

      const ensured = await ensureStaffBoundToOrg(nurse, org);
      if (!ensured.ok) {
        return res.status(400).json({
          message: 'nurseIds must be a nurse in this org'
        });
      }
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(nurse._id));

      const currentNurseIds = (patient.nurseIds || []).map(String);
      const nextNurseId = String(nurse._id);
      if (!currentNurseIds.includes(nextNurseId)) {
        reverseLinksToAdd.add(nextNurseId);
        updates.nurseIds = [
          ...(patient.nurseIds || []).map((nId) => toObjectId(nId)),
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

      if (patient.doctorId && String(patient.doctorId) !== String(doctor._id)) {
        reverseLinksToRemove.add(String(patient.doctorId));
      }
      if (String(patient.doctorId || '') !== String(doctor._id)) {
        reverseLinksToAdd.add(String(doctor._id));
      }

      updates.doctorId = toObjectId(doctor._id);
    }

    // Assign caretaker
    if (caretakerId) {
      const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
      if (!caretaker) {
        return res.status(400).json({ message: 'caretakerId must be a caretaker' });
      }

      const caretakerUnchanged =
        patient.caretakerId && String(patient.caretakerId) === String(caretaker._id);

      if (!caretakerUnchanged) {
        const linkResult = await linkCaretakerToOrgIfFreelance(caretaker, org, { applyLink: false });
        if (linkResult.movedFromOtherOrg) {
          return res.status(400).json({
            message: 'Caretaker belongs to another organization'
          });
        }
        if (linkResult.needsOrgLink) postCommitOrgLinks.add(String(caretaker._id));
        if (patient.caretakerId) reverseLinksToRemove.add(String(patient.caretakerId));
        reverseLinksToAdd.add(String(caretaker._id));

        updates.caretakerId = toObjectId(caretaker._id);
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
      .populate('caretakerId', 'fullname email')
      .populate('nurseIds', 'fullname email')
      .populate('doctorId', 'fullname email');

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

    const text = q
      ? { $or: [{ firstName: new RegExp(q, 'i') }, { lastName: new RegExp(q, 'i') }] }
      : {};
    const filter = {
      organization: toObjectId(org._id),
      isDeleted: String(active).toLowerCase() === 'false' ? true : false,
      ...text,
    };

    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [docs, total] = await Promise.all([
      Patient.find(filter)
        .populate('caretakerId', 'fullname email')
        .populate('nurseIds', 'fullname email')
        .populate('doctorId', 'fullname email')
        .sort({ createdAt: -1 })
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
      .populate('caretakerId', 'fullname email')
      .populate('nurseIds', 'fullname email')
      .populate('doctorId', 'fullname email');

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
      patient.assignedCaretaker ? removeAssignedPatient(patient.assignedCaretaker, id) : Promise.resolve(),
      ...(patient.assignedNurses || []).map(nId => removeAssignedPatient(nId, id)),
      patient.assignedDoctor ? removeAssignedPatient(patient.assignedDoctor, id) : Promise.resolve(),
    ]);

    return res.status(200).json({ message: 'Patient deactivated' });
  } catch (err) {
    return sendControllerError(res, err, 'Error deactivating patient');
  }
};
