const mongoose = require('mongoose');

const LabTestRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  nurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
  pharmaciest: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacist', required: true },
  caretaker: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker', required: true },
  tests: { //required: false, because not all are necessary for the same patient or at the same time  
    oxygenSaturation: { type: Number, required: false},    
    potassium: { type: Number, required: false}, // plasma potassium level
    sodium: { type: Number, required: false}, // plasma sodium level
    calcium: { type: Number, required: false}, //plasma calcium level
    calcidiol: { type: Number, required: false}, // 25-Hydroxyvitami D. Level of stored Vitamin D
    calcitriol: { type: Number, required: false}, //The active form of Vitamin D in the blood stream
    parathyroidHormone: { type: Number, required: false}, // Level of PTH is indicative of Vitamin D deficiency
    bicarbonate: { type: Number, required: false}, //plasma bicarbonate level
    hdlc: { type: Number, required: false}, //High density lipoprotein cholesterol
    ldlc: { type: Number, required: false}, //Low density lipoprotein cholesterol
    totalChol: { type: Number, required: false}, //Total cholelsterol in the blood
    triglycerides: { type: Number, required: false}, //Trigluyceride level
    postprandialBSL: { type: Number, required: false}, //Blood sugar level 2 horus after a meal
    fastingBSL: { type: Number, required: false}, // Blood sugar level while fasting, usually first thing in the morning. 
    ejectionFraction: { type: Number, required: false}, 
    strokeVolume: { type: Number, required: false},
    b12: { type: Number, required: false}, // Vitamin B12 level
    serumIron: { type: Number, required: false}, //plasma iron level
    transferrin: { type: Number, required: false}, // plasma level of iron binding protein
    ferritin: { type: Number, required: false}, // liver stores of iron
    tansferrinSaturation: { type: Number, required: false}, //percentage of transferrin currently carrying iron
    creatinineClearance: { type: Number, required: false}, // the rate creatinine filtration by the kidneys
    eGFR: { type: Number, required: false}, //estimated glomerular filtration rate 
    alt: { type: Number, required: false}, // Alanine aminotransferase - liver enzyme correlating to liver function and damage
    ast: { type: Number, required: false}, // Aspartate aminotransferase - liver enzyme correlating to liver function and damage
    ggt: { type: Number, required: false}, //Gamma-Glutamyl Transferase - liver enzyme correlating to liver function and damage
    bilirubin: { type: Number, required: false}, //Associated with liver function and/or haemolytic anaemia.
    t4: { type: Number, required: false}, //Thyroxine level also known as tetraiodothyronine
    t3: { type: Number, required: false}, //Triiodothyronine level
    tsh: { type: Number, required: false}, //Thyroid stimulating hormone
    crp: { type: Number, required: false}, //C-reactive protein. A sign of inflammation
    esr: { type: Number, required: false}, //Erythrocyte sedimentation rate. A sign of inflammation
    microbialCulture: {type: String, require: false}, // Microbe identified. Bacteria, Virus, Fungus etc.
    microbialSensitivity: {type: String, required: false}, // Which antiinfective at what plasma level is effective against the micro
    microbialResistance: {type: String, required: false} // which antiinfectives is the Microbe resistant too. Ineffective!
  },
  notes: { type: String }, // Notes from the nurse, pharmacist or caretaker
  created_at: { type: Date, default: Date.now }
});

const LabTestRecord = mongoose.model('LabTestRecord', LabTestRecordSchema);

module.exports = LabTestRecord;
