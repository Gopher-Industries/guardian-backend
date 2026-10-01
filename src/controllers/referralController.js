const { getSignedUploadUrl, getSignedDownloadUrl, getList, uploadGeneratedPdf} = require('../r2-client');
const path = require('path');
const fs = require('fs');
const { NoSuchKey, NotFound } = require('@aws-sdk/client-s3');
const BUCKET = process.env.R2_BUCKET;
const Patient = require('../models/Patient'); 


exports.HandleFileUploadUrl = async (req, res) => {
  try {
    const { patientId, fileName, contentType, documentType } = req.body;

    if (!patientId || !fileName || !documentType) {
      return res.status(400).json({ error: 'patientId and fileName are required' });
    }

    const exists = await Patient.exists({ _id: patientId });
    if (!exists){
      res.status(404).json({ error: 'Not a valid patient ID' });
      return;
    }

    const objectKey = `${patientId}/${documentType}/${fileName}`;
    const url = await getSignedUploadUrl(objectKey, contentType || 'application/pdf');

    res.status(200).json({ objectKey, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

exports.HandleFileDownload = async (req, res) => {
  try {
    const { patientId, fileName, contentType, documentType } = req.query;

    if (!patientId || !fileName || !documentType) {
      return res.status(400).json({ error: 'patientId and fileName are required' });
    }

    const objectKey = `${patientId}/${documentType}/${fileName}`;
    const url = await getSignedDownloadUrl(objectKey, 3600, fileName, contentType || 'application/pdf');

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


   
 