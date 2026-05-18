const mongoose = require('mongoose');
const CarePlan = require('../models/CarePlan');
const Patient = require('../models/Patient');
const Task = require('../models/Task');
const { ensureUserWithRole } = require('../services/userService');

const POPULATE_OPTIONS = [
  { path: 'tasks' },
  { path: 'patient', select: 'fullname gender dateOfBirth' },
  { path: 'caretaker', select: 'fullname email' },
  { path: 'nurse', select: 'fullname email' }
];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function populateCarePlan(query) {
  POPULATE_OPTIONS.forEach(option => query.populate(option));
  return query;
}

async function validateTaskIds(taskIds, patientId) {
  if (!Array.isArray(taskIds)) {
    return { ok: false, message: 'tasks must be an array of task IDs' };
  }

  if (!taskIds.every(isValidObjectId)) {
    return { ok: false, message: 'tasks must contain valid task IDs' };
  }

  const matchingTasks = await Task.countDocuments({
    _id: { $in: taskIds },
    patient: patientId
  });

  if (matchingTasks !== taskIds.length) {
    return { ok: false, message: 'Every task must exist and belong to the selected patient' };
  }

  return { ok: true };
}

exports.createCarePlan = async (req, res) => {
  try {
    const { title, description = '', patientId, caretakerId, nurseId = null, tasks = [] } = req.body || {};

    if (!title || !patientId || !caretakerId) {
      return res.status(400).json({ message: 'title, patientId and caretakerId are required' });
    }

    if (![patientId, caretakerId, ...(nurseId ? [nurseId] : [])].every(isValidObjectId)) {
      return res.status(400).json({ message: 'patientId, caretakerId and nurseId must be valid IDs' });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const caretaker = await ensureUserWithRole(caretakerId, 'caretaker');
    if (!caretaker) return res.status(400).json({ message: 'caretakerId must reference a caretaker user' });

    let nurse = null;
    if (nurseId) {
      nurse = await ensureUserWithRole(nurseId, 'nurse');
      if (!nurse) return res.status(400).json({ message: 'nurseId must reference a nurse user' });
    }

    const taskValidation = await validateTaskIds(tasks, patientId);
    if (!taskValidation.ok) return res.status(400).json({ message: taskValidation.message });

    const existingActivePlan = await CarePlan.findOne({ patient: patientId, status: 'active' });
    if (existingActivePlan) {
      return res.status(409).json({
        message: 'An active care plan already exists for this patient',
        carePlanId: existingActivePlan._id
      });
    }

    const carePlan = await CarePlan.create({
      title,
      description,
      patient: patientId,
      caretaker: caretaker._id,
      nurse: nurse?._id || null,
      tasks,
      status: 'active'
    });

    const created = await populateCarePlan(CarePlan.findById(carePlan._id));
    return res.status(201).json({ message: 'Care plan created', carePlan: created });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An active care plan already exists for this patient' });
    }
    return res.status(500).json({ message: 'Error creating care plan', details: error.message });
  }
};

exports.getCarePlans = async (req, res) => {
  try {
    const { patientId, status, page = '1', limit = '20' } = req.query;
    const filter = {};

    if (patientId) {
      if (!isValidObjectId(patientId)) return res.status(400).json({ message: 'patientId must be a valid ID' });
      filter.patient = patientId;
    }

    if (status) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'status must be active or inactive' });
      }
      filter.status = status;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      populateCarePlan(
        CarePlan.find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limitNum)
      ),
      CarePlan.countDocuments(filter)
    ]);

    return res.status(200).json({
      items,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching care plans', details: error.message });
  }
};

exports.getCarePlanById = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    if (!isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }

    const carePlan = await populateCarePlan(CarePlan.findById(carePlanId));
    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

    return res.status(200).json({ carePlan });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching care plan', details: error.message });
  }
};

exports.updateCarePlan = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    const { title, description, caretakerId, nurseId, tasks, status } = req.body || {};

    if (!isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }

    const current = await CarePlan.findById(carePlanId);
    if (!current) return res.status(404).json({ message: 'Care plan not found' });

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    if (caretakerId !== undefined) {
      if (!isValidObjectId(caretakerId)) return res.status(400).json({ message: 'caretakerId must be a valid ID' });
      const caretaker = await ensureUserWithRole(caretakerId, 'caretaker');
      if (!caretaker) return res.status(400).json({ message: 'caretakerId must reference a caretaker user' });
      updateData.caretaker = caretaker._id;
    }

    if (nurseId !== undefined) {
      if (nurseId !== null && !isValidObjectId(nurseId)) {
        return res.status(400).json({ message: 'nurseId must be a valid ID or null' });
      }
      if (nurseId === null) {
        updateData.nurse = null;
      } else {
        const nurse = await ensureUserWithRole(nurseId, 'nurse');
        if (!nurse) return res.status(400).json({ message: 'nurseId must reference a nurse user' });
        updateData.nurse = nurse._id;
      }
    }

    if (tasks !== undefined) {
      const taskValidation = await validateTaskIds(tasks, current.patient);
      if (!taskValidation.ok) return res.status(400).json({ message: taskValidation.message });
      updateData.tasks = tasks;
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'status must be active or inactive' });
      }

      if (status === 'active' && current.status !== 'active') {
        const existingActivePlan = await CarePlan.findOne({
          patient: current.patient,
          status: 'active',
          _id: { $ne: current._id }
        });
        if (existingActivePlan) {
          return res.status(409).json({
            message: 'Another active care plan already exists for this patient',
            carePlanId: existingActivePlan._id
          });
        }
      }

      updateData.status = status;
    }

    const carePlan = await populateCarePlan(
      CarePlan.findByIdAndUpdate(carePlanId, updateData, { new: true, runValidators: true })
    );

    return res.status(200).json({ message: 'Care plan updated', carePlan });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Another active care plan already exists for this patient' });
    }
    return res.status(500).json({ message: 'Error updating care plan', details: error.message });
  }
};

exports.deleteCarePlan = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    if (!isValidObjectId(carePlanId)) {
      return res.status(400).json({ message: 'carePlanId must be a valid ID' });
    }

    const carePlan = await CarePlan.findByIdAndDelete(carePlanId);
    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

    return res.status(200).json({ message: 'Care plan deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting care plan', details: error.message });
  }
};
