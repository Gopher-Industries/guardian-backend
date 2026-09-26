// src/r2-client.js
require('dotenv/config');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');


const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;

async function getSignedUploadUrl(objectKey, contentType, expiresInSeconds = 3600) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

async function getSignedDownloadUrl(objectKey, expiresInSeconds = 3600, filename) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${filename}"`, // forces real download, not inline view
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}


async function getList(prefix){
  const params = {
    Bucket: BUCKET,
    ...(prefix ? { Prefix: prefix } : {}),
  };
  const result = await s3.send(new ListObjectsV2Command(params));
  return result;
}


async function uploadGeneratedPdf(pdfBytes, objectKey) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
    Body: pdfBytes,
    ContentType: 'application/pdf',
  }));
  return objectKey;
}

module.exports = { getSignedUploadUrl, getSignedDownloadUrl, getList, uploadGeneratedPdf };