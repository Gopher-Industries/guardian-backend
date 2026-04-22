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
  toId, // helper that extracts object id safely
} = require('../services/orgService');

/* --------------------------- helpers --------------------------- */
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
 * Make sure a staff user (nurse/doctor) actually belongs to the org.
 * If not bound yet, but present in org.staff, then we auto-link them.
 * Else, we reject it.
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

/**
 * @swagger
 * tags:
 *   - name: AdminPatients
 *     description: Admin — manage patients scoped to an organization
 */

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/patients:
 *   post:
 *     tags: [AdminPatients]
 *     summary: Create a new patient under caretaker’s org
 *     description: >
 *       Creates a patient record. The **organization** is inferred from the caretaker (or from the admin's org if the caretaker is freelance).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Optional org override (Mongo ObjectId). If omitted, uses the admin's primary org.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullname
 *               - gender
 *               - dateOfBirth
 *               - caretakerId
 *             properties:
 *               fullname:
 *                 type: string
 *                 minLength: 1
 *                 example: John Doe
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 example: male
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: 1980-05-17
 *               caretakerId:
 *                 type: string
 *                 description: User ID of the caretaker (Mongo ObjectId)
 *                 example: 66ef5b7d9f3a1d0012ab34aa
 *               nurseId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional nurse to assign (Mongo ObjectId)
 *               doctorId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional doctor to assign (Mongo ObjectId)
 *               profilePhoto:
 *                 type: string
 *                 nullable: true
 *                 description: URL of profile photo
 *               dateOfAdmitting:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               description:
 *                 type: string
 *                 nullable: true
 *                 default: ""
 *               emergencyContactName:
 *                 type: string
 *                 nullable: true
 *               emergencyContactNumber:
 *                 type: string
 *                 nullable: true
 *               nextOfKinName:
 *                 type: string
 *                 nullable: true
 *                 description: Full name of the patient's next of kin
 *               nextOfKinRelationship:
 *                 type: string
 *                 nullable: true
 *                 enum: [SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER]
 *                 description: Relationship of the next of kin to the patient
 *               medicalSummary:
 *                 type: string
 *                 nullable: true
 *               allergies:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               conditions:
 *                 type: array
 *                 items: { type: string }
 *                 nullable: true
 *               notes:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, patient]
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Patient created
 *                 patient:
 *                   type: object
 *                   required: [_id, fullname, gender, dateOfBirth, organization, caretaker, isDeleted]
 *                   properties:
 *                     _id: { type: string, example: 66ef5c2a9f3a1d0012ab34cd }
 *                     fullname: { type: string, example: John Doe }
 *                     gender: { type: string, example: male }
 *                     dateOfBirth: { type: string, format: date }
 *                     age: { type: integer, example: 44 }
 *                     organization: { type: string }
 *                     caretaker: { type: string }
 *                     assignedNurses:
 *                       type: array
 *                       items: { type: string }
 *                     assignedDoctor: { type: string, nullable: true }
 *                     profilePhoto: { type: string, nullable: true }
 *                     dateOfAdmitting: { type: string, format: date, nullable: true }
 *                     description: { type: string }
 *                     isDeleted: { type: boolean, example: false }
 *       400:
 *         description: Validation error or bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message: { type: string, example: "fullname, gender, dateOfBirth and caretakerId are required" }
 *                 details: { type: string, example: "nurseId must be a nurse" }
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message: { type: string, example: "Organization not found for admin" }
 *       500:
 *         description: Error creating patient
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message: { type: string, example: "Error creating patient" }
 *                 details: { type: string, example: "Database connection failed" }
 */
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
      return res.status(400).json({ message: 'fullname, gender, dateOfBirth and caretakerId are required' });
    }

    const adminOrg = await findAdminOrg(req.user._id, req.query.orgId);
    if (!adminOrg) return res.status(404).json({ message: 'Organization not found for admin' });

    // caretaker must be valid and have role caretaker
    const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
    if (!caretaker) return res.status(400).json({ message: 'caretakerId must be a caretaker' });

    let orgId = adminOrg._id;
    if (caretaker.organization) {
      if (!assertSameOrg(adminOrg, caretaker)) {
        return res.status(400).json({ message: 'Caretaker belongs to another organization' });
      }
      orgId = caretaker.organization;
    } else {
      postCommitOrgLinks.add(String(caretaker._id));
    }

    // validate nurse if provided
    let nurse = null;
    if (nurseId) {
      const nd = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nd) return res.status(400).json({ message: 'nurseId must be a nurse' });

      const ensured = await ensureStaffBoundToOrg(nd, adminOrg);
      if (!ensured.ok) return res.status(400).json({ message: 'nurseId must be a nurse in this org' });
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(nd._id));
      nurse = nd;
    }

    // validate doctor if provided
    let doctor = null;
    if (doctorId) {
      const dd = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!dd) return res.status(400).json({ message: 'doctorId must be a doctor' });

      const ensured = await ensureStaffBoundToOrg(dd, adminOrg);
      if (!ensured.ok) return res.status(400).json({ message: 'doctorId must be a doctor in this org' });
      if (ensured.needsOrgLink) postCommitOrgLinks.add(String(dd._id));
      doctor = dd;
    }

    // finally create patient
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
/**
 * @swagger
 * /api/v1/admin/patients/{id}/reassign:
 *   put:
 *     tags: [AdminPatients]
 *     summary: Reassign caretaker, nurse, or doctor for a patient
 *     description: >
 *       Add/replace patient assignments. **At least one** of `nurseId`, `doctorId`, or `caretakerId` must be provided.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context (admin)
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient ID (Mongo ObjectId)
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             anyOf:
 *               - required: [nurseId]
 *               - required: [doctorId]
 *               - required: [caretakerId]
 *             properties:
 *               nurseId:
 *                 type: string
 *                 nullable: true
 *                 description: Nurse to (add) assign
 *               caretakerId:
 *                 type: string
 *                 nullable: true
 *                 description: Caretaker to (re)assign
 *               doctorId:
 *                 type: string
 *                 nullable: true
 *                 description: Doctor to (re)assign
 *     responses:
 *       200:
 *         description: Assignment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, patient]
 *               properties:
 *                 message: { type: string, example: Assignments updated }
 *                 patient:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     fullname: { type: string }
 *                     age: { type: integer }
 *                     caretaker:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id: { type: string }
 *                         fullname: { type: string }
 *                         email: { type: string }
 *                     assignedNurses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           fullname: { type: string }
 *                           email: { type: string }
 *                     assignedDoctor:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id: { type: string }
 *                         fullname: { type: string }
 *                         email: { type: string }
 *       400:
 *         description: Invalid ids or role mismatch
 *       403:
 *         description: Patient not under this org
 *       404:
 *         description: Org or patient not found
 */
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

    // assign nurse
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
      currentNurseIds
        .filter((nId) => nId !== nextNurseId)
        .forEach((nId) => reverseLinksToRemove.add(nId));
      if (!currentNurseIds.includes(nextNurseId)) reverseLinksToAdd.add(nextNurseId);

      updates.assignedNurses = [toObjectId(nurse._id)];
    }

    // assign doctor
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

    // assign caretaker
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
    return res.status(200).json({ message: 'Assignments updated', patient: { ...updated.toObject(), age } });
  } catch (err) {
    return sendControllerError(res, err, 'Error reassigning');
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/patients:
 *   get:
 *     tags: [AdminPatients]
 *     summary: List patients for admin org
 *     description: Paginates patients in the current organization. Use `active=false` to view soft-deleted patients.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context (admin)
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         required: false
 *         description: Search text (matches fullname, case-insensitive)
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: active
 *         required: false
 *         description: true = active patients, false = soft-deleted
 *         schema:
 *           type: string
 *           enum: [true, false]
 *           default: "true"
 *     responses:
 *       200:
 *         description: List of patients with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [patients, pagination]
 *               properties:
 *                 patients:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [_id, fullname, gender, dateOfBirth]
 *                     properties:
 *                       _id: { type: string }
 *                       fullname: { type: string }
 *                       gender: { type: string, enum: [M, F, other] }
 *                       dateOfBirth: { type: string, format: date }
 *                       age: { type: integer }
 *                       profilePhoto: { type: string, nullable: true, description: "URL or filename of the patient's profile photo" }
 *                       dateOfAdmitting: { type: string, format: date, nullable: true }
 *                       description: { type: string, description: General notes about the patient }
 *                       emergencyContactName:
 *                         type: string
 *                         nullable: true
 *                         description: Full name of the emergency contact
 *                       emergencyContactNumber:
 *                         type: string
 *                         nullable: true
 *                         description: Phone number of the emergency contact
 *                       nextOfKinName:
 *                         type: string
 *                         nullable: true
 *                         description: Full name of the patient's next of kin
 *                       nextOfKinRelationship:
 *                         type: string
 *                         nullable: true
 *                         enum: [SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER]
 *                         description: Relationship of the next of kin to the patient
 *                       medicalSummary:
 *                         type: string
 *                         nullable: true
 *                         description: Brief summary of the patient's overall medical history and status
 *                       allergies:
 *                         type: array
 *                         items: { type: string }
 *                         description: List of known allergies (e.g. penicillin, peanuts)
 *                       conditions:
 *                         type: array
 *                         items: { type: string }
 *                         description: List of diagnosed medical conditions (e.g. Type 2 Diabetes, Hypertension)
 *                       notes:
 *                         type: string
 *                         nullable: true
 *                         description: Free-text clinical or care notes for the patient
 *                       caretaker:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           _id: { type: string }
 *                           fullname: { type: string }
 *                           email: { type: string }
 *                       assignedNurses:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id: { type: string }
 *                             fullname: { type: string }
 *                             email: { type: string }
 *                       assignedDoctor:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           _id: { type: string }
 *                           fullname: { type: string }
 *                           email: { type: string }
 *                 pagination:
 *                   type: object
 *                   required: [total, page, pages, limit]
 *                   properties:
 *                     total: { type: integer, example: 42 }
 *                     page: { type: integer, example: 1 }
 *                     pages: { type: integer, example: 5 }
 *                     limit: { type: integer, example: 10 }
 *       404:
 *         description: Org not found
 */
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
/**
 * @swagger
 * /api/v1/admin/patients/{id}/overview:
 *   get:
 *     tags: [AdminPatients]
 *     summary: Get patient full overview (records, care plan, tasks, logs)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context (admin)
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient ID (Mongo ObjectId)
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full patient overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [patient, healthRecords, carePlan, tasks, logs, taskCompletionRate]
 *               properties:
 *                 patient:
 *                   type: object
 *                   required: [_id, fullname, gender, dateOfBirth]
 *                   properties:
 *                     _id: { type: string }
 *                     fullname: { type: string }
 *                     gender: { type: string, enum: [M, F, other] }
 *                     dateOfBirth: { type: string, format: date }
 *                     age: { type: integer }
 *                     profilePhoto: { type: string, nullable: true, description: "URL or filename of the patient's profile photo" }
 *                     dateOfAdmitting: { type: string, format: date, nullable: true }
 *                     description: { type: string, description: General notes about the patient }
 *                     emergencyContactName:
 *                       type: string
 *                       nullable: true
 *                       description: Full name of the emergency contact
 *                     emergencyContactNumber:
 *                       type: string
 *                       nullable: true
 *                       description: Phone number of the emergency contact
 *                     nextOfKinName:
 *                       type: string
 *                       nullable: true
 *                       description: Full name of the patient's next of kin
 *                     nextOfKinRelationship:
 *                       type: string
 *                       nullable: true
 *                       enum: [SPOUSE, PARENT, CHILD, SIBLING, GRANDPARENT, GUARDIAN, CARER, FRIEND, OTHER]
 *                       description: Relationship of the next of kin to the patient
 *                     medicalSummary:
 *                       type: string
 *                       nullable: true
 *                       description: Brief summary of the patient's overall medical history and status
 *                     allergies:
 *                       type: array
 *                       items: { type: string }
 *                       description: List of known allergies (e.g. penicillin, peanuts)
 *                     conditions:
 *                       type: array
 *                       items: { type: string }
 *                       description: List of diagnosed medical conditions (e.g. Type 2 Diabetes, Hypertension)
 *                     notes:
 *                       type: string
 *                       nullable: true
 *                       description: Free-text clinical or care notes for the patient
 *                     caretaker:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id: { type: string }
 *                         fullname: { type: string }
 *                         email: { type: string }
 *                     assignedNurses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           fullname: { type: string }
 *                           email: { type: string }
 *                     assignedDoctor:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id: { type: string }
 *                         fullname: { type: string }
 *                         email: { type: string }
 *                 healthRecords:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       patient: { type: string }
 *                       title: { type: string }
 *                       details: { type: string }
 *                       created_at: { type: string, format: date-time }
 *                 carePlan:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     _id: { type: string }
 *                     patient: { type: string }
 *                     title: { type: string }
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       title: { type: string }
 *                       status: { type: string, example: completed }
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       patient: { type: string }
 *                       activityTimestamp: { type: string, format: date-time }
 *                       note: { type: string }
 *                 taskCompletionRate:
 *                   type: number
 *                   format: float
 *                   example: 66.7
 *       403:
 *         description: Patient not under org
 *       404:
 *         description: Org or patient not found
 */
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
      CarePlan.findOne({ patient: id }).populate('tasks').lean(),
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
/**
 * @swagger
 * /api/v1/admin/patients/{id}:
 *   delete:
 *     tags: [AdminPatients]
 *     summary: Deactivate a patient (soft delete)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context (admin)
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient ID (Mongo ObjectId)
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Patient deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message]
 *               properties:
 *                 message: { type: string, example: Patient deactivated }
 *       403:
 *         description: Patient not under org
 *       404:
 *         description: Org or patient not found
 */
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
