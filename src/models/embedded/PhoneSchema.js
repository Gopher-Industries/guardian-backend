const mongoose = require('mongoose');

const PhoneSchema = new mongoose.Schema({
  number: {
    type: String,
    match: [/^[+]?[(]?[0-9]{1,4}[)]?[-\\s./0-9]*$/, 'Invalid phone number']
  },
  type: { type: String, enum: ['mobile', 'landline', 'fax'], default: 'mobile' },
  verified: { type: Boolean, default: false }
}, { _id: false });

module.exports = PhoneSchema;