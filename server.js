const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const multer = require('multer');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS store (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  console.log('DB ready');
}

async function dbGet(key, fallback = null) {
  try {
    const res = await pool.query('SELECT value FROM store WHERE key = $1', [key]);
    return res.rows.length ? JSON.parse(res.rows[0].value) : fallback;
  } catch { return fallback; }
}

async function dbSet(key, value) {
  await pool.query(
    'INSERT INTO store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, JSON.stringify(value)]
  );
}

// ── File parsing ──────────────────────────────────────────────────────────────
async function extractText(buffer, mimetype, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();

  if (ext === 'pdf' || mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === 'docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === 'xlsx' || ext === 'xls' || mimetype.includes('spreadsheet') || mimetype.includes('excel')) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
    }).join('\n\n');
  }

  if (ext === 'pptx' || mimetype.includes('presentationml')) {
    // Extract text from pptx as xlsx (both are zip-based Office formats)
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      return XLSX.utils.sheet_to_csv(sheet);
    }).join('\n');
  }

  if (ext === 'txt' || ext === 'csv' || mimetype.startsWith('text/')) {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok' }));

app.get('/test-key', (req, res) => {
  const key = ANTHROPIC_API_KEY || '';
  res.json({ key_set: !!key, key_length: key.length, key_prefix: key.slice(0, 14) + '...' });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    const truncated = text.slice(0, 20000); // cap at ~20k chars to stay within context limits
    res.json({
      ok: true,
      filename: req.file.originalname,
      text: truncated,
      truncated: text.length > 20000
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/chat', async (req, res) => {
  const { system, messages, max_tokens = 1000 } = req.body;
  if (!system || !messages) return res.status(400).json({ error: 'Missing system or messages' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens, system, messages })
    });
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/data', async (req, res) => {
  const swimLog = await dbGet('swimLog', []);
  const goals   = await dbGet('goals', []);
  const memory  = await dbGet('memory', '');
  res.json({ swimLog, goals, memory });
});

app.post('/data/swim', async (req, res) => {
  const swimLog = await dbGet('swimLog', []);
  swimLog.push(req.body);
  await dbSet('swimLog', swimLog);
  res.json({ ok: true, total: swimLog.length });
});

app.post('/data/memory', async (req, res) => {
  await dbSet('memory', req.body.memory || '');
  res.json({ ok: true });
});

app.post('/data/goals', async (req, res) => {
  await dbSet('goals', req.body.goals || []);
  res.json({ ok: true });
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`Dor.ai server running on port ${PORT}`));
});
