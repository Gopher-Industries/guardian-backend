require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');
const User = require('../src/models/User');
const Role = require('../src/models/Role');

mongoose.set('strictQuery', false);

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Clear existing data to fix any broken state
    await Patient.deleteMany({});
    await User.deleteMany({});
    await Role.deleteMany({});
    console.log('🧹 Cleared existing data');

    // Create roles if they don't exist
    let caretakerRole = await Role.findOne({ name: 'caretaker' });
    if (!caretakerRole) {
      caretakerRole = await Role.create({ name: 'caretaker' });
    }
    
    let nurseRole = await Role.findOne({ name: 'nurse' });
    if (!nurseRole) {
      nurseRole = await Role.create({ name: 'nurse' });
    }

    // Create users if they don't exist
    let caretaker = await User.findOne({ role: caretakerRole._id });
    if (!caretaker) {
      caretaker = await User.create({
        fullname: 'Test Caretaker',
        email: 'caretaker@test.com',
        password_hash: 'password123',
        role: caretakerRole._id
      });
    }

    let nurse = await User.findOne({ role: nurseRole._id });
    if (!nurse) {
      nurse = await User.create({
        fullname: 'Test Nurse',
        email: 'nurse@test.com',
        password_hash: 'password123',
        role: nurseRole._id
      });
    }

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

    console.log('✅ Seeded roles, users, and one valid patient.');
    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
