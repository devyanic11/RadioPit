"""FastF1 timing service — official F1 lap times for 2018-2025 races.

Loads a race session once per (race, driver), converts laps to plain JSON,
caches to disk so the demo works offline after first load, and matches
radio message timestamps (UTC) to the lap they were transmitted on.
"""
import os
import json
import datetime
import re
import logging
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config


def _parse_race_id(race_id):
    """'2021_Abu_Dhabi_Grand_Prix' -> (2021, 'Abu Dhabi Grand Prix')"""
    parts = race_id.split('_')
    year = int(parts[0])
    name = ' '.join(parts[1:])
    return year, name


def _seconds(td):
    try:
        v = td.total_seconds()
        return round(float(v), 3) if v == v else None  # NaN check
    except Exception:
        return None


class FastF1Timing:
    def __init__(self):
        self.cache_dir = os.path.join(os.path.dirname(config.AUDIO_DIR), 'story', 'timing')
        os.makedirs(self.cache_dir, exist_ok=True)
        self.ff1_cache = os.path.join(self.cache_dir, 'fastf1_cache')
        os.makedirs(self.ff1_cache, exist_ok=True)

    def get_timing(self, race_id, racing_number):
        """Returns {'driver': {...}, 'laps': [...], 'best_lap': {...}, 'total_laps': n}."""
        # v2: laps carry start_epoch (pandas isoformat can have ns precision that
        # datetime.fromisoformat cannot parse — epoch floats are unambiguous)
        cache_file = os.path.join(self.cache_dir, f"{race_id}_{racing_number}_v2.json")
        if os.path.exists(cache_file):
            try:
                with open(cache_file) as f:
                    return json.load(f)
            except Exception:
                pass

        import fastf1
        fastf1.Cache.enable_cache(self.ff1_cache)

        year, gp_name = _parse_race_id(race_id)
        session = fastf1.get_session(year, gp_name, 'R')
        session.load(laps=True, telemetry=False, weather=False, messages=False)

        dn = str(racing_number)
        laps_df = session.laps.pick_drivers(dn)
        try:
            drv = session.get_driver(dn)
            driver_info = {
                'number': dn,
                'acronym': str(drv.get('Abbreviation', '')),
                'full_name': str(drv.get('FullName', '')),
                'team': str(drv.get('TeamName', '')),
                'team_colour': str(drv.get('TeamColor', '')) or None,
                'finish_position': int(drv['Position']) if drv.get('Position') == drv.get('Position') else None
            }
        except Exception:
            driver_info = {'number': dn}

        laps = []
        best = None
        for _, lap in laps_df.iterrows():
            lap_number = int(lap['LapNumber']) if lap['LapNumber'] == lap['LapNumber'] else None
            if lap_number is None:
                continue
            time_s = _seconds(lap['LapTime']) if lap['LapTime'] is not None else None
            start_date = lap['LapStartDate']
            is_pit = (lap['PitOutTime'] == lap['PitOutTime']) or (lap['PitInTime'] == lap['PitInTime'])
            try:
                position = int(lap['Position']) if lap['Position'] == lap['Position'] else None
            except Exception:
                position = None
            start_epoch = None
            if start_date is not None and start_date == start_date:  # not NaT
                try:
                    # FastF1 LapStartDate is naive UTC; pandas treats naive as UTC here
                    start_epoch = float(start_date.timestamp())
                except Exception:
                    start_epoch = None

            row = {
                'lap': lap_number,
                'time': time_s,
                'start_epoch': start_epoch,
                'pit': bool(is_pit),
                'compound': str(lap['Compound']) if lap['Compound'] == lap['Compound'] else None,
                'tyre_life': int(lap['TyreLife']) if lap['TyreLife'] == lap['TyreLife'] else None,
                'position': position,
                's1': _seconds(lap['Sector1Time']),
                's2': _seconds(lap['Sector2Time']),
                's3': _seconds(lap['Sector3Time'])
            }
            laps.append(row)
            if time_s and not row['pit'] and (best is None or time_s < best['time']):
                best = {'lap': lap_number, 'time': time_s}

        result = {
            'race_id': race_id,
            'race_label': f"{year} {gp_name}",
            'driver': driver_info,
            'laps': laps,
            'best_lap': best,
            'total_laps': max((l['lap'] for l in laps), default=None)
        }
        with open(cache_file, 'w') as f:
            json.dump(result, f)
        return result

    @staticmethod
    def _to_epoch(iso_str):
        """Tolerant ISO -> epoch (UTC). Handles 'Z' suffix and 7-9 fractional digits."""
        if not iso_str:
            return None
        s = iso_str.replace('Z', '+00:00')
        # Trim fractional seconds beyond microseconds (pandas ns precision)
        s = re.sub(r'(\.\d{6})\d+', r'\1', s)
        try:
            dt = datetime.datetime.fromisoformat(s)
        except (ValueError, TypeError):
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.timestamp()

    @staticmethod
    def match_clip_to_lap(clip_ts_iso, laps):
        """Radio at time T belongs to the last lap whose start time <= T."""
        t = FastF1Timing._to_epoch(clip_ts_iso)
        if t is None:
            return None
        matched = None
        for lap in laps:
            start = lap.get('start_epoch')
            if start is None:
                start = FastF1Timing._to_epoch(lap.get('start_date'))  # legacy caches
            if start is None:
                continue
            if start <= t:
                matched = lap
            else:
                break
        return matched
