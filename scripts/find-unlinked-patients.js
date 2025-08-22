// Script to identify patients without linked caregivers
// Usage: node find-unlinked-patients.js

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');

mongoose.set('strictQuery', false);

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not found in environment variables');
    console.log(
      'Make sure you have a .env file with MONGODB_URI=your_connection_string'
    );
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database');

    const totalPatients = await Patient.countDocuments();
    console.log(`Total patients in database: ${totalPatients}`);

    // Find patients with no caretaker or caretaker set to null
    const orphanPatients = await Patient.find({
      $or: [{ caretaker: { $exists: false } }, { caretaker: null }],
    });

    if (orphanPatients.length === 0) {
      console.log('All patients have linked caregivers.');
    } else {
      console.log(
        `Found ${orphanPatients.length} patients without linked caregivers:`
      );
      orphanPatients.forEach((p) => {
        console.log(`- ${p.fullname} (ID: ${p._id})`);
      });
    }
  } catch (error) {
    console.error('Database connection failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  mongoose.disconnect();
});
