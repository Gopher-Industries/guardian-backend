function buildReviewerSignature(user) {
  validateReviewerRole(user.role, ['nurse', 'pharmacist']);

  return {
    id: user._id,
    name: user.name,
    signedAt: new Date(),
    signedByModel: capitalize(user.role)
  };
}

function buildNurseSignature(user) {
  validateReviewerRole(user.role, ['nurse']);

  return {
    id: user._id,
    name: user.name,
    signedAt: new Date()
  };
}

function buildPharmacistSignature(user) {
  validateReviewerRole(user.role, ['pharmacist']);

  return {
    id: user._id,
    name: user.name,
    signedAt: new Date()
  };
}

function validateReviewerRole(actualRole, allowedRoles) {
  if (!allowedRoles.includes(actualRole)) {
    throw new Error(`Only [${allowedRoles.join(', ')}] may perform this action. Found: ${actualRole}`);
  }
}

// Utility: Capitalize role for 'signedByModel' (e.g., 'pharmacist' -> 'Pharmacist')
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  buildReviewerSignature,
  buildNurseSignature,
  buildPharmacistSignature,
  validateReviewerRole
};
