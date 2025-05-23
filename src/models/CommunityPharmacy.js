const mongoose = require('mongoose');

const communityPharmacySchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactNumber: { type: String },
  faxNumber: {type: String},
  address: { type: String },
  email: { type: String },
}, {
    timestamps: true  // adds `createdAt` and `updatedAt` automatically
});

module.exports = mongoose.model('CommunityPharmacy', communityPharmacySchema);
