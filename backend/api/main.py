import sys
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import shutil
import difflib
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from audio.converter import convert_audio_to_wav
from engine.fusion import DriverStateEngine
from data.hf_radio import HFRadioClient
from data.fastf1_timing import FastF1Timing

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

engine = DriverStateEngine()
hf_radio = HFRadioClient()
timing = FastF1Timing()

# In-memory story state: clips of the currently loaded race+driver
_story_clips = {}   # clip_id -> clip dict (with file_path, matched lap info)

# Persistent analysis cache — a clip's analysis is deterministic, so compute once.
_analysis_cache_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                    'static', 'story', 'analyses.json')
try:
    with open(_analysis_cache_file) as _f:
        _analysis_cache = json.load(_f)
except Exception:
    _analysis_cache = {}


def _save_analysis_cache():
    try:
        os.makedirs(os.path.dirname(_analysis_cache_file), exist_ok=True)
        with open(_analysis_cache_file, 'w') as f:
            json.dump(_analysis_cache, f)
    except Exception as e:
        logging.warning(f"Could not persist analysis cache: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Starting RadioPit backend (Hugging Face dataset + FastF1 + HF models)...")
    hf_radio.build_index_async()
    yield
    logging.info("Shutting down RadioPit backend...")

app = FastAPI(title="RadioPit API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')
os.makedirs(os.path.join(static_dir, 'story'), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "models": {
            "asr": engine.asr.available,
            "acoustic": engine.acoustic.available,
            "acoustic_tier": engine.acoustic.tier,
            "nlp": engine.nlp.available,
            "inference_backend": config.INFERENCE_BACKEND
        },
        "dataset_index": {
            "ready": hf_radio.index_ready,
            "progress": round(hf_radio.index_progress, 3),
            "clips": len(hf_radio.index),
            "error": hf_radio.index_error
        }
    }


@app.get("/api/races")
def list_races():
    """All Grand Prix events in the HF dataset (2018-2025)."""
    if not hf_radio.index_ready:
        # If a previous build attempt failed, kick off a resume
        if hf_radio.index_error:
            hf_radio.build_index_async()
        raise HTTPException(status_code=503, detail={
            "reason": "dataset_indexing",
            "progress": round(hf_radio.index_progress, 3),
            "error": hf_radio.index_error
        })
    return hf_radio.list_races()


@app.get("/api/races/{race_id}/drivers")
def list_drivers(race_id: str):
    if not hf_radio.index_ready:
        raise HTTPException(status_code=503, detail="Dataset index still building")
    drivers = hf_radio.list_drivers(race_id)
    if not drivers:
        raise HTTPException(status_code=404, detail="Race not found in dataset")
    return drivers


@app.get("/api/story/{race_id}/{racing_number}")
def load_story(race_id: str, racing_number: str):
    """Load a driver's race story: real lap times (FastF1) + radio clips (HF dataset),
    each clip matched to the lap it was transmitted on. Analysis runs separately."""
    if not hf_radio.index_ready:
        raise HTTPException(status_code=503, detail="Dataset index still building")

    try:
        t = timing.get_timing(race_id, racing_number)
    except Exception as e:
        logging.error(f"FastF1 timing error: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"FastF1 timing unavailable: {e}")

    try:
        clips = hf_radio.fetch_clips(race_id, racing_number)
    except Exception as e:
        logging.error(f"HF clip fetch error: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Clip download failed: {e}")

    story_clips = []
    matched = 0
    for c in clips:
        lap = FastF1Timing.match_clip_to_lap(c['ts'], t['laps'])
        c['lap'] = lap['lap'] if lap else None
        c['lap_time'] = lap['time'] if lap else None
        if c['lap'] is not None:
            matched += 1
        _story_clips[c['clip_id']] = c
        story_clips.append({k: v for k, v in c.items() if k != 'file_path'})
    logging.info(f"Story {race_id}/{racing_number}: {matched}/{len(clips)} clips matched to laps")

    return {
        'race_id': race_id,
        'race_label': t.get('race_label'),
        'driver': t.get('driver'),
        'laps': t.get('laps'),
        'best_lap': t.get('best_lap'),
        'total_laps': t.get('total_laps'),
        'clips': story_clips
    }


@app.post("/api/story/clips/{clip_id}/analyze")
def analyze_story_clip(clip_id: str):
    """Run the full HF fusion pipeline on one radio clip; includes
    Whisper-vs-ground-truth transcription comparison."""
    clip = _story_clips.get(clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not loaded — load the story first")

    # Cached? Return instantly (analysis is deterministic per clip)
    if clip_id in _analysis_cache:
        cached = dict(_analysis_cache[clip_id])
        cached['cached'] = True
        cached['clip'] = {k: v for k, v in clip.items() if k != 'file_path'}
        return cached

    try:
        result = engine.analyze_utterance(clip['file_path'])

        gt = (clip.get('transcription_gt') or '').strip()
        hyp = (result.get('transcript') or '').strip()
        similarity = difflib.SequenceMatcher(None, gt.lower(), hyp.lower()).ratio() if gt and hyp else None
        result['transcription_gt'] = gt
        result['asr_similarity'] = round(similarity, 3) if similarity is not None else None

        _analysis_cache[clip_id] = {k: v for k, v in result.items()}
        _save_analysis_cache()

        result['clip'] = {k: v for k, v in clip.items() if k != 'file_path'}
        return result
    except Exception as e:
        logging.error(f"Clip analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """Analyze user-uploaded audio (wav/mp3/ogg/webm) with the full pipeline."""
    try:
        ext = os.path.splitext(file.filename)[1] or '.wav'
        temp_file = f"/tmp/radiopit_upload_{os.getpid()}{ext}"
        with open(temp_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        wav_file = convert_audio_to_wav(temp_file)
        result = engine.analyze_utterance(wav_file)

        for fpath in [temp_file, wav_file]:
            if os.path.exists(fpath) and fpath.startswith('/tmp/'):
                try:
                    os.remove(fpath)
                except Exception:
                    pass
        return result
    except Exception as e:
        logging.error(f"Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
