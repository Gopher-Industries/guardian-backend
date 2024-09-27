const mongoose = require('mongoose');

const UserRoleSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role_name: { type: String, required: true }
});

const UserRole = mongoose.model('UserRole', UserRoleSchema);

module.exports = UserRole;