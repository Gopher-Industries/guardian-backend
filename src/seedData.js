const User = require('./models/User');
const Patient = require('./models/Patient');
const EntryReport = require('./models/EntryReport');
const Role = require('./models/Role');
const updateSeedData = require('./updateSeedData');

const getRoleId = async (name) => {
  const role = await Role.findOne({ name });
  if (!role) throw new Error(`Role '${name}' not found`);
  return role._id;
};

// Find an existing user by email, or create them.
// Avoids duplicate-key errors when patients failed to seed but users succeeded.
const findOrCreateUser = async (email, data) => {
  const existing = await User.findOne({ email });
  return existing || User.create(data);
};

const seedData = async () => {
  try {
    // Guard on patients, not alice — if a previous run created users but
    // crashed before creating patients, we still need to seed the patients.
    const seedPatientCount = await Patient.countDocuments({
      firstName: { $in: ['Elderly'] },
      lastName: { $in: ['PatientOne', 'PatientTwo'] },
    });

    if (seedPatientCount >= 2) {
      console.log('⚠️ Existing seed patients detected. Skipping seed to avoid duplication.');
      await updateSeedData();
      return;
    }

    console.log('🌱 Seeding initial records...');

    const hashedPassword = 'Password123!';

    const [caretakerRoleId, nurseRoleId] = await Promise.all([
      getRoleId('caretaker'),
      getRoleId('nurse'),
    ]);

    // Create (or find) users
    const [caretaker1, caretaker2, nurse1, nurse2] = await Promise.all([
      findOrCreateUser('alice@guardian.com', {
        fullname: 'Alice Smith',
        email: 'alice@guardian.com',
        password_hash: hashedPassword,
        role: caretakerRoleId,
      }),
      findOrCreateUser('bob@guardian.com', {
        fullname: 'Bob Johnson',
        email: 'bob@guardian.com',
        password_hash: hashedPassword,
        role: caretakerRoleId,
      }),
      findOrCreateUser('jane@guardian.com', {
        fullname: 'Nurse Jane',
        email: 'jane@guardian.com',
        password_hash: hashedPassword,
        role: nurseRoleId,
      }),
      findOrCreateUser('mike@guardian.com', {
        fullname: 'Nurse Mike',
        email: 'mike@guardian.com',
        password_hash: hashedPassword,
        role: nurseRoleId,
      }),
    ]);

    // Create patients
    const patient1 = await Patient.create({
      firstName: 'Elderly',
      lastName: 'PatientOne',
      dateOfBirth: new Date('1978-01-15'),
      birthSex: 'Male',
      caretakerId: caretaker1._id,
      nurseIds: [nurse1._id],
      createdBy: caretaker1._id,
      addressLine1: '1 Guardian Way',
      cityOrSuburb: 'Melbourne',
      postCode: '3000',
      mobilePhone: '+61412345678',
      emergencyContact: 'Margaret Smith',
      nextOfKin: 'Margaret Smith',
      nextOfKinRelationship: 'SPOUSE',
      medicalSummary: 'Managed hypertension with regular blood pressure monitoring. No known surgical history.',
      generalNotes: 'Prefers morning visits. Responds well to routine.',
      appointmentNotes: '',
      allergies: ['Penicillin'],
      conditions: ['Hypertension'],
      notes: 'Prefers morning visits. Responds well to routine.',
    });

    const patient2 = await Patient.create({
      firstName: 'Elderly',
      lastName: 'PatientTwo',
      dateOfBirth: new Date('1983-05-22'),
      birthSex: 'Female',
      caretakerId: caretaker2._id,
      nurseIds: [nurse1._id, nurse2._id],
      createdBy: caretaker2._id,
      addressLine1: '1 Guardian Way',
      cityOrSuburb: 'Melbourne',
      postCode: '3000',
      mobilePhone: '+61498765432',
      emergencyContact: 'David Lee',
      nextOfKin: 'David Lee',
      nextOfKinRelationship: 'CHILD',
      medicalSummary: 'Type 2 Diabetes diagnosed in 2015. Rheumatoid arthritis affecting both hands. On metformin and ibuprofen.',
      generalNotes: 'Requires low-sugar diet. Arthritis flares in cold weather.',
      appointmentNotes: '',
      allergies: ['Sulfa drugs', 'Shellfish'],
      conditions: ['Type 2 Diabetes', 'Arthritis'],
      notes: 'Requires low-sugar diet. Arthritis flares in cold weather.',
    });

    // Create entry reports
    await EntryReport.create([
      {
        patient: patient1._id,
        nurse: nurse1._id,
        activityType: 'wake up',
        comment: 'Patient woke up at 6:30 AM and appeared alert.',
        activityTimestamp: new Date('2024-06-05T06:30:00Z'),
      },
      {
        patient: patient1._id,
        nurse: nurse1._id,
        activityType: 'meal',
        comment: 'Had a light breakfast: toast and tea.',
        activityTimestamp: new Date('2024-06-05T07:30:00Z'),
      },
      {
        patient: patient2._id,
        nurse: nurse2._id,
        activityType: 'reading',
        comment: 'Read a magazine for 20 minutes.',
        activityTimestamp: new Date('2024-06-05T10:00:00Z'),
      },
      {
        patient: patient2._id,
        nurse: nurse1._id,
        activityType: 'meditation',
        comment: 'Guided breathing exercise for 15 minutes.',
        activityTimestamp: new Date('2024-06-05T11:00:00Z'),
      },
    ]);

    console.log('✅ Seed data inserted successfully');
  } catch (err) {
    console.error('❌ Error seeding data:', err.message || err);
    throw err;
  }
};

module.exports = seedData;