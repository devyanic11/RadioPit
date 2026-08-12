"""Race context — real per-driver session data from OpenF1, cached for offline use.

Provides everything the dashboard chrome needs to be genuine:
lap-time series, best lap, stints (tyre compound + age), position history.
"""
import os
import json
import logging
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from data.openf1_client import OpenF1Client


class RaceContextManager:
    def __init__(self):
        self.cache_file = os.path.join(config.AUDIO_DIR, 'race_context.json')
        self.contexts = {}
        self._load_cache()

    def _load_cache(self):
        try:
            if os.path.exists(self.cache_file):
                with open(self.cache_file) as f:
                    self.contexts = json.load(f)
        except Exception:
            self.contexts = {}

    def _save_cache(self):
        try:
            os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
            with open(self.cache_file, 'w') as f:
                json.dump(self.contexts, f)
        except Exception as e:
            logging.warning(f"Could not cache race context: {e}")

    def get_context(self, session_key, driver_number) -> dict:
        key = f"{session_key}_{driver_number}"
        if key in self.contexts:
            return self.contexts[key]

        client = OpenF1Client()
        session = client.get_session_info(session_key)
        drivers = client.get_drivers(session_key)
        laps = client.get_laps(session_key, driver_number)
        stints = client.get_stints(session_key, driver_number)
        positions = client.get_positions(session_key, driver_number)

        drv = drivers.get(int(driver_number), {})

        lap_rows = []
        best = None
        for lap in laps:
            duration = lap.get('lap_duration')
            row = {
                'lap': lap.get('lap_number'),
                'time': duration,
                's1': lap.get('duration_sector_1'),
                's2': lap.get('duration_sector_2'),
                's3': lap.get('duration_sector_3'),
                'pit_out': bool(lap.get('is_pit_out_lap'))
            }
            lap_rows.append(row)
            if duration and not row['pit_out'] and (best is None or duration < best['time']):
                best = {'lap': row['lap'], 'time': duration, 's1': row['s1'], 's2': row['s2'], 's3': row['s3']}

        context = {
            'session': {
                'session_key': session_key,
                'label': " ".join(str(x) for x in [
                    session.get('year', ''), session.get('country_name', ''), session.get('session_name', '')
                ] if x).strip(),
                'circuit': session.get('circuit_short_name'),
                'total_laps': max((l['lap'] or 0) for l in lap_rows) if lap_rows else None
            },
            'driver': {
                'number': int(driver_number),
                'acronym': drv.get('name_acronym'),
                'full_name': drv.get('full_name'),
                'team': drv.get('team_name'),
                'team_colour': drv.get('team_colour')
            },
            'laps': lap_rows,
            'best_lap': best,
            'stints': [
                {
                    'stint': s.get('stint_number'),
                    'lap_start': s.get('lap_start'),
                    'lap_end': s.get('lap_end'),
                    'compound': s.get('compound'),
                    'tyre_age_at_start': s.get('tyre_age_at_start')
                } for s in stints
            ],
            'positions': [
                {'date': p.get('date'), 'position': p.get('position')} for p in positions
            ]
        }

        self.contexts[key] = context
        self._save_cache()
        return context
