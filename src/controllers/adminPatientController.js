'use strict';

const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { parseStringArray } = require('../utils/arrayUtils');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');
const EntryReport = require('../models/EntryReport');
const User = require('../models/User');

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

/**
 * Ensures that a staff member (nurse or doctor) belongs to the given organization.
 *
 * Behaviour:
 * - If already linked to the organization, access is allowed.
 * - If not linked in the user document but present in org.staff, the organization link is auto-fixed.
 * - Otherwise, the user is rejected as not belonging to the organization.
 */
async function ensureStaffBoundToOrg(userDoc, orgDoc) {
  if (!userDoc || !orgDoc) return { ok: false, reason: 'missing' };
  if (assertSameOrg(orgDoc, userDoc)) return { ok: true };

  if (isUserInOrg(userDoc, orgDoc) || isUserInOrg({ _id: userDoc._id }, orgDoc)) {
    const User = require('../models/User');
    await User.updateOne(
      { _id: userDoc._id },
      { $set: { organization: toObjectId(orgDoc._id) } }
    );
    return { ok: true, linked: true };
  }

  return { ok: false, reason: 'not_in_staff' };
}

/**
 * @swagger
 * tags:
 *   - name: AdminPatients
 *     description: Administrative patient management endpoints scoped to an organization
 */

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/patients:
 *   post:
 *     summary: Create a patient within the admin's organization
 *     description: Creates a new patient record under the organization managed by the authenticated admin.
 *     tags: [AdminPatients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional organization ID when the admin manages more than one organization
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
 *                 example: John Smith
 *               gender:
 *                 type: string
 *                 example: Male
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: 1950-05-14
 *               caretakerId:
 *                 type: string
 *                 example: 661111111111111111111111
 *               nurseId:
 *                 type: string
 *                 example: 662222222222222222222222
 *               doctorId:
 *                 type: string
<<<<<<< HEAD
 *                 example: 663333333333333333333333
 *               image:
=======
 *                 nullable: true
 *                 description: Optional doctor to assign (Mongo ObjectId)
 *               profilePhoto:
>>>>>>> origin/main
 *                 type: string
 *                 example: https://example.com/profile.jpg
 *               dateOfAdmitting:
 *                 type: string
 *                 format: date
 *                 example: 2026-04-11
 *               description:
 *                 type: string
<<<<<<< HEAD
 *                 example: Patient admitted for regular monitoring
=======
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
>>>>>>> origin/main
 *     responses:
 *       201:
 *         description: Patient created successfully
 *       400:
 *         description: Validation failed or assigned staff does not belong to the organization
 *       404:
 *         description: No organization found for the authenticated admin
 *       500:
 *         description: Internal server error while creating the patient
 */
exports.createPatient = async (req, res) => {
  try {
    if (req.body && typeof req.body === 'object' && 'organization' in req.body) {
      delete req.body.organization;
    }

    const {
<<<<<<< HEAD
      fullname,
      gender,
      dateOfBirth,
      caretakerId,
      nurseId,
      doctorId,
      image,
      dateOfAdmitting,
      description
=======
      fullname, gender, dateOfBirth,
      caretakerId, nurseId, doctorId,
      profilePhoto, image, dateOfAdmitting, description,
      emergencyContactName, emergencyContactNumber,
      nextOfKinName, nextOfKinRelationship, medicalSummary,
      allergies, conditions, notes
>>>>>>> origin/main
    } = req.body || {};

    if (!fullname || !gender || !dateOfBirth || !caretakerId) {
      return res.status(400).json({
        message: 'fullname, gender, dateOfBirth and caretakerId are required'
      });
    }

    const org = await findAdminOrg(req.user._id, req.query.orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found for admin' });
    }

    const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
    if (!caretaker) {
      return res.status(400).json({ message: 'caretakerId must be a caretaker' });
    }

    const caretakerLinkResult = await linkCaretakerToOrgIfFreelance(caretaker, org);

    if (caretakerLinkResult?.movedFromOtherOrg) {
      return res.status(400).json({
        message: 'Caretaker belongs to another organization'
      });
    }

    const refreshedCaretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
    if (!refreshedCaretaker || String(refreshedCaretaker.organization) !== String(org._id)) {
      return res.status(400).json({
        message: 'Caretaker must belong to this organization'
      });
    }

    let nurse = null;
    if (nurseId) {
      const nd = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nd) {
        return res.status(400).json({ message: 'nurseId must be a nurse' });
      }

      const ensured = await ensureStaffBoundToOrg(nd, org);
      if (!ensured.ok) {
        return res.status(400).json({
          message: 'nurseId must be a nurse in this organization'
        });
      }

      nurse = await ensureUserWithRole(toId(nurseId), 'nurse');
    }

    let doctor = null;
    if (doctorId) {
      const dd = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!dd) {
        return res.status(400).json({ message: 'doctorId must be a doctor' });
      }

      const ensured = await ensureStaffBoundToOrg(dd, org);
      if (!ensured.ok) {
        return res.status(400).json({
          message: 'doctorId must be a doctor in this organization'
        });
      }

      doctor = await ensureUserWithRole(toId(doctorId), 'doctor');
    }

    const patient = await Patient.create({
      fullname,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      organization: org._id,
      caretaker: refreshedCaretaker._id,
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

    await addAssignedPatient(refreshedCaretaker._id, patient._id);
    if (nurse) await addAssignedPatient(nurse._id, patient._id);
    if (doctor) await addAssignedPatient(doctor._id, patient._id);

    return res.status(201).json({
      message: 'Patient created',
      patient: { ...patient.toObject(), age: calculateAge(patient.dateOfBirth) }
    });
  } catch (err) {
    return res.status(500).json({
      message: 'Error creating patient',
      details: err.message
    });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/patients/{id}/assign:
 *   put:
 *     summary: Update patient staff assignments
 *     description: Assigns or reassigns a caretaker, nurse, or doctor to an existing patient. At least one of `nurseId`, `doctorId`, or `caretakerId` should be provided.
 *     tags: [AdminPatients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context for admins managing multiple organizations
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient ID
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
 *                 description: ID of the nurse to assign
 *               caretakerId:
 *                 type: string
 *                 nullable: true
 *                 description: ID of the caretaker to assign or replace
 *               doctorId:
 *                 type: string
 *                 nullable: true
 *                 description: ID of the doctor to assign or replace
 *     responses:
 *       200:
 *         description: Patient assignments updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - message
 *                 - patient
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Assignments updated
 *                 patient:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     fullname:
 *                       type: string
 *                     age:
 *                       type: integer
 *                     caretaker:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id:
 *                           type: string
 *                         fullname:
 *                           type: string
 *                         email:
 *                           type: string
 *                     assignedNurses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           fullname:
 *                             type: string
 *                           email:
 *                             type: string
 *                     assignedDoctor:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id:
 *                           type: string
 *                         fullname:
 *                           type: string
 *                         email:
 *                           type: string
 *       400:
 *         description: Invalid staff ID or role mismatch
 *       403:
 *         description: Patient does not belong to the selected organization
 *       404:
 *         description: Organization or patient not found
 *       500:
 *         description: Internal server error while updating assignments
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

    // Assign nurse
    if (nurseId) {
      const nurse = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nurse) return res.status(400).json({ message: 'nurseId must be a nurse' });

      const ensured = await ensureStaffBoundToOrg(nurse, org);
      if (!ensured.ok) {
        return res.status(400).json({ message: 'nurseId must be a nurse in this org' });
      }

      await Patient.updateOne(
        { _id: id },
        { $addToSet: { assignedNurses: toObjectId(nurse._id) } }
      );
      await addAssignedPatient(nurse._id, patient._id);
    }

    // Assign doctor
    if (doctorId) {
      const doctor = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!doctor) return res.status(400).json({ message: 'doctorId must be a doctor' });

      const ensured = await ensureStaffBoundToOrg(doctor, org);
      if (!ensured.ok) {
        return res.status(400).json({ message: 'doctorId must be a doctor in this org' });
      }

      if (patient.assignedDoctor && String(patient.assignedDoctor) !== String(doctor._id)) {
        await removeAssignedPatient(patient.assignedDoctor, patient._id);
      }

      updates.assignedDoctor = toObjectId(doctor._id);
      await addAssignedPatient(doctor._id, patient._id);
    }

    // Assign caretaker
    if (caretakerId) {
      const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
      if (!caretaker) return res.status(400).json({ message: 'caretakerId must be a caretaker' });

      const linkResult = await linkCaretakerToOrgIfFreelance(caretaker, org);
      if (linkResult.movedFromOtherOrg) {
        return res.status(400).json({ message: 'Caretaker belongs to another organization' });
      }

      if (patient.caretaker && String(patient.caretaker) !== String(caretaker._id)) {
        await removeAssignedPatient(patient.caretaker, patient._id);
      }

      updates.caretaker = toObjectId(caretaker._id);
      await addAssignedPatient(caretaker._id, patient._id);
    }

    const updated = await Patient.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email');

    const age = calculateAge(updated?.dateOfBirth);

    return res.status(200).json({
      message: 'Assignments updated',
      patient: { ...updated.toObject(), age }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error reassigning', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/patients:
 *   get:
 *     summary: List patients for the admin's organization
 *     description: Returns a paginated list of patients within the selected organization. Use `active=false` to view soft-deleted patients.
 *     tags: [AdminPatients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context for admins managing multiple organizations
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         required: false
 *         description: Search keyword matched against patient full name
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - in: query
 *         name: active
 *         required: false
 *         description: Set to false to retrieve soft-deleted patients
 *         schema:
 *           type: string
 *           enum: [true, false]
 *           default: "true"
 *     responses:
 *       200:
 *         description: Patient list returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - patients
 *                 - pagination
 *               properties:
 *                 patients:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required:
 *                       - _id
 *                       - fullname
 *                       - gender
 *                       - dateOfBirth
 *                     properties:
<<<<<<< HEAD
 *                       _id:
 *                         type: string
 *                       fullname:
 *                         type: string
 *                       gender:
 *                         type: string
 *                       dateOfBirth:
 *                         type: string
 *                         format: date
 *                       age:
 *                         type: integer
=======
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
>>>>>>> origin/main
 *                       caretaker:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           _id:
 *                             type: string
 *                           fullname:
 *                             type: string
 *                           email:
 *                             type: string
 *                       assignedNurses:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             fullname:
 *                               type: string
 *                             email:
 *                               type: string
 *                       assignedDoctor:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           _id:
 *                             type: string
 *                           fullname:
 *                             type: string
 *                           email:
 *                             type: string
 *                 pagination:
 *                   type: object
 *                   required:
 *                     - total
 *                     - page
 *                     - pages
 *                     - limit
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 42
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     pages:
 *                       type: integer
 *                       example: 5
 *                     limit:
 *                       type: integer
 *                       example: 10
 *       404:
 *         description: Organization not found for the authenticated admin
 *       500:
 *         description: Internal server error while listing patients
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
    return res.status(500).json({ message: 'Error listing patients', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/patients/{id}/overview:
 *   get:
 *     summary: Get a complete overview of a patient
 *     description: Returns a detailed patient overview including profile data, health records, care plan, tasks, logs, and task completion rate.
 *     tags: [AdminPatients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context for admins managing multiple organizations
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Patient overview returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - patient
 *                 - healthRecords
 *                 - carePlan
 *                 - tasks
 *                 - logs
 *                 - taskCompletionRate
 *               properties:
 *                 patient:
 *                   type: object
 *                   required:
 *                     - _id
 *                     - fullname
 *                     - gender
 *                     - dateOfBirth
 *                   properties:
<<<<<<< HEAD
 *                     _id:
 *                       type: string
 *                     fullname:
 *                       type: string
 *                     gender:
 *                       type: string
 *                     dateOfBirth:
 *                       type: string
 *                       format: date
 *                     age:
 *                       type: integer
=======
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
>>>>>>> origin/main
 *                     caretaker:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id:
 *                           type: string
 *                         fullname:
 *                           type: string
 *                         email:
 *                           type: string
 *                     assignedNurses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           fullname:
 *                             type: string
 *                           email:
 *                             type: string
 *                     assignedDoctor:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id:
 *                           type: string
 *                         fullname:
 *                           type: string
 *                         email:
 *                           type: string
 *                 healthRecords:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       patient:
 *                         type: string
 *                       title:
 *                         type: string
 *                       details:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 carePlan:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     _id:
 *                       type: string
 *                     patient:
 *                       type: string
 *                     title:
 *                       type: string
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       status:
 *                         type: string
 *                         example: completed
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       patient:
 *                         type: string
 *                       activityTimestamp:
 *                         type: string
 *                         format: date-time
 *                       note:
 *                         type: string
 *                 taskCompletionRate:
 *                   type: number
 *                   format: float
 *                   example: 66.7
 *       403:
 *         description: Patient does not belong to the selected organization
 *       404:
 *         description: Organization or patient not found
 *       500:
 *         description: Internal server error while fetching patient overview
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
    return res.status(500).json({ message: 'Error fetching patient overview', details: err.message });
  }
};

/* ---------------------------------------------------------------------- */
/**
 * @swagger
 * /api/v1/admin/patients/{id}:
 *   delete:
 *     summary: Deactivate a patient
 *     description: Soft-deletes a patient by marking the patient record as inactive while preserving database history.
 *     tags: [AdminPatients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         description: Organization context for admins managing multiple organizations
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Patient deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - message
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Patient deactivated
 *       403:
 *         description: Patient does not belong to the selected organization
 *       404:
 *         description: Organization or patient not found
 *       500:
 *         description: Internal server error while deactivating the patient
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
    return res.status(500).json({ message: 'Error deactivating patient', details: err.message });
  }
};