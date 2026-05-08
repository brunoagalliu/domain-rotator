const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const https = require('https');
const archiver = require('archiver');
const os = require('os');

function getClient() {
  return axios.create({
    baseURL: `https://${process.env.CPANEL_HOST}/execute`,
    headers: { Authorization: `cpanel ${process.env.CPANEL_USER}:${process.env.CPANEL_TOKEN}` },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 120000,
  });
}

function createZip(sourceFolder) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `lander-${Date.now()}.zip`);
    const output = fs.createWriteStream(tmpPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve(tmpPath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceFolder, false); // files at zip root, no wrapper folder
    archive.finalize();
  });
}

async function uploadLander(landerFolder, docRoot) {
  const client = getClient();
  const zipPath = await createZip(landerFolder);

  try {
    // 1. Upload zip to the domain's doc root
    const form = new FormData();
    form.append('dir', docRoot);
    form.append('file-1', fs.createReadStream(zipPath), {
      filename: 'lander.zip',
      contentType: 'application/zip',
    });

    const uploadRes = await client.post('/Fileman/upload_files', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    if (uploadRes.data.status !== 1) {
      const errors = (uploadRes.data.errors || []).join(', ') || JSON.stringify(uploadRes.data);
      throw new Error(`cPanel upload failed: ${errors}`);
    }

    // 2. Extract zip in place
    const extractRes = await client.post(
      '/Fileman/extract',
      new URLSearchParams({ destdir: docRoot, file: `${docRoot}/lander.zip` }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (extractRes.data.status !== 1) {
      const errors = (extractRes.data.errors || []).join(', ') || JSON.stringify(extractRes.data);
      throw new Error(`cPanel extract failed: ${errors}`);
    }

    // 3. Delete the zip from the server
    await client.post(
      '/Fileman/delete',
      new URLSearchParams({
        files: JSON.stringify([`${docRoot}/lander.zip`]),
        doublecheck: '1',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  } finally {
    fs.unlink(zipPath, () => {});
  }
}

module.exports = { uploadLander };
