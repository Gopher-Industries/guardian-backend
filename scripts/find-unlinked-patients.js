// scripts/find-unlinked-patients.js
require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);

    const orphans = await Patient.find({
      $and: [
        { $or: [{ caretaker: { $exists: false } }, { caretaker: null }] },
        { $or: [{ assignedNurses: { $exists: false } }, { assignedNurses: { $size: 0 } }] }
      ]
    }).select('fullname');

    if (orphans.length === 0) {
      console.log('✅ No orphan patients found.');
    } else {
      console.log('⚠️ Orphan patients found:', orphans);
    }

    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
