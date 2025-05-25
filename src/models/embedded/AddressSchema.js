const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  street: String,
  suburb: String,
  state: String,
  postcode: String,
  country: { type: String, default: 'Australia' }
}, { _id: false });

module.exports = AddressSchema;