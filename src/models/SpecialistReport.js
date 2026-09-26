const mongoose = require('mongoose');

const SpecialistReportSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

   specialistClinic: {
    specialistName: { type: String, required: true },
    clinicName: { type: String },
    speciality: { type: String, required: true },
    providerNumber: { type: String },
    address: { type: String },
    phone: { type: String },
    email: { type: String }
  },

  referringDoctor: {
    fullName: { type: String, required: true },
    clinicName: { type: String },
    providerNumber: { type: String },
    address: { type: String },
    phone: { type: String },
    email: { type: String }
  },

   patient: {
    fullName: { type: String, required: true },
    dob: { type: Date, required: true },
    medicareNumber: { type: String },
    address: { type: String },
    contactNumber: { type: String },
    email: { type: String }
  },
  reasonForReferral: { type: String },

  consultation: {
    date: { type: Date, required: true },
    history: { type: String },
    currentMedications: { type: String },
    allergies: { type: String }
  },

  examination: {
    examinationsPerformed: { type: String },
    findings: { type: String },
    testResults: { type: String },
    diagnosis: { type: String }
  },

  managementPlan: {
    recommendedTreatment: { type: String },
    furtherInvestigations: { type: String },
    plannedFollowUp: { type: String },
    dischargeOrOngoingCare: { type: String }
  },

  actionItemsForGP: {
    actionsRequired: { type: String },
    sharedCareChanges: { type: String }
  },

  urgency: {
    type: String,
    enum: ['routine', 'urgent'],
    default: 'routine'
  },
  status: {
    type: String,
    enum: ['draft', 'finalised', 'sent to GP'],
    default: 'draft'
  },
  reportDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SpecialistReport', SpecialistReportSchema);
