const mongoose = require('mongoose');

const MedicalRecord = require('../models/MedicalRecord');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Prescription = require('../models/Prescription');
const CarePlan = require('../models/CarePlan');
const Vital = require('../models/Vital');
const notifyRules = require('../services/notifyRules');

const getUserId = (req) => req.user?._id || req.user?.id;

const isSameId = (firstId, secondId) =>
  Boolean(
    firstId &&
    secondId &&
    firstId.toString() === secondId.toString()
  );

const toTextOrNull = (value) =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : null;

const canManageBookedAppointment = (appointment, req) => {
  const userId = getUserId(req);

  return (
    req.userRole === 'admin' ||
    isSameId(appointment.createdBy, userId) ||
    (
      req.userRole === 'doctor' &&
      isSameId(appointment.doctor, userId)
    )
  );
};

const getDoctorOrganizationIds = async (userId) => {
  const user = await User.findById(userId)
    .select('organization')
    .lean();

  if (!user) return [];

  const organizationQuery = [{ staff: userId }];

  if (user.organization) {
    organizationQuery.push({ _id: user.organization });
  }

  const organizations = await Organization.find({
    active: { $ne: false },
    $or: organizationQuery
  })
    .select('_id')
    .lean();

  return organizations.map((organization) =>
    organization._id.toString()
  );
};

const doctorCanAccessOrganization = async (
  userId,
  organizationId
) => {
  const organizationIds = await getDoctorOrganizationIds(userId);

  return organizationIds.some((id) =>
    isSameId(id, organizationId)
  );
};

const checkDoctorAndOrganization = async (
  doctorId,
  organizationId
) => {
  const [doctor, organization] = await Promise.all([
    User.findById(doctorId)
      .populate('role', 'name')
      .select('fullname role organization')
      .lean(),

    Organization.findById(organizationId)
      .select('name active staff')
      .lean()
  ]);

  if (!doctor) {
    return {
      error: 'Doctor not found.',
      statusCode: 404
    };
  }

  if (
    !doctor.role ||
    String(doctor.role.name).toLowerCase() !== 'doctor'
  ) {
    return {
      error: 'The selected user is not a doctor.',
      statusCode: 400
    };
  }

  if (!organization) {
    return {
      error: 'Organization not found.',
      statusCode: 404
    };
  }

  if (organization.active === false) {
    return {
      error: 'The selected organization is not active.',
      statusCode: 400
    };
  }

  const linkedThroughUser = isSameId(
    doctor.organization,
    organizationId
  );

  const linkedThroughStaff =
    Array.isArray(organization.staff) &&
    organization.staff.some((staffId) =>
      isSameId(staffId, doctorId)
    );

  if (!linkedThroughUser && !linkedThroughStaff) {
    return {
      error:
        'The selected doctor does not work for this organization.',
      statusCode: 400
    };
  }

  return {
    doctor,
    organization
  };
};

const getBasicRecordQuery = (id) =>
  MedicalRecord.findById(id)
    .populate('patient', 'fullname uuid')
    .populate('doctor', 'fullname email')
    .populate('organization', 'name')
    .populate('createdBy', 'fullname')
    .populate('startedBy', 'fullname')
    .populate('completedBy', 'fullname');

const privateMedicalFields = [
  '+generalNotes',
  '+symptoms',
  '+vitals',
  '+tests',
  '+diagnosis',
  '+clinicalNotes',
  '+referrals',
  '+prescriptions',
  '+carePlans',
  '+recommendations',
  '+followUp'
].join(' ');

const getFullRecordQuery = (id) =>
  MedicalRecord.findById(id)
    .select(privateMedicalFields)
    .populate('patient', 'fullname uuid')
    .populate('doctor', 'fullname email')
    .populate('organization', 'name')
    .populate('createdBy', 'fullname')
    .populate('startedBy', 'fullname')
    .populate('completedBy', 'fullname')
    .populate('carePlans');

const buildAppointmentDateTime = ({
  appointmentDateTime,
  appointmentDate,
  appointmentTime
}) => {
  if (appointmentDateTime) {
    const date = new Date(appointmentDateTime);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (appointmentDate && appointmentTime) {
    const date = new Date(
      `${appointmentDate}T${appointmentTime}:00.000Z`
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const normalizeSymptoms = (symptoms) => {
  if (Array.isArray(symptoms)) {
    return symptoms
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof symptoms === 'string') {
    const trimmed = symptoms.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item).trim())
            .filter(Boolean);
        }
      } catch (_error) {
        // Fall back to comma-separated text below.
      }
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeCarePlans = (carePlans, carePlanIds) => {
  if (Array.isArray(carePlans)) return carePlans;

  if (typeof carePlans === 'string' && carePlans.trim()) {
    const trimmed = carePlans.trim();

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (_error) {
        // Fall through to comma-separated parsing.
      }
    }

    return trimmed
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (typeof carePlanIds === 'string' && carePlanIds.trim()) {
    return carePlanIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
};

  const normalizePrescriptions = (
    prescriptions,
    prescriptionsJson,
    body = {}
  ) => {
    // Normal JSON request support
    if (Array.isArray(prescriptions)) {
      return prescriptions;
    }

    // Swagger form-style prescription fields
    const hasFlatPrescription =
      body.medicineName ||
      body.medicineDose ||
      body.medicineFrequency ||
      body.medicineDurationDays ||
      body.medicineQuantity ||
      body.medicineInstructions ||
      body.prescriptionNotes;

    if (hasFlatPrescription) {
      return [
        {
          notes: body.prescriptionNotes || '',
          items: [
            {
              name: body.medicineName,
              dose: body.medicineDose,
              frequency: body.medicineFrequency,
              durationDays: body.medicineDurationDays
                ? Number(body.medicineDurationDays)
               : undefined,
              quantity: body.medicineQuantity
                ? Number(body.medicineQuantity)
                : undefined,
              instructions: body.medicineInstructions || ''
            }
          ]
        }
      ];
    }

    // Keep support for older JSON-string input
    const source =
      typeof prescriptionsJson === 'string'
        ? prescriptionsJson
        : typeof prescriptions === 'string'
          ? prescriptions
          : '';

    if (!source.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      throw new Error(
        'Prescriptions must be a valid JSON array.'
    );
    }
  };

const normalizeVitals = (body) => {
  if (
    body.vitals &&
    typeof body.vitals === 'object' &&
    !Array.isArray(body.vitals)
  ) {
    return body.vitals;
  }

  if (typeof body.vitals === 'string' && body.vitals.trim()) {
    try {
      const parsed = JSON.parse(body.vitals);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_error) {
      throw new Error(
        'Vitals must be valid JSON when supplied in the vitals field.'
      );
    }
  }

  const flatVitals = {
    temperature: body.temperature,
    bloodPressure: body.bloodPressure,
    heartRate: body.heartRate,
    respiratoryRate: body.respiratoryRate,
    oxygenSaturation: body.oxygenSaturation,
    notes: body.vitalNotes
  };

  const hasAnyVital = Object.values(flatVitals).some(
    (value) =>
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
  );

  return hasAnyVital ? flatVitals : null;
};

const normalizeVitalNumbers = (vitals) => {
  if (!vitals) return null;

  const normalized = {
    temperature:
      vitals.temperature === '' ||
      vitals.temperature === undefined
        ? null
        : Number(vitals.temperature),
    bloodPressure: toTextOrNull(vitals.bloodPressure),
    heartRate:
      vitals.heartRate === '' ||
      vitals.heartRate === undefined
        ? null
        : Number(vitals.heartRate),
    respiratoryRate:
      vitals.respiratoryRate === '' ||
      vitals.respiratoryRate === undefined
        ? null
        : Number(vitals.respiratoryRate),
    oxygenSaturation:
      vitals.oxygenSaturation === '' ||
      vitals.oxygenSaturation === undefined
        ? null
        : Number(vitals.oxygenSaturation),
    notes: toTextOrNull(vitals.notes) || ''
  };

  for (const field of [
    'temperature',
    'heartRate',
    'respiratoryRate',
    'oxygenSaturation'
  ]) {
    if (
      normalized[field] !== null &&
      !Number.isFinite(normalized[field])
    ) {
      throw new Error(`${field} must be a valid number.`);
    }
  }

  if (
    normalized.oxygenSaturation !== null &&
    (normalized.oxygenSaturation < 0 ||
      normalized.oxygenSaturation > 100)
  ) {
    throw new Error(
      'oxygenSaturation must be between 0 and 100.'
    );
  }

  return normalized;
};

const formatVitalSnapshot = (vital) => {
  if (!vital) return null;

  const lines = [];

  if (vital.temperature !== null && vital.temperature !== undefined) {
    lines.push(`Temperature: ${vital.temperature}`);
  }
  if (vital.bloodPressure) {
    lines.push(`Blood Pressure: ${vital.bloodPressure}`);
  }
  if (vital.heartRate !== null && vital.heartRate !== undefined) {
    lines.push(`Heart Rate: ${vital.heartRate}`);
  }
  if (
    vital.respiratoryRate !== null &&
    vital.respiratoryRate !== undefined
  ) {
    lines.push(`Respiratory Rate: ${vital.respiratoryRate}`);
  }
  if (
    vital.oxygenSaturation !== null &&
    vital.oxygenSaturation !== undefined
  ) {
    lines.push(`Oxygen Saturation: ${vital.oxygenSaturation}%`);
  }
  if (vital.notes) {
    lines.push(`Notes: ${vital.notes}`);
  }

  return lines.length ? lines.join('\n') : null;
};

const formatPrescriptionSnapshot = (prescriptions) => {
  if (!prescriptions.length) return null;

  return prescriptions
    .map((prescription, prescriptionIndex) => {
      const lines = [`Prescription ${prescriptionIndex + 1}`];

      prescription.items.forEach((item, itemIndex) => {
        lines.push(
          `Medicine ${itemIndex + 1}: ${item.name}`,
          `Dose: ${item.dose}`,
          `Frequency: ${item.frequency}`,
          `Duration: ${item.durationDays} day(s)`
        );

        if (item.quantity !== undefined && item.quantity !== null) {
          lines.push(`Quantity: ${item.quantity}`);
        }

        if (item.instructions) {
          lines.push(`Instructions: ${item.instructions}`);
        }
      });

      if (prescription.notes) {
        lines.push(`Notes: ${prescription.notes}`);
      }

      return lines.join('\n');
    })
    .join('\n\n');
};

exports.createAppointment = async (req, res) => {
  try {
    const patient =
      req.body.patientId || req.body.patient;

    const doctor =
      req.body.doctorId || req.body.doctor;

    const {
      location,
      clinic,
      room,
      appointmentDateTime,
      appointmentDate,
      appointmentTime
    } = req.body;

    const appointmentDateValue = buildAppointmentDateTime({
      appointmentDateTime,
      appointmentDate,
      appointmentTime
    });

    if (
      !patient ||
      !doctor ||
      !location ||
      !appointmentDateValue
    ) {
      return res.status(400).json({
        error:
          'Patient, doctor, location, and appointment date/time are required.'
      });
    }

    if (
      !mongoose.isValidObjectId(patient) ||
      !mongoose.isValidObjectId(doctor)
    ) {
      return res.status(400).json({
        error: 'Patient or doctor ID is invalid.'
      });
    }

    if (typeof location !== 'string' || !location.trim()) {
      return res.status(400).json({
        error: 'Location is required.'
      });
    }

    const adminId = getUserId(req);

    const [adminUser, patientRecord, doctorRecord] =
      await Promise.all([
        User.findById(adminId)
          .populate('role', 'name')
          .select('fullname role organization')
          .lean(),

        Patient.findOne({
          _id: patient,
          isDeleted: { $ne: true }
        })
          .select('_id organization')
          .lean(),

        User.findById(doctor)
          .populate('role', 'name')
          .select('_id fullname role organization')
          .lean()
      ]);

    if (!adminUser) {
      return res.status(404).json({
        error: 'Admin user not found.'
      });
    }

    if (
      !adminUser.role ||
      String(adminUser.role.name).toLowerCase() !== 'admin'
    ) {
      return res.status(403).json({
        error: 'Only an admin can book an appointment.'
      });
    }

    if (!patientRecord) {
      return res.status(404).json({
        error: 'Patient not found.'
      });
    }

    if (!patientRecord.organization) {
      return res.status(400).json({
        error:
          'The selected patient is not linked to an organization.'
      });
    }

    if (!doctorRecord) {
      return res.status(404).json({
        error: 'Doctor not found.'
      });
    }

    if (
      !doctorRecord.role ||
      String(doctorRecord.role.name).toLowerCase() !== 'doctor'
    ) {
      return res.status(400).json({
        error: 'The selected user is not a doctor.'
      });
    }
    
    const adminOrganization = await Organization.findOne({
      createdBy: adminId,
      active: { $ne: false }
    })
    .select('_id name active staff')
    .lean();

    if (!adminOrganization) {
        return res.status(400).json({
        error:
          'The logged-in admin is not linked to an organization.'
        });
    }

const adminOrganizationId =
  adminOrganization._id.toString();

    const samePatientOrganization = isSameId(
      patientRecord.organization,
      adminOrganizationId
    );

    const sameDoctorOrganization =
      isSameId(
      doctorRecord.organization,
      adminOrganizationId
    ) ||
    (
      Array.isArray(adminOrganization.staff) &&
      adminOrganization.staff.some((staffId) =>
      isSameId(staffId, doctor)
      )
    );

    if (
      !samePatientOrganization ||
      !sameDoctorOrganization
    ) {
      return res.status(400).json({
        error:
          'The admin, patient, and doctor must belong to the same organization.'
      });
    }

    const organization = await Organization.findById(
      adminOrganizationId
    )
      .select('_id name active')
      .lean();

    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found.'
      });
    }

    if (organization.active === false) {
      return res.status(400).json({
        error: 'The organization is not active.'
      });
    }

    const appointment = await MedicalRecord.create({
      patient,
      doctor,
      organization: adminOrganizationId,
      location: location.trim(),
      clinic: clinic?.trim() || '',
      room: room?.trim() || '',
      appointmentDateTime: appointmentDateValue,
      status: 'booked',
      createdBy: adminId
    });

    const populatedAppointment =
      await getBasicRecordQuery(appointment._id);

    return res.status(201).json({
      message: 'Appointment booked successfully.',
      appointment: populatedAppointment
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor =
      req.body.doctorId || req.body.doctor;

    const {
      location,
      clinic,
      room,
      appointmentDateTime,
      appointmentDate,
      appointmentTime
    } = req.body;

    if (
      req.body.organization !== undefined ||
      req.body.organizationId !== undefined
    ) {
      return res.status(400).json({
        error:
          'Organization is set automatically and cannot be changed directly.'
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Appointment ID is invalid.'
      });
    }

    const hasDateUpdate =
      Boolean(appointmentDateTime) ||
      Boolean(appointmentDate) ||
      Boolean(appointmentTime);

    const hasLocationUpdate =
      location !== undefined &&
      location !== null &&
      String(location).trim() !== '';

    const hasClinicUpdate =
      clinic !== undefined &&
      clinic !== null &&
      String(clinic).trim() !== '';

    const hasRoomUpdate =
      room !== undefined &&
      room !== null &&
      String(room).trim() !== '';

    if (
      !doctor &&
      !hasLocationUpdate &&
      !hasClinicUpdate &&
      !hasRoomUpdate &&
      !hasDateUpdate
    ) {
      return res.status(400).json({
        error:
          'Provide a doctor, location, clinic, room, or appointment date/time to update.'
      });
    }

    const appointment =
      await MedicalRecord.findById(id);

    if (!appointment) {
      return res.status(404).json({
        error: 'Appointment not found.'
      });
    }

    if (
      appointment.status !== 'booked' ||
      appointment.startTime
    ) {
      return res.status(409).json({
        error:
          'This appointment cannot be changed because the consultation has already started.'
      });
    }

    if (!canManageBookedAppointment(appointment, req)) {
      return res.status(403).json({
        error:
          'You do not have permission to change this appointment.'
      });
    }

    if (doctor) {
      if (!mongoose.isValidObjectId(doctor)) {
        return res.status(400).json({
        error: 'Doctor ID is invalid.'
        });
      }

      const doctorCheck = await checkDoctorAndOrganization(
        doctor,
        appointment.organization
      );

      if (doctorCheck.error) {
        return res.status(doctorCheck.statusCode).json({
          error: doctorCheck.error
        });
      }
    }

    if (hasDateUpdate) {
      let updatedDateTime = null;

      if (appointmentDateTime) {
        updatedDateTime = buildAppointmentDateTime({
          appointmentDateTime
        });
      } else {
        const existingIso =
          appointment.appointmentDateTime.toISOString();

        updatedDateTime = buildAppointmentDateTime({
          appointmentDate:
            appointmentDate || existingIso.slice(0, 10),
          appointmentTime:
            appointmentTime || existingIso.slice(11, 16)
        });
      }

      if (!updatedDateTime) {
        return res.status(400).json({
          error: 'Appointment date and time is invalid.'
        });
      }

      appointment.appointmentDateTime = updatedDateTime;
    }

    if (hasLocationUpdate) {
      appointment.location = String(location).trim();
    }

    if (hasClinicUpdate) {
      appointment.clinic = String(clinic).trim();
    }

    if (hasRoomUpdate) {
      appointment.room = String(room).trim();
    }

    if (doctor) {
      appointment.doctor = doctor;
    }

    await appointment.save();

    const updatedAppointment =
      await getBasicRecordQuery(appointment._id);

    return res.status(200).json({
      message: 'Appointment updated successfully.',
      appointment: updatedAppointment
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Appointment ID is invalid.'
      });
    }

    const appointment = await MedicalRecord.findById(id);

    if (!appointment) {
      return res.status(404).json({
        error: 'Appointment not found.'
      });
    }

    if (
      appointment.status !== 'booked' ||
      appointment.startTime
    ) {
      return res.status(409).json({
        error:
          'This appointment cannot be deleted because the consultation has already started.'
      });
    }

    if (!canManageBookedAppointment(appointment, req)) {
      return res.status(403).json({
        error:
          'You do not have permission to delete this appointment.'
      });
    }

    await MedicalRecord.findByIdAndDelete(id);

    return res.status(200).json({
      message: 'Appointment deleted successfully.'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.startConsultation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Appointment ID is invalid.'
      });
    }

    const appointment = await MedicalRecord.findById(id);

    if (!appointment) {
      return res.status(404).json({
        error: 'Appointment not found.'
      });
    }

    if (
      appointment.status !== 'booked' ||
      appointment.startTime
    ) {
      return res.status(409).json({
        error:
          'This consultation has already started or has been completed.'
      });
    }

    appointment.startTime = new Date();
    appointment.startedBy = getUserId(req);
    appointment.status = 'in-progress';

    await appointment.save();

    const startedAppointment = await getBasicRecordQuery(
      appointment._id
    );

    return res.status(200).json({
      message: 'Consultation started successfully.',
      appointment: startedAppointment
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.unstartConsultation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Appointment ID is invalid.'
      });
    }

    const appointment = await MedicalRecord.findById(id);

    if (!appointment) {
      return res.status(404).json({
        error: 'Appointment not found.'
      });
    }

    if (
      appointment.status !== 'in-progress' ||
      !appointment.startTime ||
      appointment.endTime
    ) {
      return res.status(409).json({
        error:
          'Only an in-progress consultation can be unstarted.'
      });
    }

    appointment.startTime = null;
    appointment.startedBy = null;
    appointment.status = 'booked';

    await appointment.save();

    const updatedAppointment =
      await getBasicRecordQuery(appointment._id);

    return res.status(200).json({
      message: 'Consultation unstarted successfully.',
      appointment: updatedAppointment
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
};

// Doctor-only endpoint used when the doctor opens the consultation screen.
// It returns the patient's current medical record plus previous prescription
// and vital history, but only for doctors in the same organization.
exports.getConsultationData = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Medical record ID is invalid.'
      });
    }

    const record = await MedicalRecord.findById(id).lean();

    if (!record) {
      return res.status(404).json({
        error: 'Medical record not found.'
      });
    }

    const allowed = await doctorCanAccessOrganization(
      userId,
      record.organization
    );

    if (!allowed) {
      return res.status(403).json({
        error:
          'Doctors can only view patient medical details within their organization.'
      });
    }

    const [medicalRecord, patient, prescriptionHistory, vitalHistory] =
      await Promise.all([
        getFullRecordQuery(id),
        Patient.findOne({
          _id: record.patient,
          isDeleted: { $ne: true }
        }).select(
          'fullname uuid gender dateOfBirth medicalSummary allergies conditions notes organization'
        ),
        Prescription.find({ patient: record.patient })
          .populate('prescriber', 'fullname email')          
          .populate('updatedBy', 'fullname email')
          .sort({ createdAt: -1 }),
        Vital.find({ patient: record.patient })
          .populate('recordedBy', 'fullname email')
          .sort({ created_at: -1 })
      ]);

    return res.status(200).json({
      medicalRecord,
      patient,
      prescriptionHistory,
      vitalHistory
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.completeConsultation = async (req, res) => {
  const createdPrescriptionIds = [];
  let createdVitalId = null;
  let medicalRecordSaved = false;

  try {
    const { id } = req.params;

    const symptoms = normalizeSymptoms(req.body.symptoms);
    const prescriptions = normalizePrescriptions(
    req.body.prescriptions,
    req.body.prescriptionsJson,
    req.body
    );
    const carePlans = normalizeCarePlans(
      req.body.carePlans,
      req.body.carePlanIds
    );
    const vitals = normalizeVitalNumbers(
      normalizeVitals(req.body)
    );

    const diagnosis = toTextOrNull(req.body.diagnosis);
    const generalNotes =
      toTextOrNull(req.body.generalNotes) ||
      toTextOrNull(req.body.clinicalNotes);
    const clinicalNotes =
      toTextOrNull(req.body.clinicalNotes) ||
      generalNotes;
    const tests = toTextOrNull(req.body.tests);
    const referrals = toTextOrNull(req.body.referrals);
    const recommendations = toTextOrNull(
      req.body.recommendations
    );
    const followUp = toTextOrNull(req.body.followUp);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Appointment ID is invalid.'
      });
    }

    if (!diagnosis) {
      return res.status(400).json({
        error: 'Diagnosis is required.'
      });
    }

    for (const prescription of prescriptions) {
      if (
        !Array.isArray(prescription.items) ||
        prescription.items.length === 0
      ) {
        return res.status(400).json({
          error:
            'Every prescription must contain at least one medicine item.'
        });
      }

      for (const item of prescription.items) {
        if (
          !item.name ||
          !item.dose ||
          !item.frequency ||
          !item.durationDays
        ) {
          return res.status(400).json({
            error:
              'Each medicine requires name, dose, frequency and durationDays.'
          });
        }
      }
    }

    for (const carePlanId of carePlans) {
      if (!mongoose.isValidObjectId(carePlanId)) {
        return res.status(400).json({
          error: `Care Plan ID ${carePlanId} is invalid.`
        });
      }
    }

    const appointment = await MedicalRecord.findById(id);

    if (!appointment) {
      return res.status(404).json({
        error: 'Appointment not found.'
      });
    }

    const userId = getUserId(req);

    if (!isSameId(appointment.doctor, userId)) {
      return res.status(403).json({
        error:
          'Only the doctor assigned to this appointment can complete it.'
      });
    }

    if (
      appointment.status !== 'in-progress' ||
      !appointment.startTime ||
      appointment.endTime
    ) {
      return res.status(409).json({
        error:
          'This consultation is not currently in progress.'
      });
    }

    if (carePlans.length) {
      const uniqueCarePlanIds = [
        ...new Set(carePlans.map(String))
      ];

      const validCarePlans = await CarePlan.find({
        _id: { $in: uniqueCarePlanIds },
        patient: appointment.patient
      })
        .select('_id')
        .lean();

      if (validCarePlans.length !== uniqueCarePlanIds.length) {
        return res.status(400).json({
          error:
            'One or more Care Plan IDs are invalid or do not belong to this patient.'
        });
      }
    }

    let vitalRecord = null;

    if (vitals) {
      vitalRecord = await Vital.create({
        patient: appointment.patient,
        recordedBy: userId,
        ...vitals
      });

      createdVitalId = vitalRecord._id;
    }

    const prescriptionRecords = [];

    for (const prescriptionData of prescriptions) {
      const prescription = await Prescription.create({
        patient: appointment.patient,
        prescriber: userId,
        items: prescriptionData.items,
        notes: prescriptionData.notes,
        status: prescriptionData.status || 'active'
      });

      createdPrescriptionIds.push(prescription._id);
      prescriptionRecords.push(prescription);

      Promise.resolve(
        notifyRules.prescriptionCreated({
          prescriptionId: prescription._id,
          patientId: appointment.patient
        })
      ).catch(() => {});
    }

    appointment.generalNotes = generalNotes;
    appointment.symptoms = symptoms;
    appointment.vitals = formatVitalSnapshot(vitalRecord);
    appointment.tests = tests;
    appointment.diagnosis = diagnosis;
    appointment.clinicalNotes = clinicalNotes;
    appointment.referrals = referrals;
    appointment.prescriptions = formatPrescriptionSnapshot(
      prescriptionRecords
    );
    appointment.carePlans = carePlans;
    appointment.recommendations = recommendations;
    appointment.followUp = followUp;

    appointment.endTime = new Date();
    appointment.completedBy = userId;
    appointment.status = 'completed';

    await appointment.save();
    medicalRecordSaved = true;

    const completedRecord = await getFullRecordQuery(
      appointment._id
    );

    return res.status(200).json({
      message: 'Consultation completed successfully.',
      medicalRecord: completedRecord,
      createdVital: vitalRecord,
      createdPrescriptions: prescriptionRecords
    });
  } catch (error) {
    if (!medicalRecordSaved) {
      const cleanup = [];

      if (createdPrescriptionIds.length) {
        cleanup.push(
          Prescription.deleteMany({
            _id: { $in: createdPrescriptionIds }
          })
        );
      }

      if (createdVitalId) {
        cleanup.push(
          Vital.findByIdAndDelete(createdVitalId)
        );
      }

      if (cleanup.length) {
        await Promise.allSettled(cleanup);
      }
    }

    return res.status(500).json({
      error: error.message
    });
  }
};

exports.getMedicalRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Medical record ID is invalid.'
      });
    }

    const record = await MedicalRecord.findById(id);

    if (!record) {
      return res.status(404).json({
        error: 'Medical record not found.'
      });
    }

    const userId = getUserId(req);
    const isAdmin = req.userRole === 'admin';
    const isBookingCreator = isSameId(record.createdBy, userId);

    let doctorInSameOrganization = false;

    if (req.userRole === 'doctor') {
      doctorInSameOrganization =
        await doctorCanAccessOrganization(
          userId,
          record.organization
        );
    }

    if (
      !doctorInSameOrganization &&
      !isAdmin &&
      !isBookingCreator
    ) {
      return res.status(403).json({
        error:
          'You do not have permission to view this medical record.'
      });
    }

    const visibleRecord = doctorInSameOrganization
      ? await getFullRecordQuery(id)
      : await getBasicRecordQuery(id);

    return res.status(200).json({
      medicalRecord: visibleRecord
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getMedicalRecords = async (req, res) => {
  try {
    const userId = getUserId(req);
    const roleName = req.userRole;

    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100
    );

    const skip = (page - 1) * limit;
    const filter = {};
    let doctorOrganizationIds = [];

    if (roleName === 'doctor') {
      doctorOrganizationIds = await getDoctorOrganizationIds(
        userId
      );

      if (!doctorOrganizationIds.length) {
        return res.status(200).json({
          page,
          limit,
          total: 0,
          totalPages: 0,
          data: []
        });
      }

      filter.organization = {
        $in: doctorOrganizationIds
      };
    } else if (roleName === 'patient') {
      // Temporary until Patient is directly linked to the login User.
      filter.createdBy = userId;
    } else if (roleName !== 'admin') {
      return res.status(403).json({
        error:
          'You do not have permission to view these records.'
      });
    }

    const {
      status,
      patient,
      doctor,
      organization,
      from,
      to
    } = req.query;

    if (status) {
      if (
        !['booked', 'in-progress', 'completed'].includes(status)
      ) {
        return res.status(400).json({
          error: 'Status is invalid.'
        });
      }

      filter.status = status;
    }

    if (patient) {
      if (!mongoose.isValidObjectId(patient)) {
        return res.status(400).json({
          error: 'patient ID is invalid.'
        });
      }
      filter.patient = patient;
    }

    if (doctor) {
      if (!mongoose.isValidObjectId(doctor)) {
        return res.status(400).json({
          error: 'doctor ID is invalid.'
        });
      }
      filter.doctor = doctor;
    }

    if (organization) {
      if (!mongoose.isValidObjectId(organization)) {
        return res.status(400).json({
          error: 'organization ID is invalid.'
        });
      }

      if (
        roleName === 'doctor' &&
        !doctorOrganizationIds.some((id) =>
          isSameId(id, organization)
        )
      ) {
        return res.status(403).json({
          error:
            'Doctors can only view medical records in their organization.'
        });
      }

      filter.organization = organization;
    }

    if (from || to) {
      filter.appointmentDateTime = {};

      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({
            error: 'From date is invalid.'
          });
        }
        filter.appointmentDateTime.$gte = fromDate;
      }

      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({
            error: 'To date is invalid.'
          });
        }
        filter.appointmentDateTime.$lte = toDate;
      }
    }

    let recordsQuery = MedicalRecord.find(filter)
      .populate('patient', 'fullname uuid')
      .populate('doctor', 'fullname email')
      .populate('organization', 'name')
      .populate('createdBy', 'fullname')
      .populate('startedBy', 'fullname')
      .populate('completedBy', 'fullname')
      .sort({ appointmentDateTime: -1 })
      .skip(skip)
      .limit(limit);

    if (roleName === 'doctor') {
      recordsQuery = recordsQuery
        .select(privateMedicalFields)
        .populate('carePlans');
    }

    const [records, total] = await Promise.all([
      recordsQuery,
      MedicalRecord.countDocuments(filter)
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: records
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
