const Billing = require('../models/billing');
const MedicalRecord = require('../models/MedicalRecord');

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
