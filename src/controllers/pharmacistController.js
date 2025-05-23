const Pharmacist = require('../models/Pharmacist');
const Patient = require('../models/Patient');
const Caretaker = require('../models/Caretaker');
const Task = require('../models/Task');
const Message = require('../models/Message');
const NurseObservation = require('../models/NurseObservation');
const LabTestRecord = require('../models/LabTestRecord');
const MedicationRecord = require('../models/MedicationRecord');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerPharmacist = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Check if the password is at least 6 characters long
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existingPharmacist = await Pharmacist.findOne({ email });
    if (existingPharmacist) {
      return res.status(400).json({ error: 'Pharmacist already exists with this email' });
    }

    const newPharmacist = new Pharmacist({ name, email, password });
    await newPharmacist.save();

    const token = jwt.sign(
      { _id: newPharmacist._id, email: newPharmacist.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const pharmacistResponse = {
      _id: newPharmacist._id,
      name: newPharmacist.name,
      email: newPharmacist.email,
      ahpra: newPharmacist.ahpra,
      role: newPharmacist.role
    };

    res.status(201).json({ message: 'Pharmacist registered successfully', pharmacist: pharmacistResponse, token });
  } catch (error) {
    res.status(500).json({ error: 'Error registering pharmacist', details: error.message });
  }
};

exports.loginPharmacist = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Must include password for validation
    const pharmacist = await Pharmacist.findOne({ email }).select('+password');

    if (!pharmacist) {
      return res.status(400).json({ error: 'Pharmacist not found' });
    }

    if (pharmacist.failedLoginAttempts !== null && pharmacist.failedLoginAttempts > 4) {
      return res.status(400).json({ error: 'Your account has been flagged and locked. Please reset your password' });
    }

    const isValidPassword = await bcrypt.compare(password, pharmacist.password);
    if (!isValidPassword) {
      pharmacist.failedLoginAttempts = (pharmacist.failedLoginAttempts || 0) + 1;
      await pharmacist.save();
      return res.status(400).json({ error: 'Incorrect email and password combination' });
    }

    pharmacist.failedLoginAttempts = 0;
    await pharmacist.save();

    if (!pharmacist.isApproved) {
      return res.status(400).json({ error: 'Pharmacist account is not approved by admin' });
    }

    // Exclude password from response
    const { _id, name, email: pharmacistEmail, ahpra, role } = pharmacist;
    const token = jwt.sign({ _id, email: pharmacistEmail }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({
      message: 'Login successful',
      token,
      pharmacist: { _id, name, email: pharmacistEmail, ahpra, role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error during login', details: error.message });
  }
};


exports.getAssignedPatients = async (req, res) => {
  try {
    const pharmacist = await Pharmacist.findById(req.user._id).populate('assignedPatients');
    if (!pharmacist) {
      return res.status(404).json({ error: 'Pharmacist not found' });
    }

    res.status(200).json(pharmacist.assignedPatients);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patients', details: error.message });
  }
};

exports.getAssignedCaretakersForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    const pharmacist = await Pharmacist.findById(req.user._id).populate('assignedPatients');
    if (!pharmacist) {
      return res.status(404).json({ error: 'Pharmacist not found' });
    }

    const isPatientAssigned = pharmacist.assignedPatients.some(patient => patient._id.toString() === patientId);
    if (!isPatientAssigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    const caretakers = await Caretaker.find({ assignedPatients: patientId });
    res.status(200).json(caretakers);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching caretakers', details: error.message });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { description, dueDate, priority, caretakerId, patientId } = req.body;

    const caretaker = await Caretaker.findById(caretakerId);
    const patient = await Patient.findById(patientId);

    if (!caretaker || !patient) {
      return res.status(400).json({ error: 'Invalid caretaker or patient' });
    }

    const task = new Task({
      description,
      dueDate,
      priority,
      caretaker: caretakerId,
      patient: patientId,
      nurse: req.user._id,
      pharmacist: req.user._id
    });

    await task.save();
    res.status(201).json({ message: 'Task created successfully', task });
  } catch (error) {
    res.status(500).json({ error: 'Error creating task', details: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.taskId, req.body, { new: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.getPatientDetails = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.json(patient);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.getObservations = async (req, res) => {
  try {
    const { patientId } = req.params;
    const observations = await NurseObservation.find({ patient: patientId });
    res.status(200).json(observations);
  } catch (error) {
    res.status(400).json({ error: 'Error fetching observations', details: error.message });
  }
};

exports.getLabTestRecords = async (req, res) => {
  try {
    const labTestRecords = await LabTestRecord.find({ patientId: req.params.patientId });
    res.json(labTestRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.updateLabTestRecords = async (req, res) => {
  try {
    const { labTestRecord } = req.body;
    if (!labTestRecord || typeof labTestRecord !== 'object') {
      return res.status(400).json({ error: 'Invalid or missing labTestRecord object.' });
    }

    const record = await LabTestRecord.findOneAndUpdate(
      { patient: req.params.patientId },
      { $push: { records: labTestRecord } },
      { upsert: true, new: true }
    );

    res.status(200).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getMedicationRecords = async (req, res) => {
  try {
    const medicationRecords = await MedicationRecord.find({ patientId: req.params.patientId });
    res.status(200).json(medicationRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.updateMedicationRecords = async (req, res) => {
  try {
    const { medicationRecord } = req.body;
    if (!medicationRecord || !medicationRecord.drugName || !medicationRecord.dose || !medicationRecord.frequency || !medicationRecord.duration || !medicationRecord.indication) {
      return res.status(400).json({ error: 'Missing required medication fields.' });
    }

    medicationRecord.pharmacist = {
      id: req.user._id,
      signedAt: new Date()
    };

    const record = await MedicationRecord.findOneAndUpdate(
      { patient: req.params.patientId },
      { $push: { records: medicationRecord } },
      { upsert: true, new: true }
    );

    res.status(200).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getDailyReports = async (req, res) => {
  try {
    const reports = await Report.find({ pharmacistId: req.user._id });
    res.json(reports);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.updateProfile = async (req, res) => {
  try {
    const { name, password } = req.body;

    const pharmacist = await Pharmacist.findById(req.user._id);

    if (!pharmacist) {
      return res.status(404).json({ error: 'Pharmacist not found' });
    }

    if (name) pharmacist.name = name;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      pharmacist.password = await bcrypt.hash(password, salt);
    }

    await pharmacist.save();
    res.status(200).json({ message: 'Profile updated successfully', pharmacist });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile', details: error.message });
  }
};

exports.getPatientReport = async (req, res) => {
  try {
    const { patientId } = req.params;

    const pharmacist = await Pharmacist.findById(req.user._id).populate('assignedPatients');
    if (!pharmacist) {
      return res.status(404).json({ error: 'Pharmacist not found' });
    }

    const isPatientAssigned = pharmacist.assignedPatients.some(p => p._id.toString() === patientId);
    if (!isPatientAssigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    const observations = await NurseObservation.find({ patient: patientId });
    const labs = await LabTestRecord.find({ patient: patientId });
    const medications = await MedicationRecord.find({ patientId });

    res.status(200).json({ observations, labs, medications });
  } catch (error) {
    res.status(500).json({ error: 'Error compiling patient report', details: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { caretakerId } = req.params;
    const { message } = req.body;

    const caretaker = await Caretaker.findById(caretakerId);
    if (!caretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }

    // Save message in the database
    const newMessage = new Message({
      from: req.user._id,
      to: caretakerId,
      message,
      timestamp: Date.now(),
    });

    await newMessage.save();

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error sending message', details: error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { caretakerId } = req.params;

    const messages = await Message.find({
      $or: [
        { from: req.user._id, to: caretakerId },
        { from: caretakerId, to: req.user._id },
      ],
    }).sort({ timestamp: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching messages', details: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const pharmacist = await Pharmacist.findById(req.user._id).select('-password');
    if (!pharmacist) {
      return res.status(404).json({ error: 'Pharmacist not found' });
    }
    res.status(200).json(pharmacist);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching pharmacist profile', details: error.message });
  }
};

exports.getCaretakerProfile = async (req, res) => {
  try {
    const { caretakerId } = req.params;

    const caretaker = await Caretaker.findById(caretakerId).select('-password');
    if (!caretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }

    res.status(200).json(caretaker);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching caretaker profile', details: error.message });
  }
};

exports.createOrUpdateCarePlan = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { tasks } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    let carePlan = await CarePlan.findOne({ patient: patientId });
    if (!carePlan) {
      // If no care plan exists, create a new one
      carePlan = new CarePlan({ patient: patientId, tasks });
    } else {
      // If care plan exists, update it
      carePlan.tasks = tasks;
    }

    await carePlan.save();
    res.status(200).json({ message: 'Care plan created or updated successfully', carePlan });
  } catch (error) {
    res.status(500).json({ error: 'Error creating or updating care plan', details: error.message });
  }
};

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