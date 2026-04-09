import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

function sanitiseName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

function getProjectPath(clientName, projectName) {
  return path.join(__dirname, 'client-sites', sanitiseName(clientName), sanitiseName(projectName));
}

app.post('/api/save-files', (req, res) => {
  const { clientName, projectName, files } = req.body;

  if (!clientName || !projectName || !Array.isArray(files)) {
    return res.status(400).json({ error: 'clientName, projectName, and files are required' });
  }

  const folderPath = getProjectPath(clientName, projectName);

  try {
    fs.mkdirSync(folderPath, { recursive: true });

    for (const file of files) {
      const filePath = path.join(folderPath, file.filename);
      const fileDir = path.dirname(filePath);
      fs.mkdirSync(fileDir, { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf8');
    }

    res.json({ success: true, path: folderPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/open-folder', (req, res) => {
  const { clientName, projectName } = req.body;

  if (!clientName || !projectName) {
    return res.status(400).json({ error: 'clientName and projectName are required' });
  }

  const folderPath = getProjectPath(clientName, projectName);

  exec(`explorer "${folderPath}"`, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});
