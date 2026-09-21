/**
 * PatientSelfRegistration model.
 *
 * Backs the (optional) self-registration route in
 * routes/patientSelfRegistration.js. Passwords are hashed on save so the
 * route's bcrypt.compare(...) login check works. This route is not mounted by
 * default; wire it into server.js if you want to use it.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PatientSelfRegistrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number },
    contact: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }
  },
  { timestamps: true, collection: 'patient_self_registrations' }
);

// Hash the password whenever it is set or changed.
PatientSelfRegistrationSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports =
  mongoose.models.PatientSelfRegistration ||
  mongoose.model('PatientSelfRegistration', PatientSelfRegistrationSchema);
