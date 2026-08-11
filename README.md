# 🏎️ PITWALL — F1 Driver Voice Stress & Real-Time Telemetry Platform

PITWALL is a 100% free, open-source real-time F1 driver radio telemetry dashboard powered by **KoljaB/RealtimeSTT**, **Hugging Face Transformers**, and **Classical Audio DSP**.

## 🌟 Key Features

- **KoljaB/RealtimeSTT Speech-to-Text**: Real-time voice transcription with sub-second word-timestamp alignment using `faster-whisper`.
- **YouTube-Style Real-Time Subtitles**: Instant 0ms word streaming (`currentTime >= start`), showing max 8 spoken words with glowing active word highlighting.
- **Hugging Face Multi-Model Fusion Engine**:
  - **Acoustic Arousal/Valence**: `superb/wav2vec2-base-superb-er`
  - **NLP Sentiment & Urgency**: `distilbert-base-uncased-finetuned-sst-2-english`
  - **Classical DSP Prosody**: Zero-lag pitch variation, speech rate, and vocal intensity extraction.
- **Driver State Telemetry (4 Metrics)**:
  - 🧠 **Stress** (0–100%)
  - 🔥 **Frustration** (0–100%)
  - 🔋 **Fatigue** (0–100%)
  - ⚡ **Mental Load** (0–100%)
- **F1 Telemetry Dashboard UI**: Built with Vite + React, glassmorphic racing aesthetic, Recharts driver state time-series, alerts & radio timeline, and bottom session performance overview.

## 🚀 Quick Start

### 1. Backend Setup (FastAPI + RealtimeSTT)

```bash
cd backend

# Install macOS audio dependency
brew install portaudio

# Install dependencies
pip install -r requirements.txt
pip install "RealtimeSTT[faster-whisper]" silero-vad

# Start backend server
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup (Vite + React)

```bash
cd frontend

# Install dependencies
npm install

# Start frontend dev server
npm run dev -- --port 5173
```

Access the dashboard at `http://localhost:5173`.
# Pitwall
