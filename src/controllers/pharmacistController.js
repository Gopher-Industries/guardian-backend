const Pharmacist = require('../models/Pharmacist');
const Patient = require('../models/Patient');
const Caretaker = require('../models/Caretaker');
const Task = require('../models/Task');
const Message = require('../models/Message');
const HealthRecord = require('../models/HealthRecord');
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

exports.loginPharmacist =async (req, res) => {
  try {
    const { email, password } = req.body;
    const pharmacist = await Pharmacist.findOne({ email });

    if (!pharmacist) {
      return res.status(400).json({ error: 'Pharmacist not found' });
    }

    if (pharmacist.failedLoginAttempts !== null && pharmacist.failedLoginAttempts !== undefined && pharmacist.failedLoginAttempts > 4) {
      return res.status(400).json({ error: 'Your account has been flagged and locked. Please reset your password' });
    }

    const isValidPassword = await bcrypt.compare(password, pharmacist.password);
    if (!isValidPassword) {
      pharmacist.failedLoginAttempts = (pharmacist.failedLoginAttempts !== null && pharmacist.failedLoginAttempts !== undefined) ? pharmacist.failedLoginAttempts + 1 : 1;
      await pharmacist.save();
      return res.status(400).json({ error: 'Incorrect email and password combination'});
    }

    pharmacist.failedLoginAttempts = 0;
    await pharmacist.save();

    if (!pharmacist.isApproved) {
      return res.status(400).json({ error: 'Pharmacist account is not approved by admin' });
    }

    const token = jwt.sign({ _id: pharmacist._id, email: pharmacist.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ message: 'Login successful', token, pharmacist });
  } catch (error) {
    res.status(500).json({ error: 'Error during login', details: error.message });
  }
};

exports.getAssignedPatients = async (req, res) => {
  try {
    const pharmaicst = await Pharmacist.findById(req.user._id).populate('assignedPatients');
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
      patient: patientId
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

exports.getPharmacistProfile = async (req, res) => {
  try {
    const pharmacist = await Pharmacist.findById(req.user._id);
    if (!pharmacist) return res.status(404).json({ message: 'Pharmacist not found' });
    res.json(pharmacist);
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

exports.getCaretakerDetails = async (req, res) => {
  try {
    const caretaker = await Caretaker.findById(req.params.caretakerId);
    if (!caretaker) return res.status(404).json({ message: 'Caretaker not found' });
    res.json(caretaker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.getHealthRecords = async (req, res) => {
  try {
    const healthRecords = await HealthRecord.find({ patientId: req.params.patientId });
    res.json(healthRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.updateHealthRecords = async (req, res) => {
  try {
    const healthRecord = await HealthRecord.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $push: { records: req.body.vitals } },
      { new: true }
    );
    res.json(healthRecord);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

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
    const labTestRecord = await LabTestRecord.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $push: { records: req.body.vitals } },
      { new: true }
    );
    res.json(labTestRecord);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.getMedicationRecords = async (req, res) => {
  try {
    const medicationRecords = await MedicationRecord.find({ patientId: req.params.patientId });
    res.json(medicationRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.updateMedicationRecords = async (req, res) => {
  try {
    const medicationRecord = await MedicationRecord.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $push: { records: req.body.vitals } },
      { new: true }
    );
    res.json(medicationRecord);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.getDailyReports = async (req, res) => {
  try {
    const reports = await Report.find({ pharmacistId: req.user._id });
    res.json(reports);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.approveTaskReport = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.status = 'approved';
    await task.save();
    res.status(200).json({ message: 'Task approved successfully', task });
  } catch (error) {
    res.status(500).json({ error: 'Error approving task', details: error.message });
  }
};

exports.getPatientHealthRecords = async (req, res) => {
  try {
    const { patientId } = req.params;

    const healthRecords = await HealthRecord.find({ patient: patientId });
    res.status(200).json(healthRecords);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching health records', details: error.message });
  }
};

exports.getPatientLabTestRecords = async (req, res) => {
  try {
    const { patientId } = req.params;

    const labTestRecords = await LabTestRecord.find({ patient: patientId });
    res.status(200).json(labTestRecords);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching laboratory test records', details: error.message });
  }
};

exports.getPatientMedicationRecords = async (req, res) => {
  try {
    const { patientId } = req.params;

    const medicationRecord = await MedicationRecord.find({ patient: patientId });
    res.status(200).json(medicationRecord);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching medication records', details: error.message });
  }
};

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

exports.approveVitalSigns = async (req, res) => {
  try {
    const { patientId } = req.params;

    const healthRecord = await HealthRecord.findOne({ patient: patientId, status: 'pending' });

    if (!healthRecord) {
      return res.status(404).json({ error: 'No pending vital signs found' });
    }

    healthRecord.status = 'approved';
    await healthRecord.save();
    res.status(200).json({ message: 'Vital signs approved successfully', healthRecord });
  } catch (error) {
    res.status(500).json({ error: 'Error approving vital signs', details: error.message });
  }
};

exports.getPatientReport = async (req, res) => {
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

    const report = await HealthRecord.find({ patient: patientId });
    if (!report) {
      return res.status(404).json({ error: 'No report available for this patient' });
    }

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patient report', details: error.message });
  }
};

exports.sendMessageToCaretaker = async (req, res) => {
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

exports.getChatMessages = async (req, res) => {
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

exports.submitFeedbackForCaretaker = async (req, res) => {
  try {
    const { caretakerId } = req.params;
    const { feedback, rating } = req.body;

    const caretaker = await Caretaker.findById(caretakerId);
    if (!caretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }

    // Save feedback and rating in caretaker's profile
    caretaker.feedback.push({ feedback, rating, pharmacistId: req.user._id });
    await caretaker.save();

    res.status(200).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error submitting feedback', details: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { caretakerId } = req.params;
    const { message } = req.body;

    const chat = new Chat({
      senderId: req.user._id,
      receiverId: caretakerId,
      message,
      sentAt: Date.now(),
    });

    await chat.save();
    res.status(200).json({ message: 'Message sent successfully', chat });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

exports.getMessages = async (req, res) => {
  try {
    const { caretakerId } = req.params;
    const messages = await Chat.find({
      $or: [
        { senderId: req.user._id, receiverId: caretakerId },
        { senderId: caretakerId, receiverId: req.user._id },
      ],
    }).sort({ sentAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

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

exports.getAssignedPatients = async (req, res) => {
  try {
    const { role, _id } = req.user;

    const query = {};
    if (role === 'pharmacist') {
      query.assignedPharmacist =_id;
    } else if (role === 'caretaker') {
      query.assignedCaretaker = _id;
    } else {
      return res.status(403).json({ message: 'Unauthorized role' });
    }

    const patients = await Patient.find(query);

    res.status(200).json(patients);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assigned patients', details: error.message });
  }
};
