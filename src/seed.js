require('dotenv').config();
const { connectDB, mongoose } = require('./config/db');

const seedRoles = require('./seedRoles');
const seedData = require('./seedData');
const seedStaffData = require('./seedStaffData');
const seedDoctorData = require('./seedDoctorData');

// Standalone seeding entry point.
//
// This intentionally does NOT run automatically when the server boots —
// on Vercel, "boot" happens on every cold start, and seeding is not safe
// or necessary to repeat on every cold start. Run this manually instead:
//
//   npm run seed              (local, uses MONGODB_URI from .env)
//   vercel env pull && npm run seed   (to seed against a deployed DB)
//
const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();

    console.log('Seeding roles...');
    await seedRoles();

    console.log('Seeding core data (users, patients, entry reports)...');
    await seedData();

    console.log('Seeding staff data...');
    await seedStaffData();

    console.log('Seeding doctor data...');
    await seedDoctorData();

    console.log('✅ All seeding complete.');
    process.exitCode = 0;
  } catch (err) {
    console.error('❌ Seeding failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();
