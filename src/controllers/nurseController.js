const Nurse = require('../models/Nurse');
const Patient = require('../models/Patient');
const Caretaker = require('../models/Caretaker');
const Task = require('../models/Task');
const Message = require('../models/Message');
const HealthRecord = require('../models/HealthRecord');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * @swagger
 * /api/v1/nurse/register:
 *   post:
 *     summary: Register a new nurse
 *     tags: [Nurse]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Nurse registered successfully
 *       400:
 *         description: Error registering nurse
 */
exports.registerNurse = async (req, res) => {
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

    const existingNurse = await Nurse.findOne({ email });
    if (existingNurse) {
      return res.status(400).json({ error: 'Nurse already exists with this email' });
    }

    const newNurse = new Nurse({ name, email, password });
    await newNurse.save();

    const token = jwt.sign(
      { _id: newNurse._id, email: newNurse.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const nurseResponse = {
      _id: newNurse._id,
      name: newNurse.name,
      email: newNurse.email,
      role: newNurse.role
    };

    res.status(201).json({ message: 'Nurse registered successfully', nurse: nurseResponse, token });
  } catch (error) {
    res.status(500).json({ error: 'Error registering nurse', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/login:
 *   post:
 *     summary: Login nurse
 *     tags: [Nurse]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful login
 *       400:
 *         description: Invalid credentials
 */
exports.loginNurse = async (req, res) => {
  try {
    const { email, password } = req.body;
    const nurse = await Nurse.findOne({ email });

    if (!nurse) {
      return res.status(400).json({ error: 'Nurse not found' });
    }

    if (nurse.failedLoginAttempts !== null && nurse.failedLoginAttempts !== undefined && nurse.failedLoginAttempts > 4) {
      return res.status(400).json({ error: 'Your account has been flagged and locked. Please reset your password' });
    }

    const isValidPassword = await bcrypt.compare(password, nurse.password);
    if (!isValidPassword) {
      nurse.failedLoginAttempts = (nurse.failedLoginAttempts !== null && nurse.failedLoginAttempts !== undefined) ? nurse.failedLoginAttempts + 1 : 1;
      await user.save();
      return res.status(400).json({ error: 'Incorrect email and password combination'});
    }

    user.failedLoginAttempts = 0;
    await user.save();

    if (!nurse.isApproved) {
      return res.status(400).json({ error: 'Nurse account is not approved by admin' });
    }

    const token = jwt.sign({ _id: nurse._id, email: nurse.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ message: 'Login successful', token, nurse });
  } catch (error) {
    res.status(500).json({ error: 'Error during login', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/patients:
 *   get:
 *     summary: Get patients assigned to nurse
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assigned patients
 *       400:
 *         description: Error fetching patients
 */
exports.getAssignedPatients = async (req, res) => {
  try {
    const nurse = await Nurse.findById(req.user._id).populate('assignedPatients');
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }
    res.status(200).json(nurse.assignedPatients);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching patients', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/caretakers/{patientId}:
 *   get:
 *     summary: Get caretakers assigned to a patient that the nurse is also assigned to
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: List of caretakers assigned to the patient
 *       400:
 *         description: Error fetching caretakers
 */
exports.getAssignedCaretakersForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    const nurse = await Nurse.findById(req.user._id).populate('assignedPatients');
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }

    const isPatientAssigned = nurse.assignedPatients.some(patient => patient._id.toString() === patientId);
    if (!isPatientAssigned) {
      return res.status(403).json({ error: 'You are not assigned to this patient' });
    }

    const caretakers = await Caretaker.find({ assignedPatients: patientId });
    res.status(200).json(caretakers);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching caretakers', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/tasks:
 *   post:
 *     summary: Create a task for a caretaker
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *               - dueDate
 *               - priority
 *               - caretakerId
 *               - patientId
 *             properties:
 *               description:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *               caretakerId:
 *                 type: string
 *               patientId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 *       400:
 *         description: Error creating task
 */
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

/**
 * @swagger
 * /api/v1/nurse/tasks/{taskId}:
 *   put:
 *     summary: Update a task
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the task to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Task'
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 *       400:
 *         description: Error updating task
 */
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.taskId, req.body, { new: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/tasks/{taskId}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the task to delete
 *     responses:
 *       200:
 *         description: Task deleted successfully
 *       404:
 *         description: Task not found
 *       400:
 *         description: Error deleting task
 */
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * @swagger
 * /api/v1/nurse/profile:
 *   get:
 *     summary: Fetch nurse's own profile details
 *     tags: [Nurse]
 *     responses:
 *       200:
 *         description: Nurse profile details
 *       400:
 *         description: Error fetching nurse profile
 */
exports.getNurseProfile = async (req, res) => {
  try {
    const nurse = await Nurse.findById(req.user._id);
    if (!nurse) return res.status(404).json({ message: 'Nurse not found' });
    res.json(nurse);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * @swagger
 * /api/v1/nurse/patient/{patientId}:
 *   get:
 *     summary: Fetch patient details
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient to fetch
 *     responses:
 *       200:
 *         description: Patient details
 *       404:
 *         description: Patient not found
 *       400:
 *         description: Error fetching patient details
 */
exports.getPatientDetails = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.json(patient);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * @swagger
 * /api/v1/nurse/caretaker/{caretakerId}:
 *   get:
 *     summary: Fetch caretaker details
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker to fetch
 *     responses:
 *       200:
 *         description: Caretaker details
 *       404:
 *         description: Caretaker not found
 *       400:
 *         description: Error fetching caretaker details
 */
exports.getCaretakerDetails = async (req, res) => {
  try {
    const caretaker = await Caretaker.findById(req.params.caretakerId);
    if (!caretaker) return res.status(404).json({ message: 'Caretaker not found' });
    res.json(caretaker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * @swagger
 * /api/v1/nurse/patient/{patientId}/health-records:
 *   get:
 *     summary: Fetch health records of a patient
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Health records
 *       404:
 *         description: Patient not found
 *       400:
 *         description: Error fetching health records
 */
exports.getHealthRecords = async (req, res) => {
  try {
    const healthRecords = await HealthRecord.find({ patientId: req.params.patientId });
    res.json(healthRecords);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * @swagger
 * /api/v1/nurse/patient/{patientId}/health-record:
 *   post:
 *     summary: Update health records of a patient
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vitals:
 *                 type: object
 *                 properties:
 *                   bloodPressure:
 *                     type: string
 *                   temperature:
 *                     type: string
 *                   heartRate:
 *                     type: string
 *     responses:
 *       200:
 *         description: Health records updated successfully
 *       400:
 *         description: Error updating health records
 */
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

/**
 * @swagger
 * /api/v1/nurse/reports:
 *   get:
 *     summary: Get daily reports submitted by caretakers
 *     tags: [Nurse]
 *     responses:
 *       200:
 *         description: List of reports
 *       400:
 *         description: Error fetching reports
 */
exports.getDailyReports = async (req, res) => {
  try {
    const reports = await Report.find({ nurseId: req.user._id });
    res.json(reports);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * @swagger
 * /api/v1/nurse/tasks/{taskId}/approve:
 *   post:
 *     summary: Approve a task report from a caretaker
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the task to approve
 *     responses:
 *       200:
 *         description: Task approved successfully
 *       400:
 *         description: Error approving task
 */
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

/**
 * @swagger
 * /api/v1/nurse/patients/{patientId}/health-records:
 *   get:
 *     summary: Get health records of a patient assigned to nurse
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Health records fetched successfully
 *       400:
 *         description: Error fetching health records
 */
exports.getPatientHealthRecords = async (req, res) => {
  try {
    const { patientId } = req.params;

    const healthRecords = await HealthRecord.find({ patient: patientId });
    res.status(200).json(healthRecords);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching health records', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/profile:
 *   put:
 *     summary: Update nurse profile
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Error updating profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, password } = req.body;

    const nurse = await Nurse.findById(req.user._id);

    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }

    if (name) nurse.name = name;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      nurse.password = await bcrypt.hash(password, salt);
    }

    await nurse.save();
    res.status(200).json({ message: 'Profile updated successfully', nurse });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/vital-signs/{patientId}/approve:
 *   post:
 *     summary: Approve vital signs report from caretaker
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Vital signs approved successfully
 *       400:
 *         description: Error approving vital signs
 */
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

/**
 * @swagger
 * /api/v1/nurse/patient/{patientId}/report:
 *   get:
 *     summary: Get the report for a patient assigned to nurse
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Report fetched successfully
 *       404:
 *         description: Patient not found or no report available
 *       400:
 *         description: Error fetching patient report
 */
exports.getPatientReport = async (req, res) => {
  try {
    const { patientId } = req.params;

    const nurse = await Nurse.findById(req.user._id).populate('assignedPatients');
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }

    const isPatientAssigned = nurse.assignedPatients.some(patient => patient._id.toString() === patientId);
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

/**
 * @swagger
 * /api/v1/nurse/chat/{caretakerId}:
 *   post:
 *     summary: Send a chat message to a caretaker
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent successfully
 *       400:
 *         description: Error sending message
 */
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

/**
 * @swagger
 * /api/v1/nurse/chat/{caretakerId}/messages:
 *   get:
 *     summary: Get chat messages with a caretaker
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *     responses:
 *       200:
 *         description: Chat messages fetched successfully
 *       400:
 *         description: Error fetching messages
 */
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

/**
 * @swagger
 * /api/v1/nurse/profile:
 *   get:
 *     summary: Get nurse profile
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Nurse profile fetched successfully
 *       400:
 *         description: Error fetching nurse profile
 */
exports.getProfile = async (req, res) => {
  try {
    const nurse = await Nurse.findById(req.user._id).select('-password');
    if (!nurse) {
      return res.status(404).json({ error: 'Nurse not found' });
    }
    res.status(200).json(nurse);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching nurse profile', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/caretaker/{caretakerId}/profile:
 *   get:
 *     summary: View caretaker profile and provide feedback
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *     responses:
 *       200:
 *         description: Caretaker profile fetched successfully
 *       400:
 *         description: Error fetching caretaker profile
 */
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

/**
 * @swagger
 * /api/v1/nurse/caretaker/{caretakerId}/feedback:
 *   post:
 *     summary: Provide feedback and rating for caretaker
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - feedback
 *               - rating
 *             properties:
 *               feedback:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *       400:
 *         description: Error submitting feedback
 */
exports.submitFeedbackForCaretaker = async (req, res) => {
  try {
    const { caretakerId } = req.params;
    const { feedback, rating } = req.body;

    const caretaker = await Caretaker.findById(caretakerId);
    if (!caretaker) {
      return res.status(404).json({ error: 'Caretaker not found' });
    }

    // Save feedback and rating in caretaker's profile
    caretaker.feedback.push({ feedback, rating, nurseId: req.user._id });
    await caretaker.save();

    res.status(200).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error submitting feedback', details: error.message });
  }
};

/**
 * @swagger
 * /api/v1/nurse/chat/{caretakerId}:
 *   post:
 *     summary: Send a message to the caretaker
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message content
 *     responses:
 *       200:
 *         description: Message sent successfully
 *       400:
 *         description: Error sending message
 */
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

/**
 * @swagger
 * /api/v1/nurse/chat/{caretakerId}:
 *   get:
 *     summary: Fetch chat messages with the caretaker
 *     tags: [Nurse]
 *     parameters:
 *       - in: path
 *         name: caretakerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the caretaker
 *     responses:
 *       200:
 *         description: List of chat messages
 *       400:
 *         description: Error fetching chat messages
 */
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

/**
 * @swagger
 * /api/v1/nurse/care-plan/{patientId}:
 *   post:
 *     summary: Create or update a care plan for a patient
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                     dueDate:
 *                       type: string
 *                       format: date
 *                     priority:
 *                       type: string
 *                       enum: [low, medium, high]
 *     responses:
 *       200:
 *         description: Care plan created or updated successfully
 *       400:
 *         description: Error creating or updating care plan
 */
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

/**
 * @swagger
 * /api/v1/nurse/care-plan/{patientId}:
 *   get:
 *     summary: Get care plan for a patient
 *     tags: [Nurse]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the patient
 *     responses:
 *       200:
 *         description: Care plan fetched successfully
 *       404:
 *         description: Care plan not found
 *       400:
 *         description: Error fetching care plan
 */
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
