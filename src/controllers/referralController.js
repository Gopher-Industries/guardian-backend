const { uploadReferral, getSignedDownloadUrl } = require('../r2-client');

exports.HandleFileUpload = async (req, res) => {
  try {

    const { patientId, filePath } = req.body;

    if (!patientId || !filePath) {
      return res.status(400).json({ error: 'patientId and filePath are required' });
    }

    const objectKey = `referrals/${patientId}/${filePath.split('/').pop()}`
    const key = await uploadReferral(filePath, objectKey);
    const url = await getSignedDownloadUrl(key);
    res.status(200).json({ objectKey: key, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'File upload failed' });
  }
}




   
 