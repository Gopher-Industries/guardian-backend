/*
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');
const SupportTicket = require('../models/SupportTicket');
const Task = require('../models/Task');*/

const Patient = require('../models/Patient');
const Caretaker = require('../models/Caretaker');
const Nurse = require('../models/Nurse');
const Pharmacist = require('../models/Pharmacist');
const User = require('../models/User');

const { formatUserProfile } = require('../services/profileService');
const { getPatientById } = require('../services/patientLookupService');
const { createOrUpdateCarePlan } = require('../services/carePlanService');

// Fetch patient-caregiver assignment
exports.getAssignedUsers = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await getPatientById(patientId);

    const nurses = await Nurse.find({ assignedPatients: patientId }).select('-password');
    const caretakers = await Caretaker.find({ assignedPatients: patientId }).select('-password');
    const pharmacists = await Pharmacist.find({ assignedPatients: patientId }).select('-password');

    res.status(200).json({
      nurses,
      caretakers,
      pharmacists
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching assigned users', details: error.message });
  }
};

// Get pharmacist profile (by ID)
exports.getPharmacistProfile = async (req, res) => {
  try {
    const { pharmacistId } = req.params;
    const pharmacist = await Pharmacist.findById(pharmacistId).select('-password');
    if (!pharmacist) {
      return res.status(404).json({ error: 'Pharmacist not found' });
    }
    res.status(200).json(await formatUserProfile(pharmacist));
  } catch (error) {
    res.status(500).json({ error: 'Error fetching pharmacist profile', details: error.message });
  }
};

// Get caretaker profile (by ID)
exports.getCaretakerProfile = async (req, res) => {
  try {
    const { caretakerId } = req.params;
    const caretaker = await Caretaker.findById(caretakerId).select('-password');
    if (!caretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }
    res.status(200).json(await formatUserProfile(caretaker));
  } catch (error) {
    res.status(500).json({ error: 'Error fetching caretaker profile', details: error.message });
  }
};

// Create or update care plan for a patient
exports.createOrUpdateCarePlan = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { tasks } = req.body;

    const patient = await getPatientById(patientId);
    const carePlan = await createOrUpdateCarePlan(patient._id, tasks);

    res.status(200).json({
      message: 'Care plan created or updated successfully',
      carePlan
    });
  } catch (error) {
    res.status(500).json({ error: 'Error creating or updating care plan', details: error.message });
  }
};

// Get care plan for a patient
exports.getCarePlan = async (req, res) => {
  try {
    const { patientId } = req.params;
    const carePlan = await CarePlan.findOne({ patient: patientId });

    if (!carePlan) {
      return res.status(404).json({ error: 'Care plan not found' });
    }

    res.status(200).json(carePlan);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching care plan', details: error.message });
  }
};

/*
exports.getPatientOverview = async (req, res) => {
  try {
    const { patientId } = req.params;

    const patientDetails = await Patient.findById(patientId)
      .populate('assignedCaretaker')
      .populate('assignedNurse');

    if (!patientDetails) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const healthRecords = await HealthRecord.find({ patient: patientId });
    const tasks = await Task.find({ patient: patientId });
    const carePlan = await CarePlan.findOne({ patient: patientId }).populate('tasks');

    const taskCompletionRate = tasks.length
      ? (tasks.filter(task => task.status === 'completed').length / tasks.length) * 100
      : 0;

    const response = {
      patient: patientDetails,
      healthRecords,
      carePlan,
      tasks,
      taskCompletionRate,
    };

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching patient overview', details: error.message });
  }
};

exports.createSupportTicket = async (req, res) => {
  try {
    const { subject, description, status } = req.body;

    const newTicket = new SupportTicket({
      user: req.user._id,
      subject,
      description,
      status: status || 'open',
    });

    await newTicket.save();
    res.status(201).json({ message: 'Support ticket created', ticket: newTicket });
  } catch (error) {
    res.status(500).json({ message: 'Error creating support ticket', details: error.message });
  }
};

exports.getSupportTickets = async (req, res) => {
  try {
    const { status, userId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (userId) query.user = userId;

    const tickets = await SupportTicket.find(query).populate('user');
    res.status(200).json(tickets);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching support tickets', details: error.message });
  }
};

exports.updateSupportTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, adminResponse } = req.body;

    const updatedTicket = await SupportTicket.findByIdAndUpdate(
      ticketId,
      { status, adminResponse },
      { new: true }
    );

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Support ticket not found' });
    }

    res.status(200).json({ message: 'Support ticket updated', ticket: updatedTicket });
  } catch (error) {
    res.status(500).json({ message: 'Error updating support ticket', details: error.message });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { title, description, patientId, dueDate, assignedTo } = req.body;

    const newTask = new Task({ title, description, patient: patientId, dueDate, assignedTo });
    await newTask.save();

    res.status(201).json({ message: 'Task created successfully', task: newTask });
  } catch (error) {
    res.status(500).json({ message: 'Error creating task', details: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const updateData = req.body;

    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true });

    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.status(200).json({ message: 'Task updated successfully', task: updatedTask });
  } catch (error) {
    res.status(500).json({ message: 'Error updating task', details: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const deletedTask = await Task.findByIdAndDelete(taskId);

    if (!deletedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', details: error.message });
  }
};*/