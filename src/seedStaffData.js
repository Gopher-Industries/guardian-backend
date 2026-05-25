'use strict';

const User = require('./models/User');
const Patient = require('./models/Patient');
const Task = require('./models/Task');
const PatientLog = require('./models/PatientLog');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const seedStaffData = async () => {
  try {
    // Depend on seedData having run first — find the seed staff by email
    const [jane, mike, alice, bob] = await Promise.all([
      User.findOne({ email: 'jane@guardian.com' }),
      User.findOne({ email: 'mike@guardian.com' }),
      User.findOne({ email: 'alice@guardian.com' }),
      User.findOne({ email: 'bob@guardian.com' }),
    ]);

    if (!jane) {
      console.log('⚠️  Staff seed users not found — run seedData first. Skipping seedStaffData.');
      return;
    }

    // Guard: skip if tasks already exist for jane
    const existing = await Task.countDocuments({ nurse_id: jane._id });
    if (existing > 0) {
      console.log('⚠️  Staff task/log seed already present — skipping.');
      return;
    }

    console.log('🌱 Seeding staff tasks and patient logs...');

    // Find the patients these staff are assigned to
    const [patient1, patient2] = await Promise.all([
      Patient.findOne({ fullname: 'Elderly Patient One' }),
      Patient.findOne({ fullname: 'Elderly Patient Two' }),
    ]);

    if (!patient1 || !patient2) {
      console.log('⚠️  Seed patients not found — run seedData first. Skipping seedStaffData.');
      return;
    }

    // Tasks
    // alice (caretaker) → patient1 | bob (caretaker) → patient2
    // jane (nurse) → patient1 + patient2 | mike (nurse) → patient2
    await Task.create([
      // ── Alice (caretaker1) tasks for patient1 ──────────────────────────────
      {
        description: 'Morning medication round',
        dueDate: daysAgo(4),
        priority: 'high',
        status: 'completed',
        patient: patient1._id,
        caretaker: alice._id,
      },
      {
        description: 'Assist with physiotherapy exercises',
        dueDate: daysAgo(2),
        priority: 'medium',
        status: 'completed',
        patient: patient1._id,
        caretaker: alice._id,
      },
      {
        description: 'Prepare evening meal (low-sodium)',
        dueDate: daysFromNow(1),
        priority: 'medium',
        status: 'pending',
        patient: patient1._id,
        caretaker: alice._id,
      },
      {
        description: 'Arrange GP follow-up appointment',
        dueDate: daysFromNow(3),
        priority: 'low',
        status: 'in progress',
        patient: patient1._id,
        caretaker: alice._id,
      },
      {
        description: 'Weekly bathroom safety check',
        dueDate: daysAgo(5),
        priority: 'high',
        status: 'pending',
        patient: patient1._id,
        caretaker: alice._id,
      },
      {
        description: 'Complete monthly care report',
        dueDate: daysAgo(3),
        priority: 'medium',
        status: 'in progress',
        patient: patient1._id,
        caretaker: alice._id,
      },

      // ── Bob (caretaker2) tasks for patient2 ───────────────────────────────
      {
        description: 'Administer insulin injection',
        dueDate: daysAgo(3),
        priority: 'high',
        status: 'completed',
        patient: patient2._id,
        caretaker: bob._id,
      },
      {
        description: 'Blood glucose monitoring — morning',
        dueDate: daysAgo(1),
        priority: 'high',
        status: 'completed',
        patient: patient2._id,
        caretaker: bob._id,
      },
      {
        description: 'Prepare diabetic-friendly lunch',
        dueDate: daysFromNow(1),
        priority: 'medium',
        status: 'pending',
        patient: patient2._id,
        caretaker: bob._id,
      },
      {
        description: 'Log dietary intake for the day',
        dueDate: daysAgo(6),
        priority: 'low',
        status: 'pending',
        patient: patient2._id,
        caretaker: bob._id,
      },
      {
        description: 'Foot examination for neuropathy signs',
        dueDate: daysAgo(4),
        priority: 'high',
        status: 'pending',
        patient: patient2._id,
        caretaker: bob._id,
      },

      // ── Jane (nurse1) tasks for patient1 (alice is caretaker) ─────────────
      {
        description: 'Blood pressure check and log',
        dueDate: daysAgo(3),
        priority: 'high',
        status: 'completed',
        patient: patient1._id,
        caretaker: alice._id,
        nurse_id: jane._id,
      },
      {
        description: 'Wound dressing change',
        dueDate: daysAgo(1),
        priority: 'high',
        status: 'completed',
        patient: patient1._id,
        caretaker: alice._id,
        nurse_id: jane._id,
      },
      {
        description: 'Vital signs observation — afternoon',
        dueDate: daysFromNow(2),
        priority: 'medium',
        status: 'pending',
        patient: patient1._id,
        caretaker: alice._id,
        nurse_id: jane._id,
      },
      {
        description: 'IV line flush and check',
        dueDate: daysAgo(5),
        priority: 'high',
        status: 'pending',
        patient: patient1._id,
        caretaker: alice._id,
        nurse_id: jane._id,
      },

      // ── Jane (nurse1) tasks for patient2 (bob is caretaker) ──────────────
      {
        description: 'Post-meal glucose reading',
        dueDate: daysAgo(2),
        priority: 'high',
        status: 'completed',
        patient: patient2._id,
        caretaker: bob._id,
        nurse_id: jane._id,
      },
      {
        description: 'HbA1c test preparation',
        dueDate: daysFromNow(4),
        priority: 'medium',
        status: 'in progress',
        patient: patient2._id,
        caretaker: bob._id,
        nurse_id: jane._id,
      },
      {
        description: 'Update patient medication chart',
        dueDate: daysAgo(7),
        priority: 'medium',
        status: 'pending',
        patient: patient2._id,
        caretaker: bob._id,
        nurse_id: jane._id,
      },

      // ── Mike (nurse2) tasks for patient2 (bob is caretaker) ──────────────
      {
        description: 'Evening obs round',
        dueDate: daysAgo(2),
        priority: 'high',
        status: 'completed',
        patient: patient2._id,
        caretaker: bob._id,
        nurse_id: mike._id,
      },
      {
        description: 'Insulin dose adjustment review',
        dueDate: daysFromNow(2),
        priority: 'high',
        status: 'pending',
        patient: patient2._id,
        caretaker: bob._id,
        nurse_id: mike._id,
      },
      {
        description: 'Patient mobility assessment',
        dueDate: daysAgo(8),
        priority: 'medium',
        status: 'pending',
        patient: patient2._id,
        caretaker: bob._id,
        nurse_id: mike._id,
      },
    ]);

    // Patient logs (within last 7 days so recentLogsCount > 0)
    await PatientLog.create([
      // Jane logs
      {
        title: 'BP reading — slightly elevated',
        description: 'Patient One BP was 148/90. Caretaker notified. Plan to monitor again tomorrow.',
        patient: patient1._id,
        createdBy: jane._id,
        createdAt: daysAgo(1),
      },
      {
        title: 'Wound showing signs of improvement',
        description: 'Wound site clean with no signs of infection. Dressing changed successfully.',
        patient: patient1._id,
        createdBy: jane._id,
        createdAt: daysAgo(3),
      },
      {
        title: 'Post-meal glucose within target range',
        description: 'Patient Two glucose 7.4 mmol/L two hours post-lunch. Within acceptable range.',
        patient: patient2._id,
        createdBy: jane._id,
        createdAt: daysAgo(2),
      },
      // Mike logs
      {
        title: 'Evening obs normal',
        description: 'All vitals stable. Patient Two resting comfortably. No concerns to report.',
        patient: patient2._id,
        createdBy: mike._id,
        createdAt: daysAgo(1),
      },
      {
        title: 'Insulin dose reviewed',
        description: 'Discussed insulin timing adjustment with caretaker. Will trial new schedule tomorrow.',
        patient: patient2._id,
        createdBy: mike._id,
        createdAt: daysAgo(4),
      },
      // Alice logs
      {
        title: 'Physio exercises completed',
        description: 'Patient One completed morning physiotherapy session with good participation.',
        patient: patient1._id,
        createdBy: alice._id,
        createdAt: daysAgo(2),
      },
      // Bob logs
      {
        title: 'Dietary log updated',
        description: 'Patient Two consumed all meals within dietary guidelines. Blood sugar stable post-dinner.',
        patient: patient2._id,
        createdBy: bob._id,
        createdAt: daysAgo(3),
      },
    ]);

    console.log('✅ Staff seed complete — tasks and logs created for jane, mike, alice, bob.');
  } catch (err) {
    console.error('❌ Error seeding staff data:', err.message);
    throw err;
  }
};

module.exports = seedStaffData;
