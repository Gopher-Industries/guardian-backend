const mongoose = require('mongoose');

const BillingSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  service_rendered: { type: String, required: true },
  description: { type: String },
  payee_name: { type: String, required: true },
  payer_name: { type: String, required: true },
  workcover_membership_no: { type: String },
  workcover_reimbursement_rate: { type: Number },
  amount_owed: { type: Number, required: true },
  payment_status: {
    type: String,
    enum: ['sent', 'received', 'paid', 'rejected'],
    required: true
  },
  medicare_rebate: { type: Number },

  invoice_date: { type: Date },
  invoice_no: { type: Number },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  service_date: { type: Date },
  bill_to: {
    type: String,
    enum: ['Patient', 'head of family', 'Medicare', 'DVA', 'health Insurance', 'other']
  },
  billing_schedule: {
    type: String,
    enum: ['Practice Fee', 'Concession fee', 'Rebate only', 'Work Cover', 'TAC']
  },
  medicare_item_no: { type: Number },
  amount: { type: Number },
  gst: { type: Number },
  total: { type: Number },
  visit_duration: { type: String },
  notes_from_provider: { type: String },
  notes: { type: String },
  not_normal_aftercare: { type: Boolean },
  restriction_codes: {
    type: String,
    enum: ['not related', 'not for comparison', 'separate site']
  },
  payment_pending: { type: Boolean },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const Billing = mongoose.model('Billing', BillingSchema);

module.exports = Billing;
