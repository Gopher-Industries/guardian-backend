
const { getPatientById, updatePatientDetails } = require('../services/patientService');
const { updateOwnProfile } = require('../services/profileService');
const { submitOrUpdateMedication, getMedicationRecord } = require('../services/medicationService');
const { addLabTestResult, getLabTestRecords } = require('../services/labTestService');
const { createOrUpdateCarePlan, getCarePlan } = require('../services/carePlanService');
const { createTask, getTasksForUser } = require('../services/taskService');

exports.getPatientDetails = async (req, res) => {
  try {
    const patient = await getPatientById(req.params.patientId);
    res.status(200).json(patient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updatePatientDetails = async (req, res) => {
  try {
    const updated = await updatePatientDetails(req.params.patientId, req.body, req.user);
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateOwnProfile = async (req, res) => {
  try {
    const updated = await updateOwnProfile(req.user, req.body);
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createOrUpdateMedication = async (req, res) => {
  try {
    const record = await submitOrUpdateMedication(req.params.patientId, req.body, req.user);
    res.status(200).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMedicationRecord = async (req, res) => {
  try {
    const record = await getMedicationRecord(req.params.patientId);
    res.status(200).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addLabTestResult = async (req, res) => {
  try {
    const result = await addLabTestResult(req.params.patientId, req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getLabTestRecords = async (req, res) => {
  try {
    const results = await getLabTestRecords(req.params.patientId);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createOrUpdateCarePlan = async (req, res) => {
  try {
    const result = await createOrUpdateCarePlan(req.params.patientId, req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCarePlan = async (req, res) => {
  try {
    const plan = await getCarePlan(req.params.patientId);
    res.status(200).json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyTasks = async (req, res) => {
  try {
    const tasks = await getTasksForUser('pharmacist', req.user._id);
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


exports.createTask = async (req, res) => {
  try {
    const task = await createTask({
      ...req.body,
      createdBy: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role
      }
    }, req.user);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const success = await deleteTask(req.params.taskId, req.user._id);
    if (success) {
      res.status(200).json({ message: 'Task deleted successfully' });
    }
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
};
