require('dotenv').config();
const mongoose = require('mongoose');

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
// It connects to MongoDB directly rather than requiring ./config/db, because
// requiring that module starts its own connection and seeding as a side effect.
const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set. Add it to .env or the environment.');
    process.exitCode = 1;
    return;
  }

  try {
    console.log('Connecting to MongoDB...');
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri);

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
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
};

run();