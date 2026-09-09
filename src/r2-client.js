// npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner dotenv

require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;

// Upload a PDF to R2
async function uploadReferral(localFilePath, objectKey) {
  const fileBuffer = fs.readFileSync(localFilePath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
    Body: fileBuffer,
    ContentType: 'application/pdf',
  }));
  console.log(`Uploaded ${objectKey}`);
  return objectKey;
}

// Generate a time-limited signed URL to view/download a file
async function getSignedDownloadUrl(objectKey, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey });
  const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  return url;
}

module.exports = {
  uploadReferral,
  getSignedDownloadUrl,
};

