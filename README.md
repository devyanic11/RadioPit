# 🏎️ PITWALL — The Silent Co-Driver

**AI that hears what race engineers miss.** Pitwall analyzes real F1 team-radio audio, measures driver stress / frustration / fatigue / mental load from voice and language, correlates it with real lap times, and tells the engineer what to do about it — all running locally, powered by Hugging Face.

> Hackathon theme: *Artificial Intelligence in Racing Strategy & Decision-Making — Powered by Hugging Face*

## How it works

```
Real F1 radio (OpenF1 API)  ──┐
Uploaded / mic audio  ────────┤
                              ▼
                    ffmpeg → 16kHz WAV
                              ▼
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  ASR (Whisper)      Acoustic emotion         Prosody DSP
  faster-whisper     wav2vec2 A/V/D           Praat: pitch, rate,
  word timestamps    regression               jitter, HNR, pauses
  + confidence            │                        │
        │                 │                        │
        ▼                 │                        │
  NLP (DistilBERT)        │                        │
  sentiment + F1          │                        │
  keywords + urgency      │                        │
        └────────┬────────┴────────────────────────┘
                 ▼
        Fusion engine  (35% acoustic · 25% prosody · 25% NLP · 15% keywords)
                 ▼
   Stress / Frustration / Fatigue / Mental Load  (+ per-window time series)
                 ▼
   Engineer recommendations · Explainable sub-scores · Real lap-time correlation
```

### Models (Hugging Face)

| Role | Model | Output |
|---|---|---|
| Speech-to-text | `faster-whisper tiny.en` (CTranslate2 Whisper) | transcript, word timestamps, word-probability confidence |
| Acoustic emotion (primary) | `audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim` | arousal / dominance / valence regression (0–1) |
| Acoustic emotion (fallback) | `superb/wav2vec2-base-superb-er` | 4-way emotion → A/V/D mapping |
| Text sentiment | `distilbert-base-uncased-finetuned-sst-2-english` | positive/negative sentiment |

All models download once from the Hugging Face Hub and run **locally on CPU** — no API keys, no cloud inference. A pure-DSP heuristic (librosa) is the final fallback tier so the pipeline degrades gracefully offline.

### Real data (OpenF1)

On first startup the backend pulls **real team-radio clips** and **real lap times** from the free [OpenF1 API](https://openf1.org) (default session: 2026 Hungarian GP Race) and caches them in `backend/static/clips/` for offline use. Each radio message is matched to the lap it was transmitted on via timestamps, so the stress-vs-lap-time chart uses genuine data. Switch sessions with:

```bash
PITWALL_SESSION_KEY=<openf1_session_key> python -m uvicorn api.main:app --port 8000
# or at runtime: POST /api/sample-clips/refresh?session_key=...
```

### What makes the scores trustworthy

- **Multi-signal fusion** — voice tone, prosody, and language are scored independently, then fused with fixed weights. The UI's "Why this score" panel shows every sub-score, detected keyword, and prosody stat behind each number.
- **Real per-window dynamics** — the live-motion time series is driven by measured per-window RMS energy and Praat pitch deviation, not animation tricks.
- **Honest confidence** — reported confidence is Whisper's mean word-level probability.
- **Engineer actions** — a deterministic rules layer converts driver state + detected complaints into prioritized radio-handling guidance, each with its triggering signal attached.

## Quick start

### Backend (FastAPI)

```bash
cd backend
brew install portaudio ffmpeg        # macOS audio deps
pip install -r requirements.txt
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

First run downloads HF models (~1GB total) and the OpenF1 radio clips; later runs use local caches.

### Frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173`. The dashboard header shows **LIVE** when the backend is connected; without it, the UI runs in a clearly-labeled DEMO simulation.

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | model availability + clip count |
| `POST /api/analyze` | analyze uploaded audio (wav/mp3/ogg/webm) |
| `GET /api/sample-clips` | real radio clip library metadata |
| `GET /api/sample-clips/{id}/audio` | clip audio stream |
| `POST /api/analyze-sample/{id}` | run full pipeline on a library clip |
| `POST /api/sample-clips/refresh` | re-fetch library (optional `session_key`) |
| `GET /api/timeline` | analysis history |

## Notes

- Radio audio and lap data © Formula 1 via the public OpenF1 API — used here for a non-commercial hackathon demo.
- The audeering emotion model is CC-BY-NC-SA-4.0 (non-commercial).
