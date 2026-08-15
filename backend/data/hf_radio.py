"""Hugging Face team-radio dataset client (MikCil/f1-team-radio).

The dataset has 14.7K real F1 radio clips (2018-2025) with driver, race,
UTC message timestamp and a human ground-truth transcription.

Strategy:
 - Build a one-time local metadata index by paging the HF datasets-server
   /rows API (audio URLs are signed + expiring, so they are NOT stored).
 - For a chosen race + driver, re-fetch those row ranges to get fresh
   signed audio URLs and download the MP3s into the local cache.
"""
import os
import json
import logging
import threading
import time
import sys
import requests

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

DATASET = "MikCil/f1-team-radio"
ROWS_API = "https://datasets-server.huggingface.co/rows"
PAGE = 100
THROTTLE_SEC = 0.6     # be polite to the datasets server
MAX_RETRIES = 10


class HFRadioClient:
    def __init__(self):
        self.story_dir = os.path.join(os.path.dirname(config.AUDIO_DIR), 'story')
        os.makedirs(self.story_dir, exist_ok=True)
        self.index_file = os.path.join(self.story_dir, 'index.json')
        self.index = []          # [{row_idx, race_id, grand_prix, racing_number, driver_id, ts, transcription}]
        self.index_ready = False
        self.index_progress = 0.0
        self.index_error = None
        self.http = requests.Session()
        self.http.headers.update({"User-Agent": "RadioPit/1.0 (hackathon demo)"})
        hf_token = os.environ.get('HF_TOKEN')
        if hf_token:
            self.http.headers.update({"Authorization": f"Bearer {hf_token}"})
        self.partial_file = os.path.join(self.story_dir, 'index_partial.json')
        self._building = False
        self._load_index()

    def _get_rows_page(self, offset, length):
        """GET /rows with retry + backoff on 429/5xx."""
        for attempt in range(MAX_RETRIES):
            try:
                resp = self.http.get(ROWS_API, params={
                    'dataset': DATASET, 'config': 'default', 'split': 'train',
                    'offset': offset, 'length': length
                }, timeout=60)
                if resp.status_code == 429 or resp.status_code >= 500:
                    wait = float(resp.headers.get('Retry-After') or 0) or min(2 ** attempt * 2, 90)
                    logging.info(f"HF rows API {resp.status_code} at offset {offset}; retrying in {wait:.0f}s")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as e:
                wait = min(2 ** attempt * 2, 90)
                logging.info(f"HF rows API error at offset {offset} ({e}); retrying in {wait:.0f}s")
                time.sleep(wait)
        raise RuntimeError(f"HF datasets server unavailable after {MAX_RETRIES} retries (offset {offset})")

    # ------------------------------------------------------------------
    # Index
    # ------------------------------------------------------------------
    def _load_index(self):
        try:
            if os.path.exists(self.index_file):
                with open(self.index_file) as f:
                    self.index = json.load(f)
                if self.index:
                    self.index_ready = True
                    self.index_progress = 1.0
                    logging.info(f"HF radio index loaded: {len(self.index)} clips")
        except Exception:
            self.index = []

    def build_index_async(self):
        if self.index_ready or self._building:
            return
        self._building = True
        self.index_error = None
        threading.Thread(target=self._build_index, daemon=True).start()

    def _build_index(self):
        logging.info(f"Building HF radio index from {DATASET} (one-time, resumable)...")
        rows = []
        offset = 0
        total = None

        # Resume from a previous partial run
        try:
            if os.path.exists(self.partial_file):
                with open(self.partial_file) as f:
                    partial = json.load(f)
                rows = partial.get('rows', [])
                offset = partial.get('offset', 0)
                total = partial.get('total')
                logging.info(f"Resuming HF index from offset {offset}")
        except Exception:
            rows, offset, total = [], 0, None

        try:
            while total is None or offset < total:
                data = self._get_rows_page(offset, PAGE)
                total = data.get('num_rows_total', 0)
                for item in data.get('rows', []):
                    r = item.get('row', {})
                    rows.append({
                        'row_idx': item.get('row_idx'),
                        'race_id': r.get('race_id'),
                        'grand_prix': r.get('grand_prix'),
                        'racing_number': r.get('racing_number'),
                        'driver_id': r.get('driver_id'),
                        'ts': r.get('message_timestamp'),
                        'transcription': r.get('transcription')
                    })
                offset += PAGE
                self.index_progress = min(offset / max(total, 1), 1.0)

                # Persist partial progress so a crash/restart resumes
                if offset % 1000 == 0:
                    logging.info(f"HF index: {offset}/{total} rows")
                    with open(self.partial_file, 'w') as f:
                        json.dump({'offset': offset, 'total': total, 'rows': rows}, f)

                time.sleep(THROTTLE_SEC)

            self.index = rows
            with open(self.index_file, 'w') as f:
                json.dump(rows, f)
            if os.path.exists(self.partial_file):
                os.remove(self.partial_file)
            self.index_ready = True
            self.index_progress = 1.0
            logging.info(f"HF radio index built: {len(rows)} clips")
        except Exception as e:
            # Save whatever we have; next attempt resumes from here
            try:
                with open(self.partial_file, 'w') as f:
                    json.dump({'offset': offset, 'total': total, 'rows': rows}, f)
            except Exception:
                pass
            self.index_error = str(e)
            logging.error(f"HF index build failed at offset {offset} (will resume): {e}")
        finally:
            self._building = False

    # ------------------------------------------------------------------
    # Catalog
    # ------------------------------------------------------------------
    @staticmethod
    def acronym(driver_id):
        """MAXVER01 -> VER"""
        return driver_id[3:6].upper() if driver_id and len(driver_id) >= 6 else (driver_id or '?')

    def list_races(self):
        races = {}
        for r in self.index:
            rid = r['race_id']
            if rid not in races:
                races[rid] = {'race_id': rid, 'label': r['grand_prix'], 'clip_count': 0, 'drivers': set()}
            races[rid]['clip_count'] += 1
            races[rid]['drivers'].add(r['racing_number'])
        out = []
        for r in races.values():
            year = r['label'].split(' ')[0]
            out.append({
                'race_id': r['race_id'],
                'label': r['label'],
                'year': int(year) if year.isdigit() else 0,
                'clip_count': r['clip_count'],
                'driver_count': len(r['drivers'])
            })
        out.sort(key=lambda x: (-x['year'], x['label']))
        return out

    def list_drivers(self, race_id):
        drivers = {}
        for r in self.index:
            if r['race_id'] != race_id:
                continue
            dn = r['racing_number']
            if dn not in drivers:
                drivers[dn] = {
                    'racing_number': dn,
                    'driver_id': r['driver_id'],
                    'acronym': self.acronym(r['driver_id']),
                    'clip_count': 0
                }
            drivers[dn]['clip_count'] += 1
        return sorted(drivers.values(), key=lambda d: -d['clip_count'])

    # ------------------------------------------------------------------
    # Clips for a story
    # ------------------------------------------------------------------
    def get_story_rows(self, race_id, racing_number):
        rows = [r for r in self.index if r['race_id'] == race_id and r['racing_number'] == str(racing_number)]
        rows.sort(key=lambda r: r['ts'] or '')
        return rows

    def fetch_clips(self, race_id, racing_number, max_clips=None):
        """Download MP3s for a race+driver (cached). Returns clip metadata list."""
        max_clips = max_clips or config.STORY_MAX_CLIPS
        rows = self.get_story_rows(race_id, racing_number)[:max_clips]
        if not rows:
            return []

        clip_dir = os.path.join(self.story_dir, race_id)
        os.makedirs(clip_dir, exist_ok=True)

        # Figure out which rows still need downloading
        needed = []
        for r in rows:
            r['file_path'] = os.path.join(clip_dir, f"{r['row_idx']}.mp3")
            if not os.path.exists(r['file_path']) or os.path.getsize(r['file_path']) < 1000:
                needed.append(r)

        if needed:
            # Re-fetch fresh signed audio URLs via /rows for contiguous ranges
            idx_to_row = {r['row_idx']: r for r in needed}
            indices = sorted(idx_to_row.keys())
            ranges = []
            start = prev = indices[0]
            for i in indices[1:]:
                if i == prev + 1:
                    prev = i
                else:
                    ranges.append((start, prev))
                    start = prev = i
            ranges.append((start, prev))

            for (a, b) in ranges:
                data = self._get_rows_page(a, min(b - a + 1, PAGE))
                for item in data.get('rows', []):
                    ri = item.get('row_idx')
                    if ri not in idx_to_row:
                        continue
                    audio = item.get('row', {}).get('audio') or []
                    src = audio[0].get('src') if audio else None
                    if not src:
                        continue
                    try:
                        dl = self.http.get(src, timeout=60)
                        dl.raise_for_status()
                        with open(idx_to_row[ri]['file_path'], 'wb') as f:
                            f.write(dl.content)
                    except Exception as e:
                        logging.warning(f"Clip download failed (row {ri}): {e}")

        clips = []
        for r in rows:
            if not os.path.exists(r['file_path']):
                continue
            clips.append({
                'clip_id': str(r['row_idx']),
                'race_id': race_id,
                'racing_number': str(racing_number),
                'acronym': self.acronym(r['driver_id']),
                'ts': r['ts'],
                'transcription_gt': r['transcription'],
                'file_path': r['file_path'],
                'audio_url': f"/static/story/{race_id}/{r['row_idx']}.mp3"
            })
        return clips
