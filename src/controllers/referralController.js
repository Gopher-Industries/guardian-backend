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

    if (!patientId || !fileName || !documentType) {
      return res.status(400).json({ error: 'patientId and fileName are required' });
    }

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

    res.status(500).json({ error: 'File download failed' });
  }
};

exports.List = async (req, res) => {
  try {
    const { patientId } = req.query;

    if (!patientId) {
      const result = await getList();
      return res.status(200).json({ Result: result });
    }

    const exists = await Patient.exists({ _id: patientId });
    if (!exists) {
      return res.status(404).json({ error: 'Not a valid patient ID' });
    }

    const normalizedPatientId = patientId.endsWith('/') ? patientId : `${patientId}/`;
    const result = await getList(normalizedPatientId);
    res.status(200).json({ Result: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list referrals' });
  }
};


exports.HandleGenerateReferral = async (req, res) => {
  try {
    const { patientId, fileName, data } = req.body;

    if (!patientId || !fileName || !data) {
      return res.status(400).json({ error: 'patientId, fileName and data are required' });
    }

    const exists = await Patient.exists({ _id: patientId });
    if (!exists) {
      return res.status(404).json({ error: 'Not a valid patient ID' });
    }

    const pdfBytes = await generateReferralPdf(data); // your existing function
    const objectKey = `${patientId}/referrals/${fileName}`;
    await uploadGeneratedPdf(pdfBytes, objectKey);

    res.status(200).json({ objectKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate and upload referral' });
  }
};


   
 