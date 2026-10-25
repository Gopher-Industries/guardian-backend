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
  medical_record: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRecord' },
  service_date: { type: Date },
  bill_to: {
    type: String,
    enum: ['Patient', 'head of family', 'Medicare', 'DVA', 'health Insurance', 'other']
  },
  billing_schedule: { type: String }, // free text, e.g. "1st of each month"
  medicare_item_no: { type: Number },
  amount: { type: Number },
  gst: { type: Number },
  total: { type: Number }, // auto-calculated: amount_owed + gst (see hooks below)
  visit_duration: { type: Number }, // minutes — pulled from the linked Medical Record
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

// Total always equals amount_owed + GST, on create and on save().
BillingSchema.pre('save', function (next) {
  this.total = (this.amount_owed || 0) + (this.gst || 0);
  next();
});

// Same rule, but for findByIdAndUpdate (which skips the 'save' hook above).
BillingSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  const existing = await this.model.findOne(this.getQuery());
  const amount_owed = update.amount_owed !== undefined ? update.amount_owed : (existing ? existing.amount_owed : 0);
  const gst = update.gst !== undefined ? update.gst : (existing ? existing.gst : 0);
  update.total = (amount_owed || 0) + (gst || 0);
  next();
});

const Billing = mongoose.model('Billing', BillingSchema);

module.exports = Billing;
