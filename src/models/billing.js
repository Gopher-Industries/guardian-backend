const mongoose = require("mongoose");

const BillingSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },
  service_rendered: { type: String, required: true },
  description: { type: String },
  payee_name: { type: String, required: true },
  payer_name: { type: String, required: true },
  workcover_membership_no: { type: String },
  workcover_reimbursement_rate: { type: Number },
  amount_owed: { type: Number, required: true },
  payment_status: {
    type: String,
    enum: ["sent", "received", "paid", "rejected"],
    required: true,
  },
  medicare_rebate: { type: Number },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const Billing = mongoose.model("Billing", BillingSchema);

module.exports = Billing;
