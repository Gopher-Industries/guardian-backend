
const User = require('../models/User');
const Patient = require('../models/Patient');
const Pharmacist = require('../models/Pharmacist');
const Nurse = require('../models/Nurse');
const Caretaker = require('../models/Caretaker');
const { buildAuditSignature } = require('../services/signatureService');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllPatients = async (req, res) => {
  try {
    const patients = await Patient.find();
    res.status(200).json(patients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllNurses = async (req, res) => {
  try {
    const nurses = await Nurse.find();
    res.status(200).json(nurses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllPharmacists = async (req, res) => {
  try {
    const pharmacists = await Pharmacist.find();
    res.status(200).json(pharmacists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllCaretakers = async (req, res) => {
  try {
    const caretakers = await Caretaker.find();
    res.status(200).json(caretakers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndUpdate(userId, { isApproved: true }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ message: 'User approved', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.revokeUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndUpdate(userId, { isApproved: false }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ message: 'User access revoked', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
