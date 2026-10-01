const mongoose = require('mongoose');

const DoctorLetter = require('../models/DoctorLetter');
const Patient = require('../models/Patient');

const { generateDoctorLetterPdf } = require('../services/doctorLetterPdfService');
const generateDocumentName = require('../utils/generateDocumentName');

exports.generateDoctorLetter = async (req, res) => {
  try {
    const {
      patientId,
      doctorName,
      patientName,
      date,
      subject,
      letterContent
    } = req.body;

    // Check required fields
    if (!patientId || !doctorName || !patientName || !letterContent) {
      return res.status(400).json({
        error: 'patientId, doctorName, patientName and letterContent are required'
      });
    }

    // Check patient ID
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({
        error: 'Invalid patient ID'
      });
    }

    // Check patient exists
    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    const letterDate = date || new Date().toLocaleDateString('en-AU');

    const letterData = {
      doctorName,
      patientName,
      date: letterDate,
      subject,
      letterContent
    };

    // Generate file name
    const fileName = generateDocumentName(
      patientName,
      'doctorLetter'
    );

    // Generate PDF
    const pdfBuffer = await generateDoctorLetterPdf(letterData);

    // Save letter and PDF to MongoDB
    const doctorLetter = new DoctorLetter({
      patient: patientId,
      createdBy: req.user._id,
      patientName,
      doctorName,
      subject,
      letterContent,
      fileName,
      mimeType: 'application/pdf',
      fileData: pdfBuffer
    });

    await doctorLetter.save();

    console.log('Doctor letter saved:', doctorLetter._id);
    console.log('File name:', fileName);

    // Return the PDF
    res.setHeader('Content-Type', 'application/pdf');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    res.setHeader(
      'X-Doctor-Letter-Id',
      doctorLetter._id.toString()
    );

    res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error('Doctor letter error:', error);

    res.status(500).json({
      error: error.message
    });
  }
};