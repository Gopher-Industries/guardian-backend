const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  nurses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  caretakers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  patients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

OrganizationSchema.pre('save', function(next){
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Organization', OrganizationSchema);
