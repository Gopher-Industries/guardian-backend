const Billing = require('../models/billing');

// CREATE
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
      medicare_rebate
    } = req.body;

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
      medicare_rebate
    });

    await billing.save();
    res.status(201).json(billing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// READ - single record
exports.getBillingById = async (req, res) => {
  try {
    const billing = await Billing.findById(req.params.id);
    if (!billing) {
      return res.status(404).json({ message: 'Billing record not found' });
    }
    res.status(200).json(billing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// READ - all records
exports.getAllBillings = async (req, res) => {
  try {
    const billings = await Billing.find();
    res.status(200).json(billings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE
exports.updateBilling = async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: Date.now() };

    // map the *Id-style fields onto their schema reference names, if present
    if (req.body.patientId) updates.patient = req.body.patientId;
    if (req.body.locationId) updates.location = req.body.locationId;
    if (req.body.providerId) updates.provider = req.body.providerId;

    const billing = await Billing.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!billing) {
      return res.status(404).json({ message: 'Billing record not found' });
    }
    res.status(200).json(billing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE
exports.deleteBilling = async (req, res) => {
  try {
    const billing = await Billing.findByIdAndDelete(req.params.id);
    if (!billing) {
      return res.status(404).json({ message: 'Billing record not found' });
    }
    res.status(200).json({ message: 'Billing record deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
