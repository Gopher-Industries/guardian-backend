const mongoose = require('mongoose');
const ManagementPlan = require('../models/ManagementPlan');
const CarePlan = require('../models/CarePlan');

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

// Current date, drawn from the server's clock, in YYYY-MM-DD form.
function todayDateStamp() {
  return new Date().toISOString().split('T')[0];
}

exports.createManagementPlan = async (req, res) => {
  try {
    const { carePlanId, diagnosis, management = '' } = req.body || {};

    if (!carePlanId || !isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }
    if (!diagnosis || typeof diagnosis !== 'string' || !diagnosis.trim()) {
      return res.status(400).json({ message: 'diagnosis is required' });
    }
    if (management !== undefined && typeof management !== 'string') {
      return res.status(400).json({ message: 'management must be a string' });
    }

    const carePlan = await CarePlan.findById(carePlanId);
    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

    const plan = await ManagementPlan.create({
      care_plan: carePlanId,
      diagnosis: diagnosis.trim(),
      management,
      changes_logged: [`${todayDateStamp()}: Management plan created`]
    });

    return res.status(201).json({ message: 'Management plan created', managementPlan: plan });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A management plan already exists for this diagnosis' });
    }
    return res.status(500).json({ message: 'Error creating management plan', details: error.message });
  }
};

exports.getManagementPlanById = async (req, res) => {
  try {
    const { managementPlanId } = req.params;
    if (!isValidObjectId(managementPlanId)) {
      return res.status(400).json({ message: 'managementPlanId must be a valid ID' });
    }

    const plan = await ManagementPlan.findById(managementPlanId)
      .populate('care_plan', 'title patient diagnosis');
    if (!plan) return res.status(404).json({ message: 'Management plan not found' });

    return res.status(200).json({ managementPlan: plan });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching management plan', details: error.message });
  }
};

exports.getManagementPlansByCarePlan = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    if (!isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }

    const plans = await ManagementPlan.find({ care_plan: carePlanId }).sort({ created_at: -1 });
    return res.status(200).json({ managementPlans: plans });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching management plans', details: error.message });
  }
};

exports.getManagementPlanByDiagnosis = async (req, res) => {
  try {
    const { diagnosis } = req.params;
    const plan = await ManagementPlan.findOne({ diagnosis });
    if (!plan) return res.status(404).json({ message: 'No management plan exists for this diagnosis' });
    return res.status(200).json({ managementPlan: plan });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching management plan', details: error.message });
  }
};

exports.updateManagementPlan = async (req, res) => {
  try {
    const { managementPlanId } = req.params;
    const { diagnosis, management, changeLog } = req.body || {};

    if (!isValidObjectId(managementPlanId)) {
      return res.status(400).json({ message: 'managementPlanId must be a valid ID' });
    }
    if (!changeLog || typeof changeLog !== 'string' || !changeLog.trim()) {
      return res.status(400).json({ message: 'changeLog is required to describe this edit' });
    }

    const plan = await ManagementPlan.findById(managementPlanId);
    if (!plan) return res.status(404).json({ message: 'Management plan not found' });

    if (diagnosis !== undefined) {
      if (typeof diagnosis !== 'string' || !diagnosis.trim()) {
        return res.status(400).json({ message: 'diagnosis must be a non-empty string' });
      }
      plan.diagnosis = diagnosis.trim();
    }

    if (management !== undefined) {
      if (typeof management !== 'string') {
        return res.status(400).json({ message: 'management must be a string' });
      }
      plan.management = management;
    }

    // Every edit requires a log entry. The current date, drawn from the
    // server's clock, is prepended automatically -- callers only supply
    // the description of what changed.
    plan.changes_logged.push(`${todayDateStamp()}: ${changeLog.trim()}`);

    await plan.save();

    return res.status(200).json({ message: 'Management plan updated', managementPlan: plan });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A management plan already exists for this diagnosis' });
    }
    return res.status(500).json({ message: 'Error updating management plan', details: error.message });
  }
};