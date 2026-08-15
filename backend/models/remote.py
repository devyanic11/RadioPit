"""Remote inference client — calls the deployed Modal endpoints when configured.

`modal deploy backend/modal_app.py` prints one URL per endpoint, e.g.:
    https://<user>--radiopit-inference-inference-transcribe.modal.run
    https://<user>--radiopit-inference-inference-emotion.modal.run

Set them as:
    RADIOPIT_MODAL_TRANSCRIBE_URL=...
    RADIOPIT_MODAL_EMOTION_URL=...
    RADIOPIT_MODAL_URL=1          # enables 'modal' backend mode

Every function returns None on failure so callers fall back to local CPU models.
"""
import base64
import io
import logging
import os

import numpy as np
import requests

TRANSCRIBE_URL = os.environ.get('RADIOPIT_MODAL_TRANSCRIBE_URL')
EMOTION_URL = os.environ.get('RADIOPIT_MODAL_EMOTION_URL')


def _audio_b64(audio_array, sample_rate=16000):
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, np.asarray(audio_array, dtype=np.float32), sample_rate, format='WAV')
    return base64.b64encode(buf.getvalue()).decode()


def _post(url, audio_array, sample_rate):
    resp = requests.post(url, json={'audio_b64': _audio_b64(audio_array, sample_rate)}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def modal_transcribe(audio_array, sample_rate=16000):
    if not TRANSCRIBE_URL:
        return None
    try:
        return _post(TRANSCRIBE_URL, audio_array, sample_rate)
    except Exception as e:
        logging.warning(f"Modal transcribe failed, falling back to local: {e}")
        return None


def modal_emotion(audio_array, sample_rate=16000):
    if not EMOTION_URL:
        return None
    try:
        return _post(EMOTION_URL, audio_array, sample_rate)
    except Exception as e:
        logging.warning(f"Modal emotion failed, falling back to local: {e}")
        return None
