// src/routes/patientSelfRegistration.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PatientSelfRegistration = require('../models/PatientSelfRegistration');
const router = express.Router();


router.post('/register', async (req, res) => {
  try {
    const { name, age, contact, email, password } = req.body;

    // Check if the email is already registered
    const existingPatient = await PatientSelfRegistration.findOne({ email });
    if (existingPatient) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Create a new self-registered patient
    const newPatient = new PatientSelfRegistration({ name, age, contact, email, password });
    await newPatient.save();

    // Generate a JWT token for authentication
    const token = jwt.sign({ id: newPatient._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.status(201).json({ message: 'Patient self-registered successfully', patient: { id: newPatient._id, name, email }, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Check if the email exists
      const patient = await PatientSelfRegistration.findOne({ email });
      if (!patient) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      // Check the password
      const isMatch = await bcrypt.compare(password, patient.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      // Generate a new JWT token
      const token = jwt.sign({ id: patient._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  
      res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
module.exports = router;
