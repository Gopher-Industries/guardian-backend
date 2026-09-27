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