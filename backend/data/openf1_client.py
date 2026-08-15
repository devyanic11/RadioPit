"""OpenF1 API client — real F1 team radio audio + real lap telemetry.

Data source: https://openf1.org (free, no auth).
Radio MP3s are served from F1's public live-timing CDN.
"""
import os
import logging
import datetime
import requests

OPENF1_BASE = "https://api.openf1.org/v1"


def _parse_iso(ts: str) -> datetime.datetime:
    """Parse OpenF1 ISO timestamps like 2026-07-26T13:45:00.758000+00:00."""
    return datetime.datetime.fromisoformat(ts)


class OpenF1Client:
    def __init__(self, timeout: int = 15):
        self.timeout = timeout
        self.http = requests.Session()
        self.http.headers.update({"User-Agent": "RadioPit/1.0 (hackathon demo)"})

    def _get(self, endpoint: str, **params):
        url = f"{OPENF1_BASE}/{endpoint}"
        resp = self.http.get(url, params=params, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    # ---------- Metadata ----------

    def get_session_info(self, session_key) -> dict:
        rows = self._get("sessions", session_key=session_key)
        return rows[0] if rows else {}

    def get_drivers(self, session_key) -> dict:
        """Returns {driver_number: {name_acronym, full_name, team_name, ...}}."""
        rows = self._get("drivers", session_key=session_key)
        return {d["driver_number"]: d for d in rows}

    def get_team_radio(self, session_key, driver_number=None) -> list:
        params = {"session_key": session_key}
        if driver_number is not None:
            params["driver_number"] = driver_number
        return self._get("team_radio", **params)

    def get_laps(self, session_key, driver_number) -> list:
        laps = self._get("laps", session_key=session_key, driver_number=driver_number)
        return sorted(laps, key=lambda l: l.get("lap_number") or 0)

    def get_stints(self, session_key, driver_number) -> list:
        stints = self._get("stints", session_key=session_key, driver_number=driver_number)
        return sorted(stints, key=lambda s: s.get("stint_number") or 0)

    def get_positions(self, session_key, driver_number) -> list:
        pos = self._get("position", session_key=session_key, driver_number=driver_number)
        return sorted(pos, key=lambda p: p.get("date") or "")

    # ---------- Lap matching ----------

    @staticmethod
    def match_radio_to_lap(radio_date_iso: str, laps: list) -> dict:
        """Find the lap during which a radio message was sent.

        A radio message at time T belongs to the last lap whose date_start <= T.
        Returns {} if no match (e.g. message before the race start).
        """
        try:
            t = _parse_iso(radio_date_iso)
        except (ValueError, TypeError):
            return {}

        matched = {}
        for lap in laps:
            start_iso = lap.get("date_start")
            if not start_iso:
                continue
            try:
                start = _parse_iso(start_iso)
            except (ValueError, TypeError):
                continue
            if start <= t:
                matched = lap
            else:
                break
        return matched

    # ---------- Audio download ----------

    def download_file(self, url: str, dest_path: str) -> bool:
        """Download a radio MP3 to dest_path. Returns True on success."""
        try:
            resp = self.http.get(url, timeout=self.timeout, stream=True)
            resp.raise_for_status()
            tmp_path = dest_path + ".part"
            with open(tmp_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    f.write(chunk)
            os.replace(tmp_path, dest_path)
            return True
        except Exception as e:
            logging.warning(f"OpenF1 download failed for {url}: {e}")
            for p in (dest_path + ".part",):
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass
            return False
