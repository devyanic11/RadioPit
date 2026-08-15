import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Play, Loader2, WifiOff, Flag } from 'lucide-react';
import StoryChart from './components/StoryChart';
import AnalysisPanel from './components/AnalysisPanel';
import ClipList from './components/ClipList';
import UploadZone from './components/UploadZone';

const API_BASE = 'http://localhost:8000';
const DEFAULT_RACE = '2021_Abu_Dhabi_Grand_Prix';

const fmtLap = (secs) => {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  return `${m}:${(secs % 60).toFixed(3).padStart(6, '0')}`;
};

const App = () => {
  const [isLive, setIsLive] = useState(false);
  const [indexStatus, setIndexStatus] = useState(null);   // {ready, progress}
  const [races, setRaces] = useState([]);
  const [raceId, setRaceId] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [driverNumber, setDriverNumber] = useState(null);
  const [story, setStory] = useState(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState(null);
  const [analyses, setAnalyses] = useState({});           // clip_id -> result
  const [analyzingId, setAnalyzingId] = useState(null);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(null);   // {done, total}
  const [selectedClipId, setSelectedClipId] = useState(null);
  const stopRunRef = useRef(false);

  // ---- Backend health + dataset index status ----
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) {
          const h = await res.json();
          setIsLive(true);
          setIndexStatus(h.dataset_index);
        } else setIsLive(false);
      } catch { setIsLive(false); }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  // ---- Races (once index is ready) ----
  useEffect(() => {
    if (!isLive || !indexStatus?.ready || races.length > 0) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/races`);
        if (res.ok) {
          const data = await res.json();
          setRaces(data);
          const def = data.find(r => r.race_id === DEFAULT_RACE) || data[0];
          if (def) setRaceId(def.race_id);
        }
      } catch (e) { console.warn(e); }
    })();
  }, [isLive, indexStatus, races.length]);

  // ---- Drivers for the chosen race ----
  useEffect(() => {
    if (!raceId) return;
    setDrivers([]);
    setDriverNumber(null);
    setStory(null);
    setSelectedClipId(null);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/races/${raceId}/drivers`);
        if (res.ok) {
          const data = await res.json();
          setDrivers(data);
          if (data[0]) setDriverNumber(data[0].racing_number);
        }
      } catch (e) { console.warn(e); }
    })();
  }, [raceId]);

  // ---- Load the story (clips + FastF1 timing) ----
  useEffect(() => {
    if (!raceId || !driverNumber) return;
    setStory(null);
    setSelectedClipId(null);
    setStoryError(null);
    setStoryLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/story/${raceId}/${driverNumber}`);
        if (res.ok) {
          setStory(await res.json());
        } else {
          const err = await res.json().catch(() => ({}));
          setStoryError(typeof err.detail === 'string' ? err.detail : 'Story failed to load');
        }
      } catch (e) {
        setStoryError(e.message);
      } finally {
        setStoryLoading(false);
      }
    })();
  }, [raceId, driverNumber]);

  const analyzeClip = useCallback(async (clipId) => {
    setAnalyzingId(clipId);
    try {
      const res = await fetch(`${API_BASE}/api/story/clips/${clipId}/analyze`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        setAnalyses(prev => ({ ...prev, [clipId]: result }));
        return result;
      }
    } catch (e) { console.warn(e); }
    finally { setAnalyzingId(null); }
    return null;
  }, []);

  // ---- RUN: analyze every clip sequentially ----
  const runAll = useCallback(async () => {
    if (!story?.clips?.length || running) return;
    setRunning(true);
    stopRunRef.current = false;
    const todo = story.clips.filter(c => !analyses[c.clip_id]);
    setRunProgress({ done: 0, total: todo.length });
    let done = 0;
    for (const clip of todo) {
      if (stopRunRef.current) break;
      setSelectedClipId(clip.clip_id);
      await analyzeClip(clip.clip_id);
      done += 1;
      setRunProgress({ done, total: todo.length });
    }
    setRunning(false);
    setRunProgress(null);
  }, [story, analyses, running, analyzeClip]);

  const handleClipSelect = useCallback((clip) => {
    setSelectedClipId(clip.clip_id);
    if (!analyses[clip.clip_id] && !running && analyzingId == null) {
      analyzeClip(clip.clip_id);
    }
  }, [analyses, running, analyzingId, analyzeClip]);

  const handleUpload = useCallback(async (file) => {
    const uploadId = 'upload';
    setSelectedClipId(uploadId);
    setAnalyzingId(uploadId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: formData });
      if (res.ok) {
        const result = await res.json();
        setAnalyses(prev => ({ ...prev, [uploadId]: result }));
      }
    } catch (e) { console.warn(e); }
    finally { setAnalyzingId(null); }
  }, []);

  // ---- Chart data: real lap times + stress at radio laps ----
  const chartData = useMemo(() => {
    if (!story?.laps) return [];
    const stressAt = {};
    for (const clip of story.clips || []) {
      const a = analyses[clip.clip_id];
      if (a && clip.lap != null) {
        const s = Math.round(a.driver_state?.stress?.score ?? 0);
        stressAt[clip.lap] = Math.max(stressAt[clip.lap] ?? 0, s);
      }
    }
    return story.laps.map(l => ({
      lap: l.lap,
      lapTime: l.pit ? null : l.time,
      stress: stressAt[l.lap] ?? null
    }));
  }, [story, analyses]);

  const selectedClip = useMemo(() => {
    if (selectedClipId === 'upload') return null;
    return story?.clips?.find(c => c.clip_id === selectedClipId) || null;
  }, [story, selectedClipId]);

  const onLapClick = useCallback((lap) => {
    const clip = story?.clips?.find(c => c.lap === lap);
    if (clip) handleClipSelect(clip);
  }, [story, handleClipSelect]);

  const driver = story?.driver;
  const teamColour = driver?.team_colour ? `#${driver.team_colour.replace('#', '')}` : 'var(--accent-red)';
  const analyzedCount = story?.clips?.filter(c => analyses[c.clip_id]).length ?? 0;
  const indexing = isLive && indexStatus && !indexStatus.ready;

  const selStyle = {
    background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-card)',
    padding: '7px 10px', borderRadius: '8px', fontSize: '13px', maxWidth: '240px'
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ===== Top bar: brand · race · driver · RUN ===== */}
      <header style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: '1px solid var(--border-card)', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 900, fontSize: '16px', letterSpacing: '2px', color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--accent-red)' }}>⚡ RADIO</span>PIT
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>The stress-vs-laptime story of any F1 radio</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <Flag size={14} color="var(--text-secondary)" />
          <select style={selStyle} value={raceId || ''} onChange={(e) => setRaceId(e.target.value)} disabled={races.length === 0}>
            {races.length === 0 && <option value="">{indexing ? `Indexing dataset… ${Math.round((indexStatus?.progress || 0) * 100)}%` : 'Loading races…'}</option>}
            {races.map(r => (
              <option key={r.race_id} value={r.race_id}>{r.label} ({r.clip_count} clips)</option>
            ))}
          </select>

          <select style={selStyle} value={driverNumber || ''} onChange={(e) => setDriverNumber(e.target.value)} disabled={drivers.length === 0}>
            {drivers.length === 0 && <option value="">Driver…</option>}
            {drivers.map(d => (
              <option key={d.racing_number} value={d.racing_number}>{d.acronym} #{d.racing_number} ({d.clip_count} clips)</option>
            ))}
          </select>

          <button
            onClick={runAll}
            disabled={!story?.clips?.length || running}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              background: running ? 'rgba(231,76,60,0.35)' : 'var(--accent-red)',
              color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px',
              fontWeight: 'bold', letterSpacing: '1px', fontSize: '13px',
              cursor: story?.clips?.length && !running ? 'pointer' : 'not-allowed'
            }}
          >
            {running
              ? <><Loader2 size={14} className="spin" /> {runProgress ? `${runProgress.done}/${runProgress.total}` : 'RUNNING'}</>
              : <><Play size={14} fill="currentColor" /> RUN</>}
          </button>

          <div title={isLive ? 'Backend connected' : 'Backend offline'} style={{ width: '9px', height: '9px', borderRadius: '50%', background: isLive ? 'var(--accent-teal)' : 'var(--accent-red)', flexShrink: 0 }} />
        </div>
      </header>

      {/* ===== Offline / loading states ===== */}
      {!isLive && (
        <div style={{ padding: '9px 24px', background: 'rgba(231,76,60,0.08)', borderBottom: '1px solid rgba(231,76,60,0.25)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <WifiOff size={13} color="var(--accent-red)" />
          <span><b style={{ color: 'var(--accent-red)' }}>Backend offline.</b> Start it: <code className="mono" style={{ color: 'var(--text-primary)' }}>python -m uvicorn api.main:app --port 8000</code></span>
        </div>
      )}

      {/* ===== Main: chart + analysis panel ===== */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '16px', padding: '16px 24px' }}>
        <div className="card" style={{ flex: 2.2, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '1px' }}>
              STRESS vs LAP TIME
              {driver?.full_name && (
                <span style={{ marginLeft: '10px', fontWeight: 600, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: teamColour, marginRight: '5px', verticalAlign: '-1px' }} />
                  {driver.full_name} · {driver.team} {driver.finish_position ? `· finished P${driver.finish_position}` : ''}
                </span>
              )}
            </h2>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {story ? `Best ${fmtLap(story.best_lap?.time)} (L${story.best_lap?.lap ?? '—'}) · ${story.total_laps} laps · ${analyzedCount}/${story.clips.length} radio calls analyzed` : ''}
            </span>
          </div>

          {storyLoading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <Loader2 size={22} className="spin" color="var(--accent-red)" />
              Downloading radio clips (Hugging Face) + official timing (FastF1)…
              <span style={{ fontSize: '11px', fontStyle: 'italic' }}>first load of a race takes ~30-60s, then it's cached</span>
            </div>
          ) : storyError ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-red)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              {String(storyError)}
            </div>
          ) : (
            <StoryChart
              data={chartData}
              bestLapTime={story?.best_lap?.time ?? null}
              onLapClick={onLapClick}
              selectedLap={selectedClip?.lap ?? null}
            />
          )}
        </div>

        <div className="card" style={{ flex: 1, minWidth: '300px', maxWidth: '380px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '1px', marginBottom: '10px', flexShrink: 0 }}>RADIO ANALYSIS</h2>
          <div style={{ flex: 1, minHeight: 0 }}>
            <AnalysisPanel
              clip={selectedClip}
              analysis={analyses[selectedClipId]}
              analyzing={analyzingId === selectedClipId}
              apiBase={API_BASE}
            />
          </div>
        </div>
      </div>

      {/* ===== Bottom: clip strip + upload ===== */}
      <div style={{ padding: '0 24px 14px', flexShrink: 0, display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ClipList
            clips={story?.clips || []}
            analyses={analyses}
            analyzingId={analyzingId}
            selectedClipId={selectedClipId}
            onSelect={handleClipSelect}
          />
        </div>
        <UploadZone onAudioUpload={handleUpload} />
      </div>

      <div style={{ padding: '6px 24px', borderTop: '1px solid var(--border-card)', fontSize: '10px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <span>Audio: HF dataset MikCil/f1-team-radio · Timing: FastF1 (official) · Models: Whisper + wav2vec2 + DistilBERT (Hugging Face)</span>
        <span className="mono">RADIOPIT</span>
      </div>
    </div>
  );
};

export default App;
