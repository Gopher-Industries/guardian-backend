const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Nurse = require('../src/models/Nurse');
const Patient = require('../src/models/Patient');
const NurseObservation = require('../src/models/NurseObservation');

dotenv.config();
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

(async () => {
  try {
    const nurseEmail = 'seednurse@example.com';

    // Clean up existing
    await Nurse.deleteOne({ email: nurseEmail });
    await NurseObservation.deleteMany({});

    const nurse = new Nurse({
      name: 'Seed Nurse',
      email: nurseEmail,
      password: 'SeedPassword123',
      isApproved: true
    });
    await nurse.save();

    const patient = await Patient.findOne(); // Use existing patient

    if (!patient) throw new Error('Patient not found for nurse observation.');

    const observation = new NurseObservation({
      patient: patient._id,
      nurse: nurse._id,
      observations: [{
        temperature: 37.2,
        bloodPressure: { systolic: 120, diastolic: 80 },
        heartRate: 76,
        respiratoryRate: 16,
        oxygenSaturation: 98,
        mobility: 'Independent',
        glascowComaScale: 15,
        dysphagia: 'None',
        iddsi: 0,
        painScore: 2
      }],
      notes: 'Patient stable.'
    });

    await observation.save();

    console.log('✅ Nurse + Observation seeded.');
    console.log('Nurse ID:', nurse._id.toString());
    console.log('Observation ID:', observation._id.toString());

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
})();