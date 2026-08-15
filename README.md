# 🏎️ RADIOPIT — The Stress-vs-Laptime Story of Any F1 Radio

**Pick a Grand Prix. Pick a driver. Hit RUN.** RadioPit imports their real team-radio messages, transcribes them, reads the emotion in their voice, and pins every message onto the official lap-time trace — so you can see exactly how the driver's state and their pace moved together.

> Hackathon theme: *Artificial Intelligence in Racing Strategy & Decision-Making — Powered by Hugging Face*

## The recipe

* **Real audio** — genuine team radio from the Hugging Face dataset [`MikCil/f1-team-radio`](https://huggingface.co/datasets/MikCil/f1-team-radio): 14,681 clips, 149 Grands Prix (2018–2025), 43 drivers, each with a UTC timestamp and a human ground-truth transcription.
* **Real lap times** — pulled from **FastF1** (official F1 timing): lap times, sectors, stints, positions.
* **Real AI** — Hugging Face models do the perception: speech → text (Whisper), speech → emotion (wav2vec2 arousal/dominance/valence regression), text → sentiment (DistilBERT), plus classical Praat prosody DSP. Fused into Stress / Frustration / Fatigue / Mental Load with a fully explainable breakdown.
* **One screen** — race + driver selectors, a RUN button, the lap-time chart with stress dots at the exact laps radio was called, a clip strip, and a detail panel showing the audio, Whisper-vs-ground-truth transcripts, why-this-score bars, and engineer recommendations.

## How a story is built

```
HF dataset (metadata index, one-time)          FastF1 (official timing)
        │  clips for race + driver                     │  laps, sectors, stints
        ▼                                              ▼
   MP3 download  ──────  UTC timestamp matching  ──  lap N
        │
        ▼  per clip, on RUN
   Whisper (speech→text) ─┐
   wav2vec2 A/D/V  ───────┤→ fusion (35/25/25/15) → stress + 3 more metrics
   Praat prosody DSP ─────┤       │
   DistilBERT sentiment ──┘       ▼
                        stress dot on the lap chart
                        + engineer recommendation
                        + Whisper vs ground-truth accuracy
```

## Models

| Role             | Model                                                                          | Where it runs      |
| ---------------- | ------------------------------------------------------------------------------ | ------------------ |
| Speech → text    | `faster-whisper tiny.en` (local) / `openai/whisper-large-v3-turbo` (Modal GPU) | local CPU or Modal |
| Speech → emotion | `audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim`                        | local CPU or Modal |
| Text sentiment   | `distilbert-base-uncased-finetuned-sst-2-english`                              | local CPU          |
| Prosody          | Praat (parselmouth) — pitch, rate, jitter, HNR                                 | local, no model    |

See `MODELS.md` / the models doc for benchmarks and demo talking points.

## Quick start

### Backend

```bash
cd backend
brew install ffmpeg               # macOS
pip install -r requirements.txt
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

First start builds a one-time index of the HF dataset (~2 min) and caches it. The first load of each race downloads its radio clips and FastF1 timing (~30–60s), then everything is cached and works offline.

### Frontend

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173` — defaults to the 2021 Abu Dhabi decider.

### Optional: GPU inference on Modal

```bash
pip install modal
modal setup
modal deploy backend/modal_app.py
# then export the two printed endpoint URLs:
RADIOPIT_MODAL_TRANSCRIBE_URL=... RADIOPIT_MODAL_EMOTION_URL=... RADIOPIT_MODAL_URL=1 \
  python -m uvicorn api.main:app --port 8000
```

Whisper large-v3-turbo + the emotion model then run on a Modal T4; the backend automatically falls back to local CPU models if Modal is unreachable.

## API

| Endpoint                                   | Description                                               |
| ------------------------------------------ | --------------------------------------------------------- |
| `GET /api/health`                          | model + dataset-index status                              |
| `GET /api/races`                           | all Grands Prix in the dataset                            |
| `GET /api/races/{race_id}/drivers`         | drivers with radio in that race                           |
| `GET /api/story/{race_id}/{racing_number}` | clips + official laps, timestamp-matched                  |
| `POST /api/story/clips/{clip_id}/analyze`  | full pipeline on one clip (incl. ground-truth comparison) |
| `POST /api/analyze`                        | analyze your own uploaded/recorded audio                  |

## Notes

- Dataset: CC-BY-4.0 (`MikCil/f1-team-radio`). Emotion model: CC-BY-NC-SA-4.0 (non-commercial). Timing data via FastF1 for research/demo use.
- The pipeline is fully honest: no synthetic data, no fabricated numbers — every value on screen traces to the dataset, FastF1, or a model output.
