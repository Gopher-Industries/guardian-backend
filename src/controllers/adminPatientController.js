'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
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
  toId,
} = require('../services/orgService');

const toObjectId = (val) => {
  const id = toId(val);
  if (!id) return undefined;
  return new mongoose.Types.ObjectId(String(id));
};

async function ensureStaffBoundToOrg(userDoc, orgDoc) {
  if (!userDoc || !orgDoc) return { ok: false, reason: 'missing' };
  if (assertSameOrg(orgDoc, userDoc)) return { ok: true };
  if (isUserInOrg(userDoc, orgDoc) || isUserInOrg({ _id: userDoc._id }, orgDoc)) {
    const User = require('../models/User');
    await User.updateOne({ _id: userDoc._id }, { $set: { organization: toObjectId(orgDoc._id) } });
    return { ok: true, linked: true };
  }
  return { ok: false, reason: 'not_in_staff' };
}

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * @swagger
 * tags:
 *   - name: AdminPatients
 *     description: Admin — manage patients scoped to an organization
 */

/**
 * @swagger
 * /api/v1/admin/patients:
 *   post:
 *     tags: [AdminPatients]
 *     summary: Create a new patient under caretaker’s org
 *     description: Organization is inferred from the caretaker (or from the admin's org if the caretaker is freelance).
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
 *               - caretakerEmail
 *               - caretakerFullname
 *             properties:
 *               fullname: { type: string, example: "John Doe" }
 *               gender: { type: string, enum: [male, female, other], example: male }
 *               dateOfBirth: { type: string, format: date, example: "1980-05-17" }
 *               caretakerEmail: { type: string, example: "caretaker@example.com" }
 *               caretakerFullname: { type: string, example: "Jane Smith" }
 *               nurseEmail: { type: string, nullable: true, example: "nurse+190355@example.com" }
 *               nurseFullname: { type: string, nullable: true, example: "Nurse 190355" }
 *               doctorEmail: { type: string, nullable: true, example: "doctor@example.com" }
 *               doctorFullname: { type: string, nullable: true, example: "Dr Alex Kim" }
 *               image: { type: string, nullable: true }
 *               dateOfAdmitting: { type: string, format: date, nullable: true }
 *               description: { type: string, nullable: true, default: "" }
 *     responses:
 *       201:
 *         description: Patient created successfully
 *       400:
 *         description: Validation error or bad request
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Error creating patient
 */
exports.createPatient = async (req, res) => {
  try {
    if (req.body && typeof req.body === 'object' && 'organization' in req.body) {
      delete req.body.organization;
    }

    const {
      fullname, gender, dateOfBirth,
      caretakerEmail, caretakerFullname,
      nurseEmail, nurseFullname,
      doctorEmail, doctorFullname,
      image, dateOfAdmitting, description
    } = req.body || {};

    if (!fullname || !gender || !dateOfBirth || !caretakerEmail || !caretakerFullname) {
      return res.status(400).json({ message: 'fullname, gender, dateOfBirth, caretakerEmail and caretakerFullname are required' });
    }

    const caretakerFound = await User.findOne({ email: String(caretakerEmail).trim() })
      .collation({ locale: 'en', strength: 2 });
    if (!caretakerFound) return res.status(400).json({ message: 'Caretaker not found by email' });
    if (norm(caretakerFound.fullname) !== norm(caretakerFullname)) {
      return res.status(400).json({ message: 'Caretaker fullname does not match' });
    }
    const caretaker = await ensureUserWithRole(caretakerFound._id, 'caretaker');
    if (!caretaker) return res.status(400).json({ message: 'caretaker must have role caretaker' });

    let orgId = caretaker.organization;
    if (!orgId) {
      const adminOrg = await findAdminOrg(req.user._id, req.query.orgId);
      if (!adminOrg) return res.status(404).json({ message: 'Organization not found for admin' });
      await User.updateOne({ _id: caretaker._id }, { $set: { organization: adminOrg._id } });
      orgId = adminOrg._id;
    }
    const orgFull = await findAdminOrg(req.user._id, orgId);

    let nurse = null;
    if (nurseEmail || nurseFullname) {
      if (!nurseEmail || !nurseFullname) {
        return res.status(400).json({ message: 'nurseEmail and nurseFullname are both required when assigning a nurse' });
      }
      const nurseFound = await User.findOne({ email: String(nurseEmail).trim() })
        .collation({ locale: 'en', strength: 2 });
      if (!nurseFound) return res.status(400).json({ message: 'Nurse not found by email' });
      if (norm(nurseFound.fullname) !== norm(nurseFullname)) {
        return res.status(400).json({ message: 'Nurse fullname does not match' });
      }
      const nd = await ensureUserWithRole(nurseFound._id, 'nurse');
      if (!nd) return res.status(400).json({ message: 'nurseEmail must belong to a nurse' });
      const ensured = await ensureStaffBoundToOrg(nd, orgFull);
      if (!ensured.ok) return res.status(400).json({ message: 'nurse must be part of this organization staff' });
      nurse = nd;
    }

    let doctor = null;
    if (doctorEmail || doctorFullname) {
      if (!doctorEmail || !doctorFullname) {
        return res.status(400).json({ message: 'doctorEmail and doctorFullname are both required when assigning a doctor' });
      }
      const doctorFound = await User.findOne({ email: String(doctorEmail).trim() })
        .collation({ locale: 'en', strength: 2 });
      if (!doctorFound) return res.status(400).json({ message: 'Doctor not found by email' });
      if (norm(doctorFound.fullname) !== norm(doctorFullname)) {
        return res.status(400).json({ message: 'Doctor fullname does not match' });
      }
      const dd = await ensureUserWithRole(doctorFound._id, 'doctor');
      if (!dd) return res.status(400).json({ message: 'doctorEmail must belong to a doctor' });
      const ensured = await ensureStaffBoundToOrg(dd, orgFull);
      if (!ensured.ok) return res.status(400).json({ message: 'doctor must be part of this organization staff' });
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
      profilePhoto: image || null,
      dateOfAdmitting: dateOfAdmitting ? new Date(dateOfAdmitting) : null,
      description: description || '',
      isDeleted: false
    });

    await addAssignedPatient(caretaker._id, patient._id);
    if (nurse) await addAssignedPatient(nurse._id, patient._id);
    if (doctor) await addAssignedPatient(doctor._id, patient._id);

    return res.status(201).json({
      message: 'Patient created',
      patient: { ...patient.toObject(), age: calculateAge(patient.dateOfBirth) }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error creating patient', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/admin/patients/{id}/reassign:
 *   put:
 *     tags: [AdminPatients]
 *     summary: Reassign caretaker, nurse, or doctor for a patient
 *     description: Add/replace patient assignments. At least one of `nurseId`, `doctorId`, or `caretakerId` must be provided.
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
 *               nurseId: { type: string, nullable: true }
 *               caretakerId: { type: string, nullable: true }
 *               doctorId: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Assignment updated successfully
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

    const pidRaw = toId(id);
    if (!pidRaw || !mongoose.isValidObjectId(pidRaw)) {
      return res.status(400).json({ message: 'Invalid patient id' });
    }
    const pid = new mongoose.Types.ObjectId(String(pidRaw));

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(pid);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    const { nurseId, caretakerId, doctorId } = req.body || {};
    const updates = {};

    if (nurseId) {
      const nurse = await ensureUserWithRole(toId(nurseId), 'nurse');
      if (!nurse) return res.status(400).json({ message: 'nurseId must be a nurse' });
      const ensured = await ensureStaffBoundToOrg(nurse, org);
      if (!ensured.ok) return res.status(400).json({ message: 'nurseId must be a nurse in this org' });

      await Patient.updateOne({ _id: pid }, { $addToSet: { assignedNurses: new mongoose.Types.ObjectId(String(nurse._id)) } });
      await addAssignedPatient(nurse._id, pid);
    }

    if (doctorId) {
      const doctor = await ensureUserWithRole(toId(doctorId), 'doctor');
      if (!doctor) return res.status(400).json({ message: 'doctorId must be a doctor' });
      const ensured = await ensureStaffBoundToOrg(doctor, org);
      if (!ensured.ok) return res.status(400).json({ message: 'doctorId must be a doctor in this org' });

      if (patient.assignedDoctor && String(patient.assignedDoctor) !== String(doctor._id)) {
        await removeAssignedPatient(patient.assignedDoctor, pid);
      }
      updates.assignedDoctor = new mongoose.Types.ObjectId(String(doctor._id));
      await addAssignedPatient(doctor._id, pid);
    }

    if (caretakerId) {
      const caretaker = await ensureUserWithRole(toId(caretakerId), 'caretaker');
      if (!caretaker) return res.status(400).json({ message: 'caretakerId must be a caretaker' });

      const linkResult = await linkCaretakerToOrgIfFreelance(caretaker, org);
      if (linkResult.movedFromOtherOrg) {
        return res.status(400).json({ message: 'Caretaker belongs to another organization' });
      }
      if (patient.caretaker && String(patient.caretaker) !== String(caretaker._id)) {
        await removeAssignedPatient(patient.caretaker, pid);
      }
      updates.caretaker = new mongoose.Types.ObjectId(String(caretaker._id));
      await addAssignedPatient(caretaker._id, pid);
    }

    const updated = await Patient.findByIdAndUpdate(pid, { $set: updates }, { new: true })
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email');

    const age = calculateAge(updated?.dateOfBirth);
    return res.status(200).json({ message: 'Assignments updated', patient: { ...updated.toObject(), age } });
  } catch (err) {
    return res.status(500).json({ message: 'Error reassigning', details: err.message });
  }
};


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
    return res.status(500).json({ message: 'Error listing patients', details: err.message });
  }
};

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
 *       403:
 *         description: Patient not under org
 *       404:
 *         description: Org or patient not found
 */
exports.patientOverview = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;

    const pidRaw = toId(id);
    if (!pidRaw || !mongoose.isValidObjectId(pidRaw)) {
      return res.status(400).json({ message: 'Invalid patient id' });
    }
    const pid = new mongoose.Types.ObjectId(String(pidRaw));

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(pid)
      .populate('caretaker', 'fullname email')
      .populate('assignedNurses', 'fullname email')
      .populate('assignedDoctor', 'fullname email');

    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    const [healthRecords, carePlan, tasks, logs] = await Promise.all([
      HealthRecord.find({ patient: pid }).sort({ created_at: -1 }).lean(),
      CarePlan.findOne({ patient: pid }).populate('tasks').lean(),
      Task.find({ patient: pid }).lean(),
      EntryReport.find({ patient: pid }).sort({ activityTimestamp: -1 }).lean(),
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
 *       403:
 *         description: Patient not under org
 *       404:
 *         description: Org or patient not found
 */
exports.deactivatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId } = req.query;

    const pidRaw = toId(id);
    if (!pidRaw || !mongoose.isValidObjectId(pidRaw)) {
      return res.status(400).json({ message: 'Invalid patient id' });
    }
    const pid = new mongoose.Types.ObjectId(String(pidRaw));

    const org = await findAdminOrg(req.user._id, orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found for admin' });

    const patient = await Patient.findById(pid);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (String(patient.organization) !== String(org._id)) {
      return res.status(403).json({ message: 'Patient not under this organization' });
    }

    await Patient.findByIdAndUpdate(pid, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    });

    await Promise.all([
      patient.caretaker ? removeAssignedPatient(patient.caretaker, pid) : Promise.resolve(),
      ...(patient.assignedNurses || []).map(nId => removeAssignedPatient(nId, pid)),
      patient.assignedDoctor ? removeAssignedPatient(patient.assignedDoctor, pid) : Promise.resolve(),
    ]);

    return res.status(200).json({ message: 'Patient deactivated' });
  } catch (err) {
    return res.status(500).json({ message: 'Error deactivating patient', details: err.message });
  }
};

