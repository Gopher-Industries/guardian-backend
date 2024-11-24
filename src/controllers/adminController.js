const Patient = require('../models/Patient');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const CarePlan = require('../models/CarePlan');

// Fetch patient overview
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

// Create a support ticket
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

