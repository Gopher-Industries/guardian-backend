const fs = require('fs');

async function downloadFile() {
  const params = new URLSearchParams({
    patientId: '6a3f8ea9c14556091e6e0e50',
    documentType: 'referrals',
    fileName: 'referral.pdf',
  });

  const api = await fetch(`http://localhost:3000/api/v1/blob_store/download-url?${params}`);
  if (!api.ok) throw new Error(`API failed: ${api.status} ${await api.text()}`);
  const { url } = await api.json();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}\n${await res.text()}`);

  fs.writeFileSync('test4.pdf', Buffer.from(await res.arrayBuffer()));
  console.log('Downloaded successfully to test4.pdf');
}

downloadFile().catch(console.error);

