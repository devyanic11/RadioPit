import sys
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import shutil
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from audio.converter import convert_audio_to_wav
from engine.fusion import DriverStateEngine
from data.sample_clips import SampleClipManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

engine = DriverStateEngine()
sample_manager = SampleClipManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize Hugging Face models & sample clips."""
    logging.info("Starting up Pitwall Backend with Hugging Face models...")
    sample_manager.generate_sample_clips()
    logging.info(f"Loaded {len(sample_manager.clips)} sample clips")
    yield
    logging.info("Shutting down Pitwall Backend...")

app = FastAPI(title="Pitwall API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static audio files
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')
os.makedirs(os.path.join(static_dir, 'clips'), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "models": {
            "asr_huggingface": engine.asr.available,
            "acoustic_huggingface": engine.acoustic.available,
            "nlp_huggingface": engine.nlp.available
        },
        "sample_clips_loaded": len(sample_manager.clips)
    }


@app.post("/api/analyze")
async def analyze_audio(file: UploadFile = File(...), lap_number: int = None):
    """Analyze an uploaded audio file (webm, mp3, wav, ogg) using Hugging Face models."""
    try:
        ext = os.path.splitext(file.filename)[1] or '.wav'
        temp_file = f"/tmp/pitwall_upload_{os.getpid()}{ext}"
        
        with open(temp_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Convert to 16kHz WAV if needed (e.g. webm, mp3, ogg)
        wav_file = convert_audio_to_wav(temp_file)

        result = engine.analyze_utterance(wav_file, lap_number=lap_number)

        # Cleanup temp files
        for fpath in [temp_file, wav_file]:
            if os.path.exists(fpath) and fpath.startswith('/tmp/'):
                try:
                    os.remove(fpath)
                except Exception:
                    pass

        return result
    except Exception as e:
        logging.error(f"Hugging Face Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/timeline")
def get_timeline():
    return engine.get_timeline()


@app.get("/api/radio-timeline")
def get_radio_timeline():
    return engine.get_radio_timeline()


@app.get("/api/sample-clips")
def list_sample_clips():
    return sample_manager.get_clips_metadata()


@app.get("/api/sample-clips/{clip_id}/audio")
def get_sample_audio(clip_id: str):
    clip = sample_manager.get_clip(clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    if not os.path.exists(clip['file_path']):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(clip['file_path'], media_type="audio/wav")


@app.post("/api/analyze-sample/{clip_id}")
def analyze_sample(clip_id: str):
    clip = sample_manager.get_clip(clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    try:
        result = engine.analyze_utterance(
            clip['file_path'],
            lap_number=clip.get('lap_number'),
            transcript_hint=clip.get('transcript')
        )
        result['clip_info'] = clip
        return result
    except Exception as e:
        logging.error(f"Sample analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logging.info("WebSocket client connected")
    try:
        while True:
            data = await websocket.receive_bytes()
            try:
                import soundfile as sf
                import io
                audio_array, sr = sf.read(io.BytesIO(data))
                if len(audio_array) > 8000:
                    result = engine.analyze_utterance(audio_array)
                    await websocket.send_json(result)
            except Exception as e:
                logging.error(f"WS process error: {e}")

    except WebSocketDisconnect:
        logging.info("WebSocket client disconnected")
