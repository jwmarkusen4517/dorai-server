const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
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

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok' }));

app.get('/test-key', (req, res) => {
  const key = ANTHROPIC_API_KEY || '';
  res.json({ key_set: !!key, key_length: key.length, key_prefix: key.slice(0, 14) + '...' });
});

app.post('/chat', async (req, res) => {
  const { system, messages, max_tokens = 1000 } = req.body;
  if (!system || !messages) return res.status(400).json({ error: 'Missing system or messages' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
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
