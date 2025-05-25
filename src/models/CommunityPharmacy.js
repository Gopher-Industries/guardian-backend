const mongoose = require('mongoose');
const Text = require('./embedded/TextSchema');
const Phone = require('./embedded/PhoneSchema');
const Address = require('./embedded/AddressSchema');
const Email = require('./embedded/EmailSchema');
const RevisionSchema = require('./embedded/RevisionSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');

const communityPharmacySchema = new mongoose.Schema({
  name: { type: Text, required: true },
  phone: { type: Phone },
  faxNumber: {type: Phone},
  address: { type: Address },
  email: { type: Email },
  isComplete: { type: Boolean, default: false },
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema]
}, {
    timestamps: true  // adds `createdAt` and `updatedAt` automatically
});

module.exports = mongoose.model('CommunityPharmacy', communityPharmacySchema);
