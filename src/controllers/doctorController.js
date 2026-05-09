const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Prescription = require('../models/Prescription');
const PatientLog = require('../models/PatientLog');
const Task = require('../models/Task');

const asInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Cache Role IDs for speed
const roleCache = {};
async function getRoleIdByName(name) {
  if (roleCache[name]) return roleCache[name];
  const role = await Role.findOne({ name }).select('_id').lean();
  if (!role) throw new Error(`Role "${name}" not found`);
  roleCache[name] = role._id.toString();
  return roleCache[name];
}

/**
 * @swagger
 * /api/v1/doctors:
 *   get:
 *     summary: Get all doctors
 *     description: Fetch a paginated list of users with role "doctor".
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by fullname or email (case-insensitive)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         description: Results per page
 *     responses:
 *       200:
 *         description: List of doctors
 *       500:
 *         description: Server error
 */
exports.listDoctors = async (req, res) => {
  try {
    const doctorRoleId = await getRoleIdByName('doctor');
    const search = (req.query.search || '').trim();
    const page = asInt(req.query.page, 1);
    const limit = asInt(req.query.limit, 20);
    const skip = (page - 1) * limit;

    const q = { role: doctorRoleId };
    if (search) {
      q.$or = [
        { fullname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [items, total] = await Promise.all([
      User.find(q)
        .select('_id fullname email created_at updated_at')
        .sort({ fullname: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(q)
    ]);

    res.status(200).json({
      doctors: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching doctors', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/patients/{patientId}/assign-doctor:
 *   post:
 *     summary: Assign or unassign a doctor to a patient
 *     description: >-
 *       Admins or caretakers can assign a doctor to a patient.
 *       Send `{ "doctorId": null }` to unassign.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               doctorId:
 *                 type: string
 *                 nullable: true
 *                 description: Doctor ObjectId, or null to unassign
 *           examples:
 *             assign:
 *               summary: Assign a doctor
 *               value: { doctorId: "66fabc1234567890abcdef12" }
 *             unassign:
 *               summary: Unassign the current doctor
 *               value: { doctorId: null }
 *     responses:
 *       200:
 *         description: Assignment updated
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Patient or doctor not found
 *       500:
 *         description: Server error
 */
exports.assignDoctorToPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { doctorId } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const prevDoctorId = patient.assignedDoctor ? patient.assignedDoctor.toString() : null;

    let newDoctorId = null;
    if (doctorId !== null && doctorId !== undefined && doctorId !== '') {
      if (!mongoose.Types.ObjectId.isValid(doctorId)) {
        return res.status(400).json({ error: 'Invalid doctorId' });
      }
      const doctorRoleId = await getRoleIdByName('doctor');
      const doctor = await User.findOne({ _id: doctorId, role: doctorRoleId })
        .select('_id')
        .lean();
      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found or user is not a doctor' });
      }
      newDoctorId = doctorId;
    }

    // Update patient
    patient.assignedDoctor = newDoctorId || null;
    await patient.save();

    // OPTIONAL: keep User.assignedPatients mirrored on doctor User
    if (prevDoctorId && (!newDoctorId || prevDoctorId !== newDoctorId)) {
      await User.updateOne(
        { _id: prevDoctorId },
        { $pull: { assignedPatients: patient._id } }
      );
    }
    if (newDoctorId) {
      await User.updateOne(
        { _id: newDoctorId },
        { $addToSet: { assignedPatients: patient._id } }
      );
    }

    res.status(200).json({
      message: newDoctorId ? 'Doctor assigned' : 'Doctor unassigned',
      patientId: patient._id,
      doctorId: patient.assignedDoctor
    });
  } catch (err) {
    res.status(500).json({ error: 'Error assigning doctor', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/doctors/profile:
 *   get:
 *     summary: Get the logged-in doctor's profile
 *     description: >-
 *       Returns the full profile for the currently authenticated doctor, combining their
 *       User account details (name, email, role, organisation, assigned patients) with their
 *       Doctor-specific record (phone, gender, age, address) stored in a separate collection.
 *       The doctor is identified from the JWT — no query parameters are required.
 *       Requires a valid JWT issued to a user with the **doctor** role.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Doctor profile fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: "6641a2f3c89e4b001f3d9abc"
 *                 fullname:
 *                   type: string
 *                   example: "Dr. Seed"
 *                 email:
 *                   type: string
 *                   example: "johndoctor@example.com"
 *                 role:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       example: "doctor"
 *                 organization:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                 assignedPatients:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       fullname:
 *                         type: string
 *                       age:
 *                         type: number
 *                       gender:
 *                         type: string
 *                 profile:
 *                   type: object
 *                   description: Doctor-specific data stored in the Doctor collection. Empty object if not yet set.
 *                   properties:
 *                     phone:
 *                       type: string
 *                       nullable: true
 *                       example: "04082234"
 *                     gender:
 *                       type: string
 *                       nullable: true
 *                       example: "M"
 *                     age:
 *                       type: number
 *                       nullable: true
 *                       example: 35
 *                     address:
 *                       type: string
 *                       nullable: true
 *                       example: "123 Health St, Sydney NSW 2000"
 *       404:
 *         description: The authenticated user's doctor record was not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Doctor not found"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */
exports.getProfile = async (req, res) => {
  try {
    const doctorId = req.user._id;

    const user = await User.findById(doctorId)
      .select('-password_hash -__v')
      .populate('role', 'name')
      .populate('organization', 'name')
      .populate('assignedPatients', 'fullname age gender')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const profile = await Doctor.findOne({ user: doctorId }).select('-__v -user').lean();

    res.status(200).json({ ...user, profile: profile || {} });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching doctor profile', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/doctors/profile:
 *   put:
 *     summary: Update the logged-in doctor's profile
 *     description: >-
 *       Updates profile information for the currently authenticated doctor. The doctor is
 *       identified from the JWT — no `doctorId` is required in the body. Fields are written
 *       to two collections: `fullname` and `email` are updated on the **User** record;
 *       `phone`, `gender`, `age`, and `address` are upserted into the **Doctor** collection.
 *       The Doctor record is created automatically on the first update. Only fields included
 *       in the request body are changed; omitted fields are left as-is. Requires a valid JWT
 *       issued to a user with the **doctor** role.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullname:
 *                 type: string
 *                 description: Updated display name. Written to the User record.
 *                 example: "Dr. Seed"
 *               email:
 *                 type: string
 *                 description: Updated email address. Written to the User record. Must be unique.
 *                 example: "johndoctor@example.com"
 *               phone:
 *                 type: string
 *                 description: Contact phone number. Stored in the Doctor record.
 *                 example: "04082234"
 *               gender:
 *                 type: string
 *                 description: Gender. Stored in the Doctor record.
 *                 example: "M"
 *               age:
 *                 type: number
 *                 description: Age in years. Stored in the Doctor record.
 *                 example: 35
 *               address:
 *                 type: string
 *                 description: Physical address. Stored in the Doctor record.
 *                 example: "123 Health St, Sydney NSW 2000"
 *           examples:
 *             full update:
 *               summary: Update all fields
 *               value:
 *                 fullname: "Dr. Seed"
 *                 email: "johndoctor@example.com"
 *                 phone: "04082234"
 *                 gender: "M"
 *                 age: 35
 *                 address: "123 Health St, Sydney NSW 2000"
 *             partial update:
 *               summary: Update phone and address only
 *               value:
 *                 phone: "0411999888"
 *                 address: "456 Care Ave, Melbourne VIC 3000"
 *     responses:
 *       200:
 *         description: Doctor profile updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Doctor profile updated successfully"
 *                 profile:
 *                   type: object
 *                   description: The updated Doctor record.
 *                   properties:
 *                     phone:
 *                       type: string
 *                       nullable: true
 *                       example: "04082234"
 *                     gender:
 *                       type: string
 *                       nullable: true
 *                       example: "M"
 *                     age:
 *                       type: number
 *                       nullable: true
 *                       example: 35
 *                     address:
 *                       type: string
 *                       nullable: true
 *                       example: "123 Health St, Sydney NSW 2000"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: The authenticated user's doctor record was not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Doctor not found"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */
exports.updateProfile = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { fullname, email, ...doctorFields } = req.body;

    const user = await User.findById(doctorId).select('_id').lean();
    if (!user) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const userUpdates = {};
    if (fullname) userUpdates.fullname = fullname;
    if (email) userUpdates.email = email;

    if (Object.keys(userUpdates).length) {
      await User.findByIdAndUpdate(doctorId, { $set: userUpdates }, { runValidators: true, context: 'query' });
    }

    const profile = await Doctor.findOneAndUpdate(
      { user: doctorId },
      { $set: doctorFields },
      { new: true, upsert: true, runValidators: true, select: '-__v -user' }
    ).lean();

    res.status(200).json({
      message: 'Doctor profile updated successfully',
      profile,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/doctors/dashboard-summary:
 *   get:
 *     summary: Get the logged-in doctor's dashboard summary
 *     description: >-
 *       Returns a real-time snapshot of activity scoped to the authenticated doctor.
 *       Includes total and active patient counts, a full prescription status breakdown,
 *       a task breakdown (total, completed, pending, and overdue tasks across all assigned
 *       patients), and a count of care activity (patient logs) recorded against their
 *       patients in the last 7 days. Requires a valid JWT issued to a user with the
 *       **doctor** role.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalPatients:
 *                   type: integer
 *                   description: Total patients assigned to this doctor.
 *                   example: 12
 *                 totalActivePatients:
 *                   type: integer
 *                   description: Patients assigned to this doctor who have not been deleted.
 *                   example: 10
 *                 prescriptions:
 *                   type: object
 *                   description: Breakdown of prescriptions written by this doctor.
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 30
 *                     active:
 *                       type: integer
 *                       example: 18
 *                     completed:
 *                       type: integer
 *                       example: 9
 *                     discontinued:
 *                       type: integer
 *                       example: 3
 *                 tasks:
 *                   type: object
 *                   description: Breakdown of tasks across this doctor's assigned patients.
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 25
 *                     completed:
 *                       type: integer
 *                       example: 14
 *                     pending:
 *                       type: integer
 *                       description: Tasks that are not yet completed (includes in-progress).
 *                       example: 8
 *                     overdue:
 *                       type: integer
 *                       description: Incomplete tasks whose due date has already passed.
 *                       example: 3
 *                 recentLogsCount:
 *                   type: integer
 *                   description: Patient log entries recorded against this doctor's patients in the last 7 days.
 *                   example: 5
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Resolve patient IDs for this doctor — needed for task and log queries
    const patientIds = await Patient.find({ assignedDoctor: doctorId }).distinct('_id');

    const [
      totalPatients,
      totalActivePatients,
      totalPrescriptions,
      activePrescriptions,
      completedPrescriptions,
      discontinuedPrescriptions,
      totalTasks,
      completedTasks,
      overdueTasks,
      recentLogsCount,
    ] = await Promise.all([
      Patient.countDocuments({ assignedDoctor: doctorId }),
      Patient.countDocuments({ doctor: doctorId, isDeleted: false }),
      Prescription.countDocuments({ prescriber: doctorId }),
      Prescription.countDocuments({ prescriber: doctorId, status: 'active' }),
      Prescription.countDocuments({ prescriber: doctorId, status: 'completed' }),
      Prescription.countDocuments({ prescriber: doctorId, status: 'discontinued' }),
      Task.countDocuments({ patient: { $in: patientIds } }),
      Task.countDocuments({ patient: { $in: patientIds }, status: 'completed' }),
      Task.countDocuments({ patient: { $in: patientIds }, status: { $ne: 'completed' }, dueDate: { $lt: now } }),
      PatientLog.countDocuments({ patient: { $in: patientIds }, createdAt: { $gte: sevenDaysAgo } }),
    ]);

    res.status(200).json({
      totalPatients,
      totalActivePatients,
      prescriptions: {
        total: totalPrescriptions,
        active: activePrescriptions,
        completed: completedPrescriptions,
        discontinued: discontinuedPrescriptions,
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
        overdue: overdueTasks,
      },
      recentLogsCount,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching dashboard summary', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/doctors/{doctorId}/patients:
 *   get:
 *     summary: Get patients assigned to a doctor
 *     description: Returns a paginated list of patients whose `doctor` equals the given doctorId. Allowed for the same doctor, admin, or caretaker.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *     responses:
 *       200:
 *         description: List of patients for the doctor
 *       400:
 *         description: Invalid doctorId
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
exports.listPatientsByDoctor = async (req, res) => {
    try {
      const { doctorId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(doctorId)) {
        return res.status(400).json({ error: 'Invalid doctorId' });
      }
  
      // Role IDs (also used to verify the target user is a doctor)
      const doctorRoleId = await getRoleIdByName('doctor');
  
      // Ensure target exists and is a doctor
      const doctor = await User.findOne({ _id: doctorId, role: doctorRoleId })
        .select('_id fullname')
        .lean();
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  
      // Since route-level verifyRole(['admin','caretaker','doctor']) already ran,
      // we only need to enforce the "doctor can only view self" rule here.
      const u = req.user || {};
      const roleRaw = u.role;
  
      // Normalize role to detect if requester is a doctor
      const roleId =
        (typeof roleRaw === 'string' && mongoose.Types.ObjectId.isValid(roleRaw))
          ? roleRaw
          : (roleRaw && roleRaw._id ? String(roleRaw._id) : null);
  
      const roleName =
        (typeof roleRaw === 'string' && !mongoose.Types.ObjectId.isValid(roleRaw))
          ? roleRaw.toLowerCase()
          : (roleRaw && roleRaw.name ? String(roleRaw.name).toLowerCase() : null);
  
      const isDoctorRequester = (roleId === doctorRoleId) || (roleName === 'doctor');
  
      // If requester is a doctor, they must be asking for THEIR OWN patients
      const requesterId = String(u._id || u.id || '');
      if (isDoctorRequester && requesterId !== String(doctorId)) {
        return res.status(403).json({ error: 'Doctors can only view their own patients' });
      }
  
      // Pagination
      const page = asInt(req.query.page, 1);
      const limit = asInt(req.query.limit, 20);
      const skip = (page - 1) * limit;
  
      // Query patients assigned to this doctor
      const [items, total] = await Promise.all([
        Patient.find({ assignedDoctor: doctorId })
          .select('_id fullname dateOfBirth gender caretaker assignedNurses doctor created_at updated_at')
          .sort({ fullname: 1 })
          .skip(skip)
          .limit(limit)
          .populate('caretaker', 'fullname email')
          .populate('assignedNurses', 'fullname email')
          .lean(),
        Patient.countDocuments({ assignedDoctor: doctorId })
      ]);
  
      return res.status(200).json({
        doctor: { _id: doctor._id, fullname: doctor.fullname },
        patients: items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      });
    } catch (err) {
      return res.status(500).json({ error: 'Error fetching doctor patients', details: err.message });
    }
  };
  