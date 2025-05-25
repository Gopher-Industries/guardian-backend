
const Nurse = require('../models/Nurse');
const Pharmacist = require('../models/Pharmacist');
const { buildAuditSignature } = require('./signatureService');

async function updateOwnProfile(user, updates) {
  let model;
  if (user.role === 'nurse') {
    model = await Nurse.findById(user._id);
  } else if (user.role === 'pharmacist') {
    model = await Pharmacist.findById(user._id);
  } else {
    throw new Error('Unauthorized role for profile update');
  }

  if (!model) throw new Error('User profile not found');

  model.set(updates);

  const signature = buildAuditSignature(user);

  model.revisionHistory = model.revisionHistory || [];
  model.revisionHistory.push({
    updatedBy: {
      id: signature.id,
      name: signature.name,
      role: signature.role
    },
    updatedAt: signature.signedAt,
    fieldsChanged: Object.keys(updates),
    previousValues: {}
  });

  await model.save();
  return model;
}

module.exports = {
  updateOwnProfile
};
