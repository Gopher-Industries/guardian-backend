const mongoose = require('mongoose');
const {
  Types: { ObjectId },
} = mongoose;

const Patient = require('../models/Patient');
const Organization = require('../models/Organization');
const User = require('../models/User');
const EntryReport = require('../models/EntryReport');
const { log: audit } = require('../utils/audit');

/* ──────────────────────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────────────────────────── */
const normalizeGender = (v) => {
  const g = String(v || '').trim().toLowerCase();
  if (g === 'm' || g === 'male') return 'M';
  if (g === 'f' || g === 'female') return 'F';
  return 'other';
};

const calcAge = (dob) => {
  const t = new Date();
  const b = new Date(dob);
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
};

// ID-safe helpers (handle ObjectId, string, or populated docs)
const toId = (v) => (v && typeof v === 'object' && v._id ? v._id : v);
const idEq = (a, b) => String(toId(a)) === String(toId(b));

const isSameOrg = (user, orgId) =>
  !!user.organization && idEq(user.organization, orgId);

const isAssignedOrCreator = (patient, userId) => {
  const uid = toId(userId);
  return (
    (patient.assignedNurse && idEq(patient.assignedNurse, uid)) ||
    (patient.assignedCaretaker && idEq(patient.assignedCaretaker, uid)) ||
    (patient.createdBy && idEq(patient.createdBy, uid))
  );
};

const mustBeObjectId = (id, label) => {
  if (!ObjectId.isValid(id)) {
    const e = new Error(`${label} must be a valid ObjectId`);
    e.status = 400;
    throw e;
  }
};

const parseDate = (value, label, { allowFuture = false } = {}) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const e = new Error(`${label} must be a valid date`);
    e.status = 400;
    throw e;
  }
  if (!allowFuture && d > new Date()) {
    const e = new Error(`${label} cannot be in the future`);
    e.status = 400;
    throw e;
  }
  return d;
};

/* ──────────────────────────────────────────────────────────────────────────────
   Registration
──────────────────────────────────────────────────────────────────────────────── */

/**
 * @swagger
 * /api/v1/patients/register:
 *   post:
 *     summary: Register a new FREELANCE patient (explicit)
 *     description: |
 *       - Caller must be **nurse** or **caretaker**.
 *       - Patient is always created as **freelance** (`organization: null`), EVEN IF the caller belongs to an org.
 *       - If **nurse** calls: `caretakerId` is **optional** (must be a freelance caretaker if provided).
 *       - If **caretaker** calls: `nurseId` is **optional** (must be a freelance nurse if provided).
 *     tags: [Patient]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullname, dateOfBirth, gender]
 *             properties:
 *               fullname: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               gender: { type: string, enum: [M, F, other, male, female] }
 *               dateOfAdmitting: { type: string, format: date }
 *               description: { type: string }
 *               nurseId: { type: string, description: "Optional freelance nurse (if caller is caretaker)" }
 *               caretakerId: { type: string, description: "Optional freelance caretaker (if caller is nurse)" }
 *     responses:
 *       201: { description: Patient registered (freelance) }
 *       400: { description: Bad request }
 *       403: { description: Forbidden }
 */
const registerPatientFreelance = async (req, res) => {
  try {
    const { me, roleName } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });

    const {
      fullname,
      dateOfBirth,
      gender,
      dateOfAdmitting,
      description,
      nurseId,
      caretakerId,
    } = req.body;

    if (!fullname || !dateOfBirth || !gender) {
      return res
        .status(400)
        .json({ message: 'fullname, dateOfBirth, gender are required' });
    }

    parseDate(dateOfBirth, 'dateOfBirth');
    if (dateOfAdmitting) parseDate(dateOfAdmitting, 'dateOfAdmitting');

    if (!['nurse', 'caretaker'].includes(roleName)) {
      return res.status(403).json({
        message: 'Only nurse or caretaker can create freelance patients',
      });
    }

    let assignedNurse = null;
    let assignedCaretaker = null;

    if (roleName === 'nurse') {
      assignedNurse = me._id;

      if (caretakerId) {
        mustBeObjectId(caretakerId, 'caretakerId');
        const ct = await User.findById(caretakerId).populate('role');
        if (!ct || ct.role?.name?.toLowerCase() !== 'caretaker') {
          return res.status(400).json({ message: 'caretakerId must be a caretaker' });
        }
        if (ct.organization) {
          return res.status(400).json({ message: 'caretakerId must be a freelance caretaker' });
        }
        assignedCaretaker = ct._id;
      }
    } else {
      // caretaker creator
      assignedCaretaker = me._id;
      if (nurseId) {
        mustBeObjectId(nurseId, 'nurseId');
        const n = await User.findById(nurseId).populate('role');
        if (!n || n.role?.name?.toLowerCase() !== 'nurse') {
          return res.status(400).json({ message: 'nurseId must be a nurse' });
        }
        if (n.organization) {
          return res.status(400).json({ message: 'nurseId must be a freelance nurse' });
        }
        assignedNurse = n._id;
      }
    }

    const patient = await Patient.create({
      fullname,
      dateOfBirth,
      gender: normalizeGender(gender),
      organization: null, // explicit freelance
      assignedNurse,
      assignedCaretaker,
      dateOfAdmitting: dateOfAdmitting || null,
      description: description || null,
      profilePhoto: req.file?.filename || null,
      createdBy: me._id,
    });

    audit(req, {
      category: 'patient',
      action: 'patient_created',
      actor: me._id,
      severity: 'info',
      targetModel: 'Patient',
      targetId: String(patient._id),
      meta: { mode: 'freelance' },
    });

    const obj = (
      await patient.populate(['assignedNurse', 'assignedCaretaker'])
    ).toObject();
    obj.age = calcAge(obj.dateOfBirth);

    return res
      .status(201)
      .json({ message: 'Patient registered', patient: obj });
  } catch (err) {
    const status = err.status || 400;
    return res
      .status(status)
      .json({ message: 'Error registering patient', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/orgs/patients/register:
 *   post:
 *     summary: Register a new ORGANIZATION patient (admin-only)
 *     description: |
 *       - Caller must be **org admin**; patient is tied to caller's organization.
 *       - **Both** `nurseId` and `caretakerId` are required, must belong to the same org, be approved & active, and be different users.
 *     tags: [Patient]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullname, dateOfBirth, gender, nurseId, caretakerId]
 *             properties:
 *               fullname: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               gender: { type: string, enum: [M, F, other, male, female] }
 *               dateOfAdmitting: { type: string, format: date }
 *               description: { type: string }
 *               nurseId: { type: string }
 *               caretakerId: { type: string }
 *     responses:
 *       201: { description: Patient registered (org) }
 *       400: { description: Bad request }
 *       403: { description: Forbidden }
 */
const registerPatientOrgAdmin = async (req, res) => {
  try {
    const { me, roleName, isOrgMember, orgId } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });

    const {
      fullname,
      dateOfBirth,
      gender,
      dateOfAdmitting,
      description,
      nurseId,
      caretakerId,
    } = req.body;

    if (!fullname || !dateOfBirth || !gender) {
      return res
        .status(400)
        .json({ message: 'fullname, dateOfBirth, gender are required' });
    }

    if (!isOrgMember || roleName !== 'admin') {
      return res
        .status(403)
        .json({ message: 'Only org admin can create org patients' });
    }

    if (!nurseId || !caretakerId) {
      return res
        .status(400)
        .json({ message: 'nurseId and caretakerId are required' });
    }

    parseDate(dateOfBirth, 'dateOfBirth');
    if (dateOfAdmitting) parseDate(dateOfAdmitting, 'dateOfAdmitting');

    mustBeObjectId(nurseId, 'nurseId');
    mustBeObjectId(caretakerId, 'caretakerId');

    const [nurse, caretaker] = await Promise.all([
      User.findById(nurseId).populate('role'),
      User.findById(caretakerId).populate('role'),
    ]);

    if (!nurse || nurse.role?.name?.toLowerCase() !== 'nurse') {
      return res.status(400).json({ message: 'nurseId must be a nurse' });
    }
    if (!caretaker || caretaker.role?.name?.toLowerCase() !== 'caretaker') {
      return res.status(400).json({ message: 'caretakerId must be a caretaker' });
    }

    if (!isSameOrg(nurse, orgId)) {
      return res.status(400).json({ message: 'nurse must belong to your organization' });
    }
    if (!isSameOrg(caretaker, orgId)) {
      return res.status(400).json({ message: 'caretaker must belong to your organization' });
    }

    if (nurse.isApproved === false || nurse.isActive === false) {
      return res.status(400).json({ message: 'nurse must be approved and active' });
    }
    if (caretaker.isApproved === false || caretaker.isActive === false) {
      return res.status(400).json({ message: 'caretaker must be approved and active' });
    }

    if (idEq(nurse._id, caretaker._id)) {
      return res.status(400).json({ message: 'nurseId and caretakerId must be different users' });
    }

    const patient = await Patient.create({
      fullname,
      dateOfBirth,
      gender: normalizeGender(gender),
      organization: orgId,
      assignedNurse: nurse._id,
      assignedCaretaker: caretaker._id,
      dateOfAdmitting: dateOfAdmitting || null,
      description: description || null,
      profilePhoto: req.file?.filename || null,
      createdBy: me._id,
    });

    await Organization.updateOne(
      { _id: orgId },
      { $addToSet: { patients: patient._id } }
    );

    audit(req, {
      category: 'patient',
      action: 'patient_created',
      actor: me._id,
      severity: 'info',
      targetModel: 'Patient',
      targetId: String(patient._id),
      meta: { mode: 'organization', orgId },
    });

    const obj = (
      await patient.populate(['organization', 'assignedNurse', 'assignedCaretaker'])
    ).toObject();
    obj.age = calcAge(obj.dateOfBirth);

    return res
      .status(201)
      .json({ message: 'Patient registered', patient: obj });
  } catch (err) {
    const status = err.status || 400;
    return res
      .status(status)
      .json({ message: 'Error registering patient', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/{patientId}:
 *   get:
 *     summary: Fetch patient details (enforces org/freelance access)
 *     description: |
 *       **Access rules**
 *       - **Organization patient:** Caller must belong to the same organization. **Admins** can view any org patient; **nurse/caretaker** must be assigned (or creator).
 *       - **Freelance patient:** Only the creator, assigned nurse, or assigned caretaker can view.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the patient
 *     responses:
 *       200: { description: Patient details }
 *       403: { description: Forbidden }
 *       404: { description: Patient not found }
 */
const getPatientDetails = async (req, res) => {
  try {
    const { me, roleName, isOrgMember, orgId } = req.ctx || {};
    if (!me) return res.status(401).json({ message: 'Unauthorized' });

    const { patientId } = req.params;
    mustBeObjectId(patientId, 'patientId');

    const p = await Patient.findById(patientId).populate([
      'organization',
      'assignedNurse',
      'assignedCaretaker',
      'createdBy',
    ]);
    if (!p) return res.status(404).json({ message: 'Patient not found' });

    if (p.organization) {
      if (!isOrgMember || !idEq(p.organization, orgId)) {
        return res
          .status(403)
          .json({ message: 'Forbidden: different organization' });
      }
      if (roleName !== 'admin' && !isAssignedOrCreator(p, me._id)) {
        return res
          .status(403)
          .json({ message: 'Forbidden: not assigned to this org patient' });
      }
    } else {
      if (!isAssignedOrCreator(p, me._id)) {
        return res.status(403).json({
          message: 'Forbidden: not assigned to this freelance patient',
        });
      }
    }

    const obj = p.toObject();
    obj.age = calcAge(obj.dateOfBirth);
    return res.json(obj);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({
      message: 'Error fetching patient details',
      details: err.message,
    });
  }
};

/* ──────────────────────────────────────────────────────────────────────────────
   Assignment
──────────────────────────────────────────────────────────────────────────────── */
/**
 * @swagger
 * /api/v1/patients/assign-nurse:
 *   post:
 *     summary: Assign a nurse to a patient
 *     description: "Org patients → admin only; Freelance → creator/assignees."
 *     tags: [Patient]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nurseId, patientId]
 *             properties:
 *               nurseId: { type: string }
 *               patientId: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Bad request }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
const assignNurseToPatient = async (req, res) => {
  const { me, roleName, isOrgMember, orgId } = req.ctx || {};
  if (!me) return res.status(401).json({ message: 'Unauthorized' });

  const { nurseId, patientId } = req.body;
  mustBeObjectId(nurseId, 'nurseId');
  mustBeObjectId(patientId, 'patientId');

  const [patient, nurse] = await Promise.all([
    Patient.findById(patientId),
    User.findById(nurseId).populate('role'),
  ]);
  if (!patient) return res.status(404).json({ message: 'Invalid patient ID' });
  if (!nurse || nurse.role?.name?.toLowerCase() !== 'nurse') {
    return res.status(400).json({ message: 'nurseId must be a nurse' });
  }

  if (patient.organization) {
    if (!isOrgMember || !idEq(patient.organization, orgId)) {
      return res
        .status(403)
        .json({ message: 'Forbidden: different organization' });
    }
    if (roleName !== 'admin') {
      return res
        .status(403)
        .json({ message: 'Only admins can assign org patients' });
    }
    if (!isSameOrg(nurse, orgId)) {
      return res
        .status(400)
        .json({ message: 'nurse must belong to your organization' });
    }
    if (nurse.isApproved === false || nurse.isActive === false) {
      return res
        .status(400)
        .json({ message: 'nurse must be approved and active in your organization' });
    }
  } else {
    if (!isAssignedOrCreator(patient, me._id)) {
      return res.status(403).json({
        message: 'Forbidden: not owner/assignee of this freelance patient',
      });
    }
    if (nurse.organization) {
      return res.status(400).json({
        message: 'nurseId must be a freelance nurse for freelance patient',
      });
    }
  }

  if (patient.assignedNurse && idEq(patient.assignedNurse, nurse._id)) {
    return res.status(409).json({ message: 'Nurse already assigned' });
  }

  patient.assignedNurse = nurse._id;
  await patient.save();

  audit(req, {
    category: 'patient',
    action: 'assign_nurse',
    actor: me._id,
    severity: 'info',
    targetModel: 'Patient',
    targetId: String(patient._id),
    meta: { nurseId: String(nurse._id) },
  });

  res.status(200).json({ message: 'Nurse assigned to patient successfully' });
};

/**
 * @swagger
 * /api/v1/patients/assign-caretaker:
 *   post:
 *     summary: Assign a caretaker to a patient
 *     description: "Org patients → admin only; Freelance → creator/assignees."
 *     tags: [Patient]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caretakerId, patientId]
 *             properties:
 *               caretakerId: { type: string }
 *               patientId: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Bad request }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
const assignCaretakerToPatient = async (req, res) => {
  const { me, roleName, isOrgMember, orgId } = req.ctx || {};
  if (!me) return res.status(401).json({ message: 'Unauthorized' });

  const { caretakerId, patientId } = req.body;
  mustBeObjectId(caretakerId, 'caretakerId');
  mustBeObjectId(patientId, 'patientId');

  const [patient, caretaker] = await Promise.all([
    Patient.findById(patientId),
    User.findById(caretakerId).populate('role'),
  ]);
  if (!patient) return res.status(404).json({ message: 'Invalid patient ID' });
  if (!caretaker || caretaker.role?.name?.toLowerCase() !== 'caretaker') {
    return res.status(400).json({ message: 'caretakerId must be a caretaker' });
  }

  if (patient.organization) {
    if (!isOrgMember || !idEq(patient.organization, orgId)) {
      return res
        .status(403)
        .json({ message: 'Forbidden: different organization' });
    }
    if (roleName !== 'admin') {
      return res
        .status(403)
        .json({ message: 'Only admins can assign org patients' });
    }
    if (!isSameOrg(caretaker, orgId)) {
      return res.status(400).json({
        message: 'caretaker must belong to your organization',
      });
    }
    if (caretaker.isApproved === false || caretaker.isActive === false) {
      return res.status(400).json({
        message: 'caretaker must be approved and active in your organization',
      });
    }
  } else {
    if (!isAssignedOrCreator(patient, me._id)) {
      return res.status(403).json({
        message: 'Forbidden: not owner/assignee of this freelance patient',
      });
    }
    if (caretaker.organization) {
      return res.status(400).json({
        message:
          'caretakerId must be a freelance caretaker for freelance patient',
      });
    }
  }

  if (patient.assignedCaretaker && idEq(patient.assignedCaretaker, caretaker._id)) {
    return res.status(409).json({ message: 'Caretaker already assigned' });
  }

  patient.assignedCaretaker = caretaker._id;
  await patient.save();

  audit(req, {
    category: 'patient',
    action: 'assign_caretaker',
    actor: me._id,
    severity: 'info',
    targetModel: 'Patient',
    targetId: String(patient._id),
    meta: { caretakerId: String(caretaker._id) },
  });

  res
    .status(200)
    .json({ message: 'Caretaker assigned to patient successfully' });
};

/* ──────────────────────────────────────────────────────────────────────────────
   My assigned patients (both org & freelance)
──────────────────────────────────────────────────────────────────────────────── */
/**
 * @swagger
 * /api/v1/patients/assigned-patients:
 *   get:
 *     summary: Fetch patients assigned to me
 *     tags: [Patient]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200: { description: OK }
 */
const getAssignedPatients = async (req, res) => {
  const { me, roleName } = req.ctx || {};
  if (!me) return res.status(401).json({ message: 'Unauthorized' });

  let query;
  if (roleName === 'nurse') {
    query = { assignedNurse: me._id };
  } else if (roleName === 'caretaker') {
    query = { assignedCaretaker: me._id };
  } else if (roleName === 'admin' && me.organization) {
    query = { organization: me.organization };
  } else {
    return res.status(403).json({ message: 'Unauthorized role' });
  }

  const patients = await Patient.find(query)
    .populate(['assignedNurse', 'assignedCaretaker', 'organization'])
    .sort({ created_at: -1 });

  const rows = patients.map((p) => {
    const obj = p.toObject();
    obj.age = calcAge(obj.dateOfBirth);
    return obj;
  });

  res.json(rows);
};

/**
 * @swagger
 * /api/v1/patients/org:
 *   get:
 *     summary: List patients in my organization
 *     description: |
 *       - Returns all patients that belong to **your organization**.
 *       - **Admin** sees full records (includes description, dateOfAdmitting, profilePhoto).
 *       - **Nurse/Caretaker** see a roster view (name, age, gender, current assignees).
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Patients list }
 *       401: { description: Unauthorized }
 *       403: { description: Not in an organization }
 */
const listOrgPatients = async (req, res) => {
  const { me, roleName, isOrgMember, orgId } = req.ctx || {};
  if (!me) return res.status(401).json({ message: 'Unauthorized' });
  if (!isOrgMember)
    return res.status(403).json({ message: 'Not in an organization' });

  const patients = await Patient.find({ organization: orgId })
    .sort({ _id: -1 })
    .populate(['assignedNurse', 'assignedCaretaker', 'organization']);

  const rows = patients.map((p) => {
    const base = {
      _id: p._id,
      uuid: p.uuid,
      fullname: p.fullname,
      gender: p.gender,
      age: calcAge(p.dateOfBirth),
      assignedNurse: p.assignedNurse
        ? { _id: p.assignedNurse._id, fullname: p.assignedNurse.fullname }
        : null,
      assignedCaretaker: p.assignedCaretaker
        ? { _id: p.assignedCaretaker._id, fullname: p.assignedCaretaker.fullname }
        : null,
    };

    if (roleName === 'admin') {
      return {
        ...base,
        description: p.description,
        dateOfAdmitting: p.dateOfAdmitting,
        profilePhoto: p.profilePhoto,
      };
    }

    return base;
  });

  res.json(rows);
};

/* ──────────────────────────────────────────────────────────────────────────────
   Entry / Activity Log (Nurse)
──────────────────────────────────────────────────────────────────────────────── */
/**
 * @swagger
 * /api/v1/patients/entryreport:
 *   post:
 *     summary: Nurse logs a patient activity
 *     tags: [EntryReport]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, activityType]
 *             properties:
 *               patientId: { type: string }
 *               activityType: { type: string, example: "meal" }
 *               comment: { type: string }
 *               timestamp: { type: string, format: date-time }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Bad request }
 *       403: { description: Forbidden }
 */
const logEntry = async (req, res) => {
  const { me, roleName, isOrgMember, orgId } = req.ctx || {};
  if (!me) return res.status(401).json({ message: 'Unauthorized' });

  const { patientId, activityType, comment, timestamp } = req.body;
  mustBeObjectId(patientId, 'patientId');

  if (roleName !== 'nurse' && roleName !== 'admin') {
    return res
      .status(403)
      .json({ message: 'Only nurses or org admins can log entries' });
  }

  const p = await Patient.findById(patientId);
  if (!p) return res.status(404).json({ message: 'Patient not found' });

  if (p.organization) {
    if (!isOrgMember || !idEq(p.organization, orgId)) {
      return res
        .status(403)
        .json({ message: 'Forbidden: different organization' });
    }
    if (roleName !== 'admin' && !idEq(p.assignedNurse, me._id)) {
      return res.status(403).json({
        message: 'Only assigned nurse (or admin) can log for this org patient',
      });
    }
  } else {
    if (!(roleName === 'admin' && !isOrgMember) && !idEq(p.assignedNurse, me._id)) {
      return res.status(403).json({
        message: 'Only assigned nurse can log for this freelance patient',
      });
    }
  }

  const entry = await EntryReport.create({
    nurse: roleName === 'admin' ? p.assignedNurse || me._id : me._id,
    patient: p._id,
    activityType,
    comment,
    activityTimestamp: timestamp || new Date(),
  });

  audit(req, {
    category: 'entry',
    action: 'entry_created',
    actor: me._id,
    severity: 'info',
    targetModel: 'EntryReport',
    targetId: String(entry._id),
    meta: { patientId: String(p._id), activityType },
  });

  res
    .status(201)
    .json({ message: 'Activity logged successfully', activity: entry });
};

/**
 * @swagger
 * /api/v1/patients/activities:
 *   get:
 *     summary: Fetch activities for a patient (enforces access)
 *     tags: [EntryReport]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: patientId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Forbidden }
 */
const getPatientActivities = async (req, res) => {
  const { me, roleName, isOrgMember, orgId } = req.ctx || {};
  if (!me) return res.status(401).json({ message: 'Unauthorized' });

  const { patientId } = req.query;
  mustBeObjectId(patientId, 'patientId');

  const p = await Patient.findById(patientId).populate([
    'organization',
    'assignedNurse',
    'assignedCaretaker',
    'createdBy',
  ]);
  if (!p) return res.status(404).json({ message: 'Patient not found' });

  if (p.organization) {
    if (!isOrgMember || !idEq(p.organization, orgId)) {
      return res
        .status(403)
        .json({ message: 'Forbidden: different organization' });
    }
    if (roleName !== 'admin' && !isAssignedOrCreator(p, me._id)) {
      return res
        .status(403)
        .json({ message: 'Forbidden: not assigned to this org patient' });
    }
  } else {
    if (!isAssignedOrCreator(p, me._id)) {
      return res.status(403).json({
        message: 'Forbidden: not assigned to this freelance patient',
      });
    }
  }

  const activities = await EntryReport.find({ patient: p._id })
    .sort({ activityTimestamp: -1 })
    .populate('nurse', 'fullname');

  const out = activities.map((a) => {
    const obj = a.toObject();
    obj.nurse = obj.nurse ? obj.nurse.fullname : null;
    return obj;
  });

  res.json(out);
};

/**
 * @swagger
 * /api/v1/patients/entryreport/{entryId}:
 *   delete:
 *     summary: Delete an entry report (org admin or author nurse)
 *     tags: [EntryReport]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
const deleteEntry = async (req, res) => {
  const { me, roleName, isOrgMember, orgId } = req.ctx || {};
  if (!me) return res.status(401).json({ message: 'Unauthorized' });

  const { entryId } = req.params;
  mustBeObjectId(entryId, 'entryId');

  const entry = await EntryReport.findById(entryId);
  if (!entry) return res.status(404).json({ message: 'Entry not found' });

  const p = await Patient.findById(entry.patient);
  if (!p)
    return res.status(404).json({ message: 'Patient not found for this entry' });

  if (p.organization) {
    if (!isOrgMember || !idEq(p.organization, orgId)) {
      return res
        .status(403)
        .json({ message: 'Forbidden: different organization' });
    }
    if (roleName !== 'admin' && !idEq(entry.nurse, me._id)) {
      return res.status(403).json({
        message: 'Only org admin or the author nurse can delete this entry',
      });
    }
  } else {
    if (!idEq(entry.nurse, me._id)) {
      return res.status(403).json({
        message: 'Only the author nurse can delete this freelance entry',
      });
    }
  }

  await EntryReport.deleteOne({ _id: entryId });

  audit(req, {
    category: 'entry',
    action: 'entry_deleted',
    actor: me._id,
    severity: 'low',
    targetModel: 'EntryReport',
    targetId: String(entryId),
    meta: { patientId: String(p._id) },
  });

  res.json({ message: 'Entry deleted successfully' });
};

/* ──────────────────────────────────────────────────────────────────────────────
   Exports
──────────────────────────────────────────────────────────────────────────────── */
module.exports = {
  registerPatientFreelance,
  registerPatientOrgAdmin,
  listOrgPatients,
  getPatientDetails,
  assignNurseToPatient,
  assignCaretakerToPatient,
  getAssignedPatients,
  logEntry,
  getPatientActivities,
  deleteEntry,
};
