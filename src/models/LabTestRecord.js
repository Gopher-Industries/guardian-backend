const mongoose = require('mongoose');
const Number = require('./embedded/NumericSchema');
const Text = require('./embedded/TextSchema');
const ReviewerSignatureSchema = require('./embedded/ReviewerSignature');
const RevisionSchema = require('./embedded/RevisionSchema');

const LabTestRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse'},
  pharmacist: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacist'},
  tests: {
    oxygenSaturation: { type: Number, },
    potassium: { type: Number },
    sodium: { type: Number },
    calcium: { type: Number },
    calcidiol: { type: Number },
    calcitriol: { type: Number },
    parathyroidHormone: { type: Number },
    bicarbonate: { type: Number },
    hdlc: { type: Number },
    ldlc: { type: Number },
    totalChol: { type: Number },
    triglycerides: { type: Number },
    postprandialBSL: { type: Number },
    fastingBSL: { type: Number },
    ejectionFraction: { type: Number },
    strokeVolume: { type: Number },
    b12: { type: Number },
    serumIron: { type: Number },
    transferrin: { type: Number },
    ferritin: { type: Number },
    tansferrinSaturation: { type: Number },
    creatinineClearance: { type: Number },
    eGFR: { type: Number },
    alt: { type: Number },
    ast: { type: Number },
    ggt: { type: Number },
    bilirubin: { type: Number },
    t4: { type: Number },
    t3: { type: Number },
    tsh: { type: Number },
    crp: { type: Number },
    esr: { type: Number },
    microbialCulture: { type: Text },
    microbialSensitivity: { type:  Text },
    microbialResistance: { type:  Text }
  },
  notes: { type: Text },
  signedBy: { type: ReviewerSignatureSchema, required: true, immutable: true },
  revisionHistory: [RevisionSchema]
}, { timestamps: true });

module.exports = mongoose.model('LabTestRecord', LabTestRecordSchema);