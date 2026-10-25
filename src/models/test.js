const mongoose = require('mongoose');

const TestSchema = new mongoose.Schema({
  test_var_1: { type: String, required: true },
  test_var_2: { type: String, required: true },
});

const Test = mongoose.model('Test', TestSchema);

module.exports = Test;