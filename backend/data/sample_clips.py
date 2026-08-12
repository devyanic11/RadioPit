"""Sample clip manager — real F1 team radio via OpenF1, with offline fallback.

Startup flow:
 1. If a valid cached library exists in static/clips (downloaded on a previous
    run), load it — works fully offline.
 2. Otherwise fetch real team-radio clips + lap data from OpenF1 and cache them.
 3. If OpenF1 is unreachable and no cache exists, generate clearly-labeled
    synthetic clips so the demo still runs.
"""
import os
import json
import logging
import numpy as np
import scipy.io.wavfile as wavfile
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from data.openf1_client import OpenF1Client

MIN_CLIP_BYTES = 8_000  # skip near-empty recordings
MIN_CLIP_SEC = 2.5      # skip "copy, understood" clutter
CACHE_VERSION = 2       # bump to invalidate old caches (e.g. pre-clutter-filter)


def _probe_duration(filepath) -> float:
    """Audio duration in seconds via ffprobe; 0.0 if unavailable."""
    import subprocess
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-of', 'csv=p=0', '-show_entries', 'format=duration', filepath],
            capture_output=True, text=True, timeout=10
        )
        return float(out.stdout.strip())
    except Exception:
        return 0.0


class SampleClipManager:
    """Manages the radio clip library used by the demo UI."""

    def __init__(self):
        self.clips_dir = config.AUDIO_DIR
        self.metadata_file = os.path.join(self.clips_dir, 'metadata.json')
        self.clips = []
        self.session_label = None
        self.session_key = None

    # ------------------------------------------------------------------
    # Entry point (called from FastAPI lifespan)
    # ------------------------------------------------------------------
    def generate_sample_clips(self, force_refresh=False, session_key=None):
        os.makedirs(self.clips_dir, exist_ok=True)

        if not force_refresh and self._load_cache():
            logging.info(f"Loaded {len(self.clips)} cached real radio clips ({self.session_label})")
            return

        try:
            self._fetch_from_openf1(session_key or config.OPENF1_SESSION_KEY)
            logging.info(f"Fetched {len(self.clips)} real radio clips from OpenF1 ({self.session_label})")
        except Exception as e:
            logging.warning(f"OpenF1 fetch failed ({e}); falling back to synthetic clips")
            self._generate_synthetic_fallback()

    # ------------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------------
    def _load_cache(self) -> bool:
        if not os.path.exists(self.metadata_file):
            return False
        try:
            with open(self.metadata_file) as f:
                data = json.load(f)
            clips = data.get('clips', [])
            if not clips or data.get('source') != 'openf1':
                return False
            if data.get('cache_version') != CACHE_VERSION:
                return False
            if not all(os.path.exists(c.get('file_path', '')) for c in clips):
                return False
            self.clips = clips
            self.session_label = data.get('session_label')
            self.session_key = data.get('session_key')
            return True
        except Exception:
            return False

    def _save_cache(self, source):
        with open(self.metadata_file, 'w') as f:
            json.dump({
                'source': source,
                'cache_version': CACHE_VERSION,
                'session_label': self.session_label,
                'session_key': self.session_key,
                'clips': self.clips
            }, f, indent=2)

    # ------------------------------------------------------------------
    # Real data: OpenF1
    # ------------------------------------------------------------------
    def _fetch_from_openf1(self, session_key):
        client = OpenF1Client()

        session = client.get_session_info(session_key)
        drivers = client.get_drivers(session_key)
        radio = client.get_team_radio(session_key)
        if not radio:
            raise RuntimeError(f"No team radio found for session {session_key}")

        self.session_label = " ".join(str(x) for x in [
            session.get('year', ''),
            session.get('country_name', ''),
            session.get('session_name', '')
        ] if x).strip() or f"Session {session_key}"
        self.session_key = session_key

        laps_by_driver = {}
        clips = []
        per_driver_count = {}

        for item in sorted(radio, key=lambda r: r.get('date', '')):
            if len(clips) >= config.OPENF1_MAX_CLIPS:
                break

            dn = item.get('driver_number')
            url = item.get('recording_url')
            if dn is None or not url:
                continue
            if per_driver_count.get(dn, 0) >= config.OPENF1_MAX_PER_DRIVER:
                continue

            if dn not in laps_by_driver:
                try:
                    laps_by_driver[dn] = client.get_laps(session_key, dn)
                except Exception:
                    laps_by_driver[dn] = []

            lap = OpenF1Client.match_radio_to_lap(item.get('date'), laps_by_driver[dn])
            if not lap.get('lap_number'):
                continue  # pre-race / formation chatter — skip

            clip_id = f"clip_{len(clips) + 1}"
            filename = f"{clip_id}.mp3"
            filepath = os.path.join(self.clips_dir, filename)

            if not client.download_file(url, filepath):
                continue

            duration = _probe_duration(filepath)
            if os.path.getsize(filepath) < MIN_CLIP_BYTES or (0 < duration < MIN_CLIP_SEC):
                try:
                    os.remove(filepath)
                except OSError:
                    pass
                continue  # too short — "copy" clutter

            drv = drivers.get(dn, {})
            acronym = drv.get('name_acronym', f"#{dn}")
            lap_number = lap.get('lap_number')
            lap_duration = lap.get('lap_duration')

            clips.append({
                'id': clip_id,
                'name': f"{acronym} — Lap {lap_number}" if lap_number else f"{acronym} radio",
                'description': f"Real team radio · {self.session_label}",
                'driver': acronym,
                'driver_full_name': drv.get('full_name'),
                'team': drv.get('team_name'),
                'driver_number': dn,
                'lap_number': lap_number,
                'lap_duration': lap_duration,
                'duration_sec': round(duration, 1) if duration else None,
                'date': item.get('date'),
                'recording_url': url,
                'source': 'openf1',
                'synthetic': False,
                'file_path': filepath
            })
            per_driver_count[dn] = per_driver_count.get(dn, 0) + 1

        if not clips:
            raise RuntimeError("No radio clips could be downloaded")

        self.clips = clips
        self._save_cache('openf1')

    # ------------------------------------------------------------------
    # Offline fallback: synthetic audio (clearly labeled)
    # ------------------------------------------------------------------
    def _generate_synthetic_fallback(self):
        self.session_label = "Offline demo (synthetic audio)"
        clip_defs = [
            ('Calm Update', 'LOW', 'Box this lap, tyres are fine, pace is good', 'low', 12),
            ('Moderate Concern', 'MODERATE', 'Rear tyres starting to go off, losing grip through Turn 4', 'moderate', 18),
            ('High Stress', 'HIGH', "I'm losing the rear! The car is undriveable in the high speed!", 'high', 24),
            ('Critical Failure', 'CRITICAL', "NO POWER! NO POWER! Something's broken!", 'critical', 25),
        ]

        clips = []
        for i, (name, expected, transcript, level, lap_number) in enumerate(clip_defs, start=1):
            clip_id = f"clip_{i}"
            filepath = os.path.join(self.clips_dir, f"{clip_id}.wav")
            audio = self._generate_synthetic_speech(3, level)
            wavfile.write(filepath, 16000, audio)
            clips.append({
                'id': clip_id,
                'name': f"{name} (synthetic)",
                'description': 'Synthetic fallback clip — OpenF1 unreachable',
                'driver': 'DEMO',
                'team': None,
                'lap_number': lap_number,
                'lap_duration': None,
                'expected_stress': expected,
                'transcript': transcript,
                'source': 'synthetic',
                'synthetic': True,
                'file_path': filepath
            })

        self.clips = clips
        self._save_cache('synthetic')

    def _generate_synthetic_speech(self, duration_sec, stress_level, sr=16000):
        """Generates synthetic audio resembling speech with varied stress markers."""
        t = np.linspace(0, duration_sec, int(sr * duration_sec))

        if stress_level == 'low':
            f0 = 120 + 5 * np.sin(2 * np.pi * 2 * t)
            energy_envelope = np.clip(np.sin(2 * np.pi * 3 * t), 0, 1) * 0.4
            noise = np.random.normal(0, 0.05, len(t))
        elif stress_level == 'moderate':
            f0 = 140 + 20 * t / duration_sec + 10 * np.sin(2 * np.pi * 4 * t)
            energy_envelope = np.clip(np.sin(2 * np.pi * 4 * t), 0, 1) * 0.6
            noise = np.random.normal(0, 0.1, len(t))
        elif stress_level == 'high':
            f0 = 180 + 40 * np.sin(2 * np.pi * 8 * t) + np.random.normal(0, 5, len(t))
            energy_envelope = np.clip(np.sin(2 * np.pi * 5 * t), 0, 1) * 0.8
            noise = np.random.normal(0, 0.2, len(t))
        else:  # critical
            f0 = 250 + 60 * np.sin(2 * np.pi * 12 * t) + np.random.normal(0, 15, len(t))
            energy_envelope = np.ones(len(t)) * 0.9
            noise = np.random.normal(0, 0.3, len(t))

        phase = np.cumsum(2 * np.pi * f0 / sr)
        audio = energy_envelope * (np.sin(phase) + noise)
        pause_mask = np.random.rand(len(t)) > 0.95
        audio[pause_mask] = audio[pause_mask] * 0.1
        audio = np.int16(audio / np.max(np.abs(audio)) * 32767 * 0.9)
        return audio

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------
    def get_clips_metadata(self):
        return {
            'session_label': self.session_label,
            'clips': [{k: v for k, v in c.items() if k != 'file_path'} for c in self.clips]
        }

    def get_clip(self, clip_id):
        for c in self.clips:
            if c['id'] == clip_id:
                return c
        return None
