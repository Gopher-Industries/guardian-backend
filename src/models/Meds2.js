const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Meds2Schema = new mongoose.Schema({
  Name_of_Medication: { type: String, required: true },
  Doses_sizes: { type: String, required: true },
  Company: { type: String, required: true },
  What_it_does: { type: String, required: true },
  Potential_Side_Effects: {type: String, required: false}, // Assigned patients
  Directions: { type: String, required: true }
  
  

  
});
// Create the User model from the schema
const Meds2 = mongoose.model('Meds2', Meds2Schema);
 
module.exports = Meds2;