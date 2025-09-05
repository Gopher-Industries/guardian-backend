require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Patient = require('../src/models/Patient');
const User = require('../src/models/User');
const Role = require('../src/models/Role');

mongoose.set('strictQuery', false);

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    const patients = await Patient.find({})
      .populate({
        path: 'caretaker',
        select: 'fullname role',
        populate: { path: 'role', select: 'name' },
      })
      .populate({
        path: 'assignedNurses',
        select: 'fullname role',
        populate: { path: 'role', select: 'name' },
      });

    console.log('\n=== Patient Care Validation Report ===');
    console.log(`Total patients in database: ${patients.length}`);

    const issues = {
      noCaregivers: [],
      noCaretaker: [],
      noNurses: [],
      invalidCaretakers: [],
      invalidNurses: [],
    };

    patients.forEach((patient) => {
      if (!patient.caretaker) issues.noCaretaker.push(patient);
      if (!patient.assignedNurses?.length) issues.noNurses.push(patient);
      if (!patient.caretaker && !patient.assignedNurses?.length)
        issues.noCaregivers.push(patient);

      if (patient.caretaker?.role?.name !== 'caretaker') {
        issues.invalidCaretakers.push(patient);
      }

      if (
        patient.assignedNurses?.some((nurse) => nurse.role?.name !== 'nurse')
      ) {
        issues.invalidNurses.push(patient);
      }
    });

    const totalIssues = Object.values(issues).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    if (totalIssues > 0) {
      console.log('\nIssues Found:');

      if (issues.noCaregivers.length) {
        console.log(
          `   CRITICAL: ${issues.noCaregivers.length} patients with NO caregivers`
        );
        issues.noCaregivers.forEach((p) =>
          console.log(`      - ${p.fullname} (ID: ${p._id})`)
        );
      }

      if (issues.noCaretaker.length) {
        console.log(
          `   WARNING: ${issues.noCaretaker.length} patients without caretakers`
        );
        issues.noCaretaker.forEach((p) =>
          console.log(`      - ${p.fullname} (ID: ${p._id})`)
        );
      }

      if (issues.noNurses.length) {
        console.log(
          `   WARNING: ${issues.noNurses.length} patients without nurses`
        );
        issues.noNurses.forEach((p) =>
          console.log(`      - ${p.fullname} (ID: ${p._id})`)
        );
      }

      if (issues.invalidCaretakers.length) {
        console.log(
          `   ERROR: ${issues.invalidCaretakers.length} patients with invalid caretaker roles`
        );
      }

      if (issues.invalidNurses.length) {
        console.log(
          `   ERROR: ${issues.invalidNurses.length} patients with invalid nurse assignments`
        );
      }
    } else {
      console.log('\nIssues Found: None');
    }

    console.log('\nSummary:');
    if (totalIssues === 0) {
      console.log('   SUCCESS: All patients have proper caregiver assignments');
    } else {
      console.log(`   TOTAL ISSUES: ${totalIssues}`);
      console.log(
        '   RECOMMENDATION: Run "node seed-database.js" to fix issues'
      );
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase disconnected');
  }
}

main();
