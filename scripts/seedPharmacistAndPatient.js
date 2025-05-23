const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Pharmacist = require('../src/models/Pharmacist');
const Patient = require('../src/models/Patient');

dotenv.config();
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

(async () => {
  try {
    const email = 'seedpharmacist@example.com';

    // Clear existing data
    await Pharmacist.deleteOne({ email });
    await Patient.deleteMany({});

    // Create pharmacist
    const pharmacist = new Pharmacist({
      name: 'Seed Pharmacist',
      email,
      password: 'SeedPassword123',
      isApproved: true
    });
    await pharmacist.save();

    // Create patient and assign
    const patient = new Patient({
      name: 'Seed Patient',
      age: 75,
      gender: 'Female',
      assignedPharmacist: pharmacist._id
    });
    await patient.save();

    // Link patient to pharmacist
    pharmacist.assignedPatients = [patient._id];
    await pharmacist.save();

    console.log('✅ Seeding complete.');
    console.log('Pharmacist ID:', pharmacist._id.toString());
    console.log('Patient ID:', patient._id.toString());

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
})();