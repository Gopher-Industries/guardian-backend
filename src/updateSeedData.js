'use strict';

const Patient = require('./models/Patient');

/**
 * Patches existing seed patients with the new profile fields.
 * Identified by fullname — only updates fields that are currently empty
 * so manually entered data is never overwritten.
 */
const updateSeedData = async () => {
  const patches = [
    {
      fullname: 'Elderly Patient One',
      fields: {
        dateOfAdmitting: new Date('2024-01-10'),
        description: 'Requires daily medication and light physiotherapy.',
        emergencyContactName: 'Margaret Smith',
        emergencyContactNumber: '+61412345678',
        nextOfKinName: 'Margaret Smith',
        nextOfKinRelationship: 'SPOUSE',
        medicalSummary: 'Managed hypertension with regular blood pressure monitoring. No known surgical history.',
        allergies: ['Penicillin'],
        conditions: ['Hypertension'],
        notes: 'Prefers morning visits. Responds well to routine.',
      },
    },
    {
      fullname: 'Elderly Patient Two',
      fields: {
        dateOfAdmitting: new Date('2024-03-18'),
        description: 'Diabetic patient requiring dietary supervision and insulin management.',
        emergencyContactName: 'David Lee',
        emergencyContactNumber: '+61498765432',
        nextOfKinName: 'David Lee',
        nextOfKinRelationship: 'CHILD',
        medicalSummary: 'Type 2 Diabetes diagnosed in 2015. Rheumatoid arthritis affecting both hands. On metformin and ibuprofen.',
        allergies: ['Sulfa drugs', 'Shellfish'],
        conditions: ['Type 2 Diabetes', 'Arthritis'],
        notes: 'Requires low-sugar diet. Arthritis flares in cold weather.',
      },
    },
  ];

  let updated = 0;

  for (const { fullname, fields } of patches) {
    const patient = await Patient.findOne({ fullname });

    if (!patient) {
      console.log(`⚠️  Patient "${fullname}" not found — skipping.`);
      continue;
    }

    // Only patch fields that are currently unset to avoid overwriting real data
    const delta = {};
    for (const [key, value] of Object.entries(fields)) {
      const current = patient[key];
      const isEmpty = current === undefined || current === null || current === '' ||
        (Array.isArray(current) && current.length === 0);
      if (isEmpty) delta[key] = value;
    }

    if (Object.keys(delta).length === 0) {
      console.log(`✅ "${fullname}" already up to date — nothing to patch.`);
      continue;
    }

    await Patient.updateOne({ _id: patient._id }, { $set: delta });
    console.log(`✅ "${fullname}" patched:`, Object.keys(delta).join(', '));
    updated++;
  }

  console.log(`🌱 Seed update complete. ${updated} patient(s) patched.`);
};

module.exports = updateSeedData;
