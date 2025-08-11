require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');
const User = require('../src/models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);

    const count = await Patient.countDocuments();
    if (count > 0) {
      console.log('ℹ️ Patients already exist. Skipping sample seed.');
      await mongoose.disconnect();
      process.exit(0);
    }

    const caretaker = await User.findOne().where('role.name').equals('caretaker');
    const nurse = await User.findOne().where('role.name').equals('nurse');

    if (!caretaker || !nurse) {
      console.error('❌ Seed requires at least one caretaker and one nurse user.');
      process.exit(1);
    }

    await Patient.create({
      fullname: 'Seeded Patient',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'male',
      caretaker: caretaker._id,
      assignedNurses: [nurse._id]
    });

    console.log('✅ Seeded one valid patient.');
    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
