const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

let store = { swimLog: [], goals: [], memory: '' };

app.get('/', (req, res) => {
  res.json({ status: 'ok', swims: store.swimLog.length });
});

app.get('/test-key', (req, res) => {
  const key = ANTHROPIC_API_KEY || '';
  res.json({
    key_set: !!key,
    key_length: key.length,
    key_prefix: key.slice(0, 14) + '...'
  });
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
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens,
        system,
        messages
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/data', (req, res) => res.json(store));

app.post('/data', (req, res) => {
  const { swimLog, goals, memory } = req.body;
  if (swimLog !== undefined) store.swimLog = swimLog;
  if (goals !== undefined) store.goals = goals;
  if (memory !== undefined) store.memory = memory;
  res.json({ ok: true });
});

app.post('/data/swim', (req, res) => {
  store.swimLog.push(req.body);
  res.json({ ok: true, total: store.swimLog.length });
});

app.post('/data/memory', (req, res) => {
  store.memory = req.body.memory || '';
  res.json({ ok: true });
});

app.post('/data/goals', (req, res) => {
  store.goals = req.body.goals || [];
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Dor.ai server running on port ${PORT}`));
