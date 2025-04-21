const mongoose = require('mongoose');

const MedicationRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
  pharmacist: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacist', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker', required: true },
  medication: {
    allergies: { type: String, required: true }, //Immunoreactions to medications and other substances
    drugName: { type: String, required: true }, // Drug name, Do NOT use BRAND name
    dose: { type: Number, required: true }, // Dose per administration
    frequency: { type: String, required: true }, //How often the dose is taken.given
    duration: { type: String, required: true }, // Is the medication temporary or ongiong
    indication: { type: String, required: true }, //What is this medication used for
    pharmacist: {type: String, required: false} // Pharmacist signature to indicate a pharmacist check
  },
  notes: { type: String }, // Notes from the nurse, pharmacist or caretaker
  created_at: { type: Date, default: Date.now }
});

const MedicationRecord = mongoose.model('MedicationRecord', MedicationRecordSchema);

module.exports = MedicationRecord;
