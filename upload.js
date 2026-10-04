const fs = require('fs');
const path = require('path');

const API = 'http://localhost:3000/api/v1/blob_store';
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

async function uploadFile() {
  const filePath = 'test.pdf';
  const stats = fs.statSync(filePath);

  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`);
  }

  // 1. Get a fresh signed upload URL
  const api = await fetch(`${API}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId: '6ac245103c2293138c4d3e52',
      documentType: 'referrals',
      fileName: path.basename(filePath), // e.g. "test2.pdf"
    }),
  });
  if (!api.ok) throw new Error(`API failed (${api.status}): ${await api.text()}`);
  const { url, objectKey } = await api.json();

  // 2. Upload immediately
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: fs.readFileSync(filePath),
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${await response.text()}`);
  }

  console.log(`Upload successful! Stored at ${objectKey}`);
}

uploadFile().catch((err) => console.error(err.message));