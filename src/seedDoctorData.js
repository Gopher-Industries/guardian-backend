'use strict';

const Role = require('./models/Role');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Prescription = require('./models/Prescription');
const Task = require('./models/Task');
const PatientLog = require('./models/PatientLog');

const DOCTOR_EMAIL = 'dr.seed@guardian.com';

const getRoleId = async (name) => {
  const role = await Role.findOne({ name });
  if (!role) throw new Error(`Role '${name}' not found`);
  return role._id;
};

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const seedDoctorData = async () => {
  try {
    const [doctorRoleId, caretakerRoleId] = await Promise.all([
      getRoleId('doctor'),
      getRoleId('caretaker'),
    ]);

    // Find or create the seed doctor user
    let doctor = await User.findOne({ email: DOCTOR_EMAIL });
    if (!doctor) {
      doctor = await User.create({
        fullname: 'Dr. Seed',
        email: DOCTOR_EMAIL,
        password_hash: 'Password123!',
        role: doctorRoleId,
      });
      console.log('🌱 Created seed doctor user.');
    }

    // Remove legacy generic fields from every Doctor document (safe no-op if already absent)
    await Doctor.updateMany(
      {},
      { $unset: { phone: '', gender: '', age: '', address: '' } }
    );

    // Seed initial doctor-specific fields only on first insert — $setOnInsert
    // means existing records (already updated via the API) are never overwritten.
    await Doctor.findOneAndUpdate(
      { user: doctor._id },
      { $setOnInsert: { specialization: 'Geriatrics', licenseNumber: 'MED-2024-001' } },
      { upsert: true, new: true }
    );

    // Guard on patients — if already seeded, skip data creation
    const existingPatients = await Patient.countDocuments({ assignedDoctor: doctor._id });
    if (existingPatients > 0) {
      console.log('⚠️  Doctor seed data already present — skipping patient/prescription/task/log creation.');
      return;
    }

    console.log('Seeding doctor patients, prescriptions, tasks and logs...');

    // Reuse an existing caretaker, or create one (Task.caretaker is required)
    let caretaker = await User.findOne({ role: caretakerRoleId });
    if (!caretaker) {
      caretaker = await User.create({
        fullname: 'Seed Caretaker',
        email: 'caretaker.seed@guardian.com',
        password_hash: 'Password123!',
        role: caretakerRoleId,
      });
    }

    // Create 3 patients assigned to the seed doctor
    const [p1, p2, p3] = await Patient.create([
      {
        fullname: 'Eleanor Voss',
        dateOfBirth: new Date('1945-03-12'),
        gender: 'F',
        assignedDoctor: doctor._id,
        caretaker: caretaker._id,
        dateOfAdmitting: daysAgo(60),
        description: 'Post-stroke rehabilitation with mobility support.',
        emergencyContactName: 'Tom Voss',
        emergencyContactNumber: '+61411000001',
        nextOfKinName: 'Tom Voss',
        nextOfKinRelationship: 'CHILD',
        medicalSummary: 'Ischaemic stroke 2023. Mild left-sided weakness. On anticoagulants.',
        allergies: ['Aspirin'],
        conditions: ['Stroke', 'Hypertension'],
      },
      {
        fullname: 'Raymond Park',
        dateOfBirth: new Date('1950-07-28'),
        gender: 'M',
        assignedDoctor: doctor._id,
        caretaker: caretaker._id,
        dateOfAdmitting: daysAgo(45),
        description: 'Diabetic patient requiring insulin management and dietary oversight.',
        emergencyContactName: 'Susan Park',
        emergencyContactNumber: '+61411000002',
        nextOfKinName: 'Susan Park',
        nextOfKinRelationship: 'SPOUSE',
        medicalSummary: 'Type 2 Diabetes since 2010. CKD Stage 2. On metformin and insulin.',
        allergies: ['Sulfa drugs'],
        conditions: ['Type 2 Diabetes', 'CKD'],
      },
      {
        fullname: 'Margaret Chen',
        dateOfBirth: new Date('1938-11-04'),
        gender: 'F',
        assignedDoctor: doctor._id,
        caretaker: caretaker._id,
        dateOfAdmitting: daysAgo(30),
        description: 'Dementia patient requiring daily cognitive support and monitoring.',
        emergencyContactName: 'Linda Chen',
        emergencyContactNumber: '+61411000003',
        nextOfKinName: 'Linda Chen',
        nextOfKinRelationship: 'CHILD',
        medicalSummary: "Moderate Alzheimer's disease. On donepezil. History of falls.",
        allergies: [],
        conditions: ["Alzheimer's Disease"],
      },
    ]);

    // Mirror patients on doctor's assignedPatients
    await User.findByIdAndUpdate(doctor._id, {
      $set: { assignedPatients: [p1._id, p2._id, p3._id] },
    });

    // Prescriptions (active, completed, discontinued) written by the doctor
    await Prescription.create([
      {
        patient: p1._id,
        prescriber: doctor._id,
        status: 'active',
        notes: 'Monitor BP weekly.',
        items: [{ name: 'Warfarin', dose: '5mg', frequency: 'daily', durationDays: 90 }],
      },
      {
        patient: p1._id,
        prescriber: doctor._id,
        status: 'active',
        notes: 'For pain management.',
        items: [{ name: 'Paracetamol', dose: '500mg', frequency: 'twice daily', durationDays: 30 }],
      },
      {
        patient: p2._id,
        prescriber: doctor._id,
        status: 'active',
        notes: 'Check HbA1c monthly.',
        items: [
          { name: 'Metformin', dose: '500mg', frequency: 'twice daily', durationDays: 90 },
          { name: 'Insulin Glargine', dose: '10 units', frequency: 'nightly', durationDays: 90 },
        ],
      },
      {
        patient: p2._id,
        prescriber: doctor._id,
        status: 'completed',
        notes: 'Short course completed.',
        items: [{ name: 'Amoxicillin', dose: '250mg', frequency: 'three times daily', durationDays: 7 }],
      },
      {
        patient: p3._id,
        prescriber: doctor._id,
        status: 'active',
        notes: 'Review in 3 months.',
        items: [{ name: 'Donepezil', dose: '10mg', frequency: 'nightly', durationDays: 90 }],
      },
      {
        patient: p3._id,
        prescriber: doctor._id,
        status: 'discontinued',
        notes: 'Discontinued due to adverse reaction.',
        items: [{ name: 'Rivastigmine', dose: '3mg', frequency: 'twice daily', durationDays: 60 }],
      },
    ]);

    // Tasks for the doctor's patients (completed, pending, overdue)
    await Task.create([
      {
        description: 'Morning blood pressure check',
        dueDate: daysAgo(5),
        priority: 'high',
        status: 'completed',
        patient: p1._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Administer warfarin dose',
        dueDate: daysAgo(3),
        priority: 'high',
        status: 'completed',
        patient: p1._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Blood glucose reading before lunch',
        dueDate: daysAgo(2),
        priority: 'high',
        status: 'completed',
        patient: p2._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Schedule physiotherapy session',
        dueDate: daysFromNow(3),
        priority: 'medium',
        status: 'pending',
        patient: p1._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Insulin injection — evening',
        dueDate: daysFromNow(1),
        priority: 'high',
        status: 'pending',
        patient: p2._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Cognitive activity session',
        dueDate: daysFromNow(2),
        priority: 'medium',
        status: 'in progress',
        patient: p3._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Weekly weight measurement',
        dueDate: daysAgo(4),
        priority: 'low',
        status: 'pending',
        patient: p2._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Fall risk reassessment',
        dueDate: daysAgo(7),
        priority: 'high',
        status: 'pending',
        patient: p3._id,
        caretaker: caretaker._id,
      },
      {
        description: 'Dietary review with caretaker',
        dueDate: daysAgo(2),
        priority: 'medium',
        status: 'in progress',
        patient: p3._id,
        caretaker: caretaker._id,
      },
    ]);

    // Recent patient logs (within last 7 days)
    await PatientLog.create([
      {
        title: 'BP elevated — action taken',
        description: "Eleanor's BP was 155/95. Warfarin dose reviewed and caretaker notified.",
        patient: p1._id,
        createdBy: doctor._id,
        createdAt: daysAgo(1),
      },
      {
        title: 'Post-stroke mobility progress noted',
        description: 'Eleanor walked 50m unassisted in morning session. Improvement from last week.',
        patient: p1._id,
        createdBy: doctor._id,
        createdAt: daysAgo(3),
      },
      {
        title: 'Blood glucose high — insulin adjusted',
        description: "Raymond's fasting glucose was 11.2 mmol/L. Insulin dose increased by 2 units.",
        patient: p2._id,
        createdBy: doctor._id,
        createdAt: daysAgo(2),
      },
      {
        title: 'Cognitive assessment completed',
        description: 'Margaret scored 18/30 on MMSE. Slight decline from last month — family informed.',
        patient: p3._id,
        createdBy: doctor._id,
        createdAt: daysAgo(4),
      },
      {
        title: 'Fall incident reported',
        description: 'Margaret experienced a minor fall in the bathroom. No injury. Safety rails requested.',
        patient: p3._id,
        createdBy: doctor._id,
        createdAt: daysAgo(6),
      },
    ]);

    console.log(`Doctor seed complete — login: ${DOCTOR_EMAIL} / Password123!`);
  } catch (err) {
    console.error('Error seeding doctor data:', err.message);
    throw err;
  }
};

module.exports = seedDoctorData;
