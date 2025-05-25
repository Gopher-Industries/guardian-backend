
const Caretaker = require('../models/Caretaker');
const { buildAuditSignature } = require('./signatureService');

async function updateOwnCaretakerProfile(user, updates) {
  if (user.role !== 'caretaker') {
    throw new Error('Unauthorized: only caretakers can update their own profile');
  }

  const caretaker = await Caretaker.findById(user._id);
  if (!caretaker) {
    throw new Error('Caretaker profile not found');
  }

  caretaker.set(updates);

  const signature = buildAuditSignature(user);

  caretaker.revisionHistory = caretaker.revisionHistory || [];
  caretaker.revisionHistory.push({
    updatedBy: {
      id: signature.id,
      name: signature.name,
      role: signature.role
    },
    updatedAt: signature.signedAt,
    fieldsChanged: Object.keys(updates),
    previousValues: {}
  });

  await caretaker.save();
  return caretaker;
}

module.exports = {
  updateOwnCaretakerProfile
};
