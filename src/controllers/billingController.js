const Billing = require('../models/billing');
const MedicalRecord = require('../models/MedicalRecord');
const Payment = require('../models/payment');
const mongoose = require('mongoose');


async function getVisitDuration(medicalRecordId) {
  if (!medicalRecordId) return undefined;
  const record = await MedicalRecord.findById(medicalRecordId);
  return record ? record.totalConsultationTime : undefined;
}

exports.createBilling = async (req, res) => {
  try {
    const {
      patientId,
      service_rendered,
      description,
      payee_name,
      payer_name,
      workcover_membership_no,
      workcover_reimbursement_rate,
      amount_owed,
      payment_status,
      medicare_rebate,
      invoice_date,
      invoice_no,
      locationId,
      providerId,
      medicalRecordId,
      service_date,
      bill_to,
      billing_schedule,
      medicare_item_no,
      amount,
      gst,
      notes_from_provider,
      notes,
      not_normal_aftercare,
      restriction_codes,
      payment_pending
    } = req.body;

    const visit_duration = await getVisitDuration(medicalRecordId);

    const billing = new Billing({
      patient: patientId,
      service_rendered,
      description,
      payee_name,
      payer_name,
      workcover_membership_no,
      workcover_reimbursement_rate,
      amount_owed,
      payment_status: payment_status || 'sent',
      medicare_rebate,
      invoice_date,
      invoice_no,
      location: locationId,
      provider: providerId,
      medical_record: medicalRecordId,
      service_date,
      bill_to,
      billing_schedule,
      medicare_item_no,
      amount,
      gst,
      visit_duration,
      notes_from_provider,
      notes,
      not_normal_aftercare,
      restriction_codes,
      payment_pending
    });

    await billing.save();
    res.status(201).json(billing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getBillingById = async (req, res) => {
  try {
    const billing = await Billing.findById(req.params.id);
    if (!billing) return res.status(404).json({ message: 'Billing record not found' });
    res.status(200).json(billing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getAllBillings = async (req, res) => {
  try {
    const billings = await Billing.find();
    res.status(200).json(billings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateBilling = async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: Date.now() };

    if (req.body.patientId) updates.patient = req.body.patientId;
    if (req.body.locationId) updates.location = req.body.locationId;
    if (req.body.providerId) updates.provider = req.body.providerId;
    if (req.body.medicalRecordId) {
      updates.medical_record = req.body.medicalRecordId;
      updates.visit_duration = await getVisitDuration(req.body.medicalRecordId);
    }

    const billing = await Billing.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!billing) return res.status(404).json({ message: 'Billing record not found' });
    res.status(200).json(billing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteBilling = async (req, res) => {
  try {
    const billing = await Billing.findByIdAndDelete(req.params.id);
    if (!billing) return res.status(404).json({ message: 'Billing record not found' });
    res.status(200).json({ message: 'Billing record deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body || {};

    // Validate billing ID
    if (!mongoose.isObjectIdOrHexString(id)) {return res.status(400).json({message: 'Invalid billing ID'});}

    // Validate payment amount
    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount - Math.round(amount * 100) / 100) >= 1e-9
    ) {return res.status(400).json({message: 'Payment amount must be a positive number with at most two decimal places'});}

    // Find the billing record
    const billing = await Billing.findById(id);
    if (!billing) {return res.status(404).json({message: 'Billing record not found'});}

    // Prevent payment of an already paid invoice
    if (billing.payment_status === 'paid') {return res.status(409).json({message: 'This invoice has already been paid'});}

    // Convert values to cents for comparison
    const paymentCents = Math.round(amount * 100);
    const totalCents = Math.round(billing.total * 100);

    // Only allow full payments
    if (paymentCents !== totalCents) {return res.status(400).json({message: 'Payment amount must equal the full invoice total'});}

    // TODO: Check the user's permission to record a payment.

    // Create payment record.
    // user ID should be extracted from the verified token in the request header.
    const payment = await Payment.create({billing: billing._id,amount: amount,recorded_by: userId});
    // Update billing payment status.
    billing.payment_status = 'paid';
    billing.payment_pending = false;
    billing.updated_at = Date.now();
    await billing.save();

    return res.status(201).json({message: 'Payment recorded successfully', payment, billing});

  } catch (error) {
    console.error('Error recording payment:', error);

    return res.status(500).json({message: 'Internal server error'});
  }
};
