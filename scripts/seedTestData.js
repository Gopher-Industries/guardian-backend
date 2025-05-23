const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Nurse = require('../src/models/Nurse');
const Patient = require('../src/models/Patient');

const seedTestData = async () => {
  await mongoose.connect('mongodb://localhost:27017/guardian-test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  await Nurse.deleteMany({});
  await Patient.deleteMany({});

  const hashedPassword = await bcrypt.hash('Password123', 10);

  const nurse = new Nurse({
    name: 'Test Nurse',
    email: 'nurse@example.com',
    password: hashedPassword,
    ahpra: '1234567',
    role: 'nurse'
  });
  await nurse.save();

  const patient = new Patient({
    name: 'Test Patient',
    dateOfBirth: '1980-01-01',
    address: '123 Test Street'
  });
  await patient.save();

  console.log('Seed data inserted.');
  mongoose.connection.close();
};

seedTestData();
