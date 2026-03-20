# Dor.ai Server

Backend for the Dor.ai swim journal app.

## Deploy on Railway

1. Connect this repo to Railway
2. Add environment variable: `ANTHROPIC_API_KEY=your_key_here`
3. Railway auto-deploys on every push

## Endpoints

- `GET /` — health check
- `POST /chat` — proxies to Anthropic API
- `GET /data` — get all stored data
- `POST /data/swim` — save a swim
- `POST /data/memory` — update memory blob
- `POST /data/goals` — update goals
