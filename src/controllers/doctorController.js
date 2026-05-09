const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');

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

    const prevDoctorId = patient.doctor ? patient.doctor.toString() : null;

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
    patient.doctor = newDoctorId || null;
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
      doctorId: patient.doctor
    });
  } catch (err) {
    res.status(500).json({ error: 'Error assigning doctor', details: err.message });
  }
};

/**
 * @swagger
 * /api/v1/doctors/profile:
 *   get:
 *     summary: Get a doctor's profile
 *     description: >-
 *       Returns the full profile for a doctor, combining their User account details
 *       (name, email, role, organisation, assigned patients) with their Doctor-specific
 *       record (phone, gender, age, address). The Doctor-specific record is stored in a
 *       separate collection linked by the user ID. Requires a valid JWT issued to a user
 *       with the **doctor** role. Provide either `doctorId` or `email` as a query parameter.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           example: "6641a2f3c89e4b001f3d9abc"
 *         description: MongoDB ObjectId of the doctor's User record. Takes priority over `email` if both are supplied.
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           example: "johndoctor@example.com"
 *         description: Email address of the doctor. Used only when `doctorId` is omitted.
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
 *                   example: "John Doe"
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
 *                   description: Doctor-specific profile data stored in the Doctor collection.
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
 *       400:
 *         description: Neither `doctorId` nor `email` was provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Please provide either doctorId or email"
 *       404:
 *         description: No user matching the given `doctorId` or `email` was found.
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
    const { doctorId, email } = req.query;

    const query = doctorId ? { _id: doctorId } : email ? { email } : null;
    if (!query) {
      return res.status(400).json({ error: 'Please provide either doctorId or email' });
    }

    const user = await User.findOne(query)
      .select('-password_hash -__v')
      .populate('role', 'name')
      .populate('organization', 'name')
      .populate('assignedPatients', 'fullname age gender')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const profile = await Doctor.findOne({ user: user._id }).select('-__v -user').lean();

    res.status(200).json({ ...user, profile: profile || {} });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching doctor profile', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/doctors/profile:
 *   put:
 *     summary: Update a doctor's profile
 *     description: >-
 *       Updates profile information for a doctor. Fields are written to two collections:
 *       `fullname` and `email` are updated on the **User** record; `phone`, `gender`,
 *       `age`, and `address` are upserted into the **Doctor** collection linked by the
 *       user ID. The Doctor record is created automatically on the first update — no
 *       separate registration step is required. Only fields included in the request body
 *       are changed; omitted fields are left as-is. Requires a valid JWT issued to a user
 *       with the **doctor** role.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctorId
 *             properties:
 *               doctorId:
 *                 type: string
 *                 description: MongoDB ObjectId of the doctor's User record.
 *                 example: "6641a2f3c89e4b001f3d9abc"
 *               fullname:
 *                 type: string
 *                 description: Updated display name. Written to the User record.
 *                 example: "John Doe"
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
 *                 doctorId: "6641a2f3c89e4b001f3d9abc"
 *                 fullname: "John Doe"
 *                 email: "johndoctor@example.com"
 *                 phone: "04082234"
 *                 gender: "M"
 *                 age: 35
 *                 address: "123 Health St, Sydney NSW 2000"
 *             partial update:
 *               summary: Update phone and address only
 *               value:
 *                 doctorId: "6641a2f3c89e4b001f3d9abc"
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
 *       400:
 *         description: "`doctorId` was not provided in the request body."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing doctorId"
 *       404:
 *         description: No User record found for the given `doctorId`.
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
    const { doctorId, fullname, email, ...doctorFields } = req.body;

    if (!doctorId) {
      return res.status(400).json({ error: 'Missing doctorId' });
    }

    const user = await User.findById(doctorId).select('-password_hash -__v').lean();
    if (!user) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Update allowed User fields
    const userUpdates = {};
    if (fullname) userUpdates.fullname = fullname;
    if (email) userUpdates.email = email;

    if (Object.keys(userUpdates).length) {
      await User.findByIdAndUpdate(doctorId, { $set: userUpdates }, { runValidators: true, context: 'query' });
    }

    // Upsert Doctor-specific fields
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
        Patient.find({ doctor: doctorId })
          .select('_id fullname dateOfBirth gender caretaker assignedNurses doctor created_at updated_at')
          .sort({ fullname: 1 })
          .skip(skip)
          .limit(limit)
          .populate('caretaker', 'fullname email')
          .populate('assignedNurses', 'fullname email')
          .lean(),
        Patient.countDocuments({ doctor: doctorId })
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
  