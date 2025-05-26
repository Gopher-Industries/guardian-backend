const bcrypt = require('bcryptjs');

// Models
const Role = require('./models/Role');
const User = require('./models/User');
const Patient = require('./models/Patient');
const EntryReport = require('./models/EntryReport');

const getRoleId = async (name) => {
  const role = await Role.findOne({ name });
  if (!role) throw new Error(`Role '${name}' not found`);
  return role._id;
};

const seedData = async () => {
  try {
    const userCount = await User.countDocuments();
    const patientCount = await Patient.countDocuments();
    const reportCount = await EntryReport.countDocuments();

    // Clear previous data
    // await User.deleteMany({});
    // await Patient.deleteMany({});
    // await EntryReport.deleteMany({});

    if (userCount > 0 || patientCount > 0 || reportCount > 0) {
      console.log('⚠️ Existing data detected. Skipping seed to avoid duplication.');
      return;
    }

    console.log('🌱 No existing data found. Seeding initial records...');

    // Passwords
    const hashedPassword = 'Password123!';

    // Create caretakers
    const caretaker1 = await User.create({
      fullname: 'Alice Smith',
      email: 'alice@guardian.com',
      password_hash: hashedPassword,
      role: await getRoleId('caretaker')
    });

    const caretaker2 = await User.create({
      fullname: 'Bob Johnson',
      email: 'bob@guardian.com',
      password_hash: hashedPassword,
      role: await getRoleId('caretaker')
    });

    // Create nurses
    const nurse1 = await User.create({
      fullname: 'Nurse Jane',
      email: 'jane@guardian.com',
      password_hash: hashedPassword,
      role: await getRoleId('nurse')
    });

    const nurse2 = await User.create({
      fullname: 'Nurse Mike',
      email: 'mike@guardian.com',
      password_hash: hashedPassword,
      role: await getRoleId('nurse')
    });

    // Create patients
    const patient1 = await Patient.create({
      fullname: 'Elderly Patient One',
      dateOfBirth: new Date('1978-01-15'),
      gender: 'male',
      caretaker: caretaker1._id,
      assignedNurses: [nurse1._id],
      healthConditions: ['hypertension']
    });

    const patient2 = await Patient.create({
      fullname: 'Elderly Patient Two',
      dateOfBirth: new Date('1983-05-22'),
      gender: 'female',
      caretaker: caretaker2._id,
      assignedNurses: [nurse1._id, nurse2._id],
      healthConditions: ['diabetes', 'arthritis']
    });

    // Create entry reports
    await EntryReport.create([
      {
        patient: patient1._id,
        nurse: nurse1._id,
        activityType: 'wake up',
        comment: 'Patient woke up at 6:30 AM and appeared alert.',
        activityTimestamp: new Date('2024-06-05T06:30:00Z')
      },
      {
        patient: patient1._id,
        nurse: nurse1._id,
        activityType: 'meal',
        comment: 'Had a light breakfast: toast and tea.',
        activityTimestamp: new Date('2024-06-05T07:30:00Z')
      },
      {
        patient: patient2._id,
        nurse: nurse2._id,
        activityType: 'reading',
        comment: 'Read a magazine for 20 minutes.',
        activityTimestamp: new Date('2024-06-05T10:00:00Z')
      },
      {
        patient: patient2._id,
        nurse: nurse1._id,
        activityType: 'meditation',
        comment: 'Guided breathing exercise for 15 minutes.',
        activityTimestamp: new Date('2024-06-05T11:00:00Z')
      }
    ]);

    console.log('✅ Seed data inserted successfully');
  } catch (err) {
    console.error('❌ Error seeding data:', err);
  }
}

module.exports = seedData;
