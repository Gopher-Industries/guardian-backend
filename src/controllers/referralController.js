const {
  generateReferralPdf
} = require('../services/referralpdfService');

/**
 * Generate and return a referral PDF.
 *
 * patientId is used as a reference identifier only.
 * This endpoint does NOT check MongoDB for the patient.
 */
exports.generateReferralPdf = async (req, res) => {
  try {
    const {
      patientId,
      fileName = 'referral.pdf',
      data
    } = req.body;
const { getSignedUploadUrl, getSignedDownloadUrl, getList, uploadGeneratedPdf } = require('../r2-client');
const Patient = require('../models/Patient');
const Correspondence = require('../models/Correspondence');

const DOCUMENT_TYPE_TO_CORRESPONDENCE_TYPE = {
  referrals: 'referral',
  letters: 'letter',
  'specialist-reports': 'specialist report',
};

exports.HandleFileUploadUrl = async (req, res) => {
  try {
    const { patientId, fileName, documentType, direction, description } = req.body;

    console.log('Received fileName:', fileName);

    // patientId is required
    if (!patientId) {
      return res.status(400).json({
        error: 'patientId is required'
      });
    }

    // Accept a string only
    if (typeof patientId !== 'string') {
      return res.status(400).json({
        error: 'patientId must be a string'
      });
    }

    // For this API we only require the normal Mongo-style ID length.
    // We are NOT checking whether the ID exists in the database.
    if (patientId.trim().length !== 24) {
      return res.status(400).json({
        error: 'patientId must be valid'
      });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        error: 'Referral data is required'
      });
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const patientExists = await Patient.exists({ _id: patientId });
    if (!patientExists) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const correspondenceType = DOCUMENT_TYPE_TO_CORRESPONDENCE_TYPE[documentType];
    if (!correspondenceType) {
      return res.status(400).json({ error: `Unsupported documentType: ${documentType}` });
    }

    const objectKey = `${patientId}/${documentType}/${fileName}`;

    const correspondence = await Correspondence.create({
      patient: patientId,
      staff: req.user?._id || null,
      type: correspondenceType,
      description: description || `Uploaded document: ${fileName}`,
      direction: direction || 'incoming',
      date: new Date(),
      cloudflareObjectKey: objectKey,
      status: 'pending',
    });

    const url = await getSignedUploadUrl(objectKey);

    res.status(200).json({ objectKey, url, correspondenceId: correspondence._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

exports.HandleFileDownload = async (req, res) => {
  try {
    const { patientId, fileName, documentType } = req.query;

    if (!patientId || !fileName || !documentType) {
      return res.status(400).json({ error: 'patientId and fileName are required' });
    }

    const objectKey = `${patientId}/${documentType}/${fileName}`;
    const url = await getSignedDownloadUrl(objectKey);

    res.status(200).json({ objectKey, url });
  } catch (err) {
    console.error(err);

    if (err?.name === 'NoSuchKey' || err?.name === 'NotFound') {
      return res.status(404).json({ error: 'Referral file not found' });
    }

    // Generate PDF using referralpdfService
    const pdfBuffer = await generateReferralPdf(data);

    // Safe filename
    let safeFileName = String(fileName || 'referral.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!safeFileName.toLowerCase().endsWith('.pdf')) {
      safeFileName += '.pdf';
    }

    // Return PDF directly
    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"`
    );

    res.setHeader(
      'Content-Length',
      pdfBuffer.length
    );

    return res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error(
      'Referral PDF generation failed:',
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        error:
          error.message ||
          'Failed to generate referral PDF'
      });
  }
};