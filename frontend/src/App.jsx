import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Radio, WifiOff } from 'lucide-react';
import LiveRadio from './components/LiveRadio';
import DriverState from './components/DriverState';
import AlertsInsights from './components/AlertsInsights';
import StateChart from './components/StateChart';
import RadioTimeline from './components/RadioTimeline';
import PerformanceBar from './components/PerformanceBar';

const API_BASE = 'http://localhost:8000';

const EMPTY_STATE = {
  stress: { value: 0, level: 'LOW' },
  frustration: { value: 0, level: 'LOW' },
  fatigue: { value: 0, level: 'LOW' },
  mentalLoad: { value: 0, level: 'LOW' }
};

const App = () => {
  const [isLive, setIsLive] = useState(false);
  const [driverState, setDriverState] = useState(EMPTY_STATE);
  const [radioEntries, setRadioEntries] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [timeSeries, setTimeSeries] = useState([]);
  const [sampleClips, setSampleClips] = useState([]);
  const [sessionLabel, setSessionLabel] = useState(null);
  const [lastSignals, setLastSignals] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [raceContext, setRaceContext] = useState(null);
  const [selectedClip, setSelectedClip] = useState(null);
  // Stress pins keyed by `${session_key}_${driver_number}` so each race/driver keeps its own chart
  const [stressMap, setStressMap] = useState({});
  const [stressHistory, setStressHistory] = useState([]);

  // ---- Backend health ----
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        setIsLive(res.ok);
      } catch {
        setIsLive(false);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  // ---- Real radio clip library ----
  useEffect(() => {
    if (!isLive) return;
    const loadClips = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sample-clips`);
        if (res.ok) {
          const data = await res.json();
          const clips = data.clips || [];
          setSampleClips(clips);
          setSessionLabel(data.session_label || null);
          if (clips.length > 0 && clips[0].driver_number != null) {
            loadRaceContext(clips[0].driver_number, clips[0].session_key);
          }
        }
      } catch (err) {
        console.warn('Could not load radio library:', err.message);
      }
    };
    loadClips();
  }, [isLive]);

  const loadRaceContext = async (driverNumber, sessionKey = null) => {
    try {
      const qs = sessionKey != null ? `?session_key=${sessionKey}` : '';
      const res = await fetch(`${API_BASE}/api/race-context/${driverNumber}${qs}`);
      if (res.ok) setRaceContext(await res.json());
    } catch (err) {
      console.warn('Could not load race context:', err.message);
    }
  };

  const getLevel = (v, type) => {
    if (type === 'stress') return v >= 75 ? 'CRITICAL' : v >= 55 ? 'HIGH' : v >= 30 ? 'MODERATE' : 'LOW';
    if (type === 'frustration') return v >= 75 ? 'HIGH' : v >= 55 ? 'ELEVATED' : v >= 30 ? 'MODERATE' : 'LOW';
    return v >= 55 ? 'HIGH' : v >= 30 ? 'MODERATE' : 'LOW';
  };

  // ---- Apply a backend analysis result to the dashboard ----
  const applyAnalysisResult = useCallback((result, { lap = null, clip = null } = {}) => {
    setTimeSeries(result.time_series || []);
    setLastSignals(result.signals || null);
    setRecommendations(result.recommendations || []);

    const ds = result.driver_state || {};
    const sVal = Math.round(ds.stress?.score ?? result.stress_score ?? 0);
    const frVal = Math.round(ds.frustration?.score ?? result.frustration_score ?? 0);
    const faVal = Math.round(ds.fatigue?.score ?? result.fatigue_score ?? 0);
    const mlVal = Math.round(ds.mental_load?.score ?? result.mental_load_score ?? 0);

    setDriverState({
      stress: { value: sVal, level: getLevel(sVal, 'stress') },
      frustration: { value: frVal, level: getLevel(frVal, 'frustration') },
      fatigue: { value: faVal, level: getLevel(faVal, 'fatigue') },
      mentalLoad: { value: mlVal, level: getLevel(mlVal, 'mentalLoad') }
    });
    setStressHistory(prev => [...prev, sVal].slice(-10));

    setCurrentAnalysis({
      transcript: result.transcript || 'Audio analyzed',
      word_timestamps: result.word_timestamps || [],
      confidence: Math.round((result.confidence ?? 0.5) * 100),
      segments: result.segments || []
    });

    // Pin stress onto the real lap chart (per race + driver)
    if (lap != null && clip?.session_key != null && clip?.driver_number != null) {
      const key = `${clip.session_key}_${clip.driver_number}`;
      setStressMap(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [lap]: sVal } }));
    }

    const nlpKeywords = result.signals?.nlp?.f1_keywords || [];
    const tags = nlpKeywords.map(k => k.word || k);
    if (clip?.driver) tags.unshift(clip.driver);
    if (sVal > 55) tags.push('High Stress');

    setRadioEntries(prev => [{
      id: Date.now(),
      lap,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      transcript: result.transcript || 'Transmission analyzed',
      severity: sVal >= 75 ? 'HIGH' : sVal >= 55 ? 'ELEVATED' : sVal >= 30 ? 'MODERATE' : 'CALM',
      tags: tags.length > 0 ? tags : ['Radio Call']
    }, ...prev].slice(0, 20));

    if (sVal > 55) {
      setAlerts(prev => [{
        id: Date.now(),
        type: sVal >= 75 ? 'warning' : 'info',
        title: sVal >= 75 ? 'ELEVATED STRESS DETECTED' : 'Driver Stress Rising',
        subtitle: lap != null ? `Stress reaches ${sVal}% on Lap ${lap}` : `Stress reaches ${sVal}% (uploaded audio)`
      }, ...prev].slice(0, 10));
    }
  }, []);

  // Real trend: current stress vs mean of the previous (up to 3) radio calls
  const stressTrend = useMemo(() => {
    if (stressHistory.length < 2) return null;
    const current = stressHistory[stressHistory.length - 1];
    const prev = stressHistory.slice(-4, -1);
    const prevMean = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (prevMean === 0) return null;
    return ((current - prevMean) / prevMean) * 100;
  }, [stressHistory]);

  const handleAudioUpload = useCallback(async (file) => {
    setCurrentAnalysis({ transcript: '', word_timestamps: [], confidence: null, analyzing: true });
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: formData });
      if (response.ok) {
        const result = await response.json();
        applyAnalysisResult(result, { lap: null });
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      setCurrentAnalysis(null);
      setAlerts(prev => [{
        id: Date.now(),
        type: 'warning',
        title: 'Backend unavailable',
        subtitle: `Analysis failed (${err.message}). Start the API server on port 8000.`
      }, ...prev].slice(0, 10));
    }
  }, [applyAnalysisResult]);

  const handleClipSelect = useCallback(async (clip) => {
    setSelectedClip(clip);
    setCurrentAnalysis({ transcript: '', word_timestamps: [], confidence: null, analyzing: true });
    const driverChanged = clip.driver_number != null && clip.driver_number !== raceContext?.driver?.number;
    const sessionChanged = clip.session_key != null && clip.session_key !== raceContext?.session?.session_key;
    if (driverChanged || sessionChanged) {
      loadRaceContext(clip.driver_number, clip.session_key);
    }
    try {
      const response = await fetch(`${API_BASE}/api/analyze-sample/${clip.id}`, { method: 'POST' });
      if (response.ok) {
        const result = await response.json();
        applyAnalysisResult(result, { lap: clip.lap_number ?? null, clip });
      }
    } catch (err) {
      console.warn('Clip analysis failed:', err.message);
      setCurrentAnalysis(null);
    }
  }, [applyAnalysisResult, raceContext]);

  const handleLiveSpeechUpdate = useCallback((speechData) => {
    setCurrentAnalysis(prev => ({
      ...prev,
      transcript: speechData.transcript,
      word_timestamps: speechData.word_timestamps,
      confidence: speechData.confidence || 95
    }));
  }, []);

  // Live gauge motion during playback, from the real windowed time series
  const handlePlaybackProgress = useCallback((curTimeSec) => {
    if (timeSeries && timeSeries.length > 0) {
      const point = timeSeries.reduce((prev, curr) =>
        Math.abs(curr.time - curTimeSec) < Math.abs(prev.time - curTimeSec) ? curr : prev, timeSeries[0]);
      if (point) {
        setDriverState({
          stress: { value: Math.round(point.stress), level: getLevel(point.stress, 'stress') },
          frustration: { value: Math.round(point.frustration), level: getLevel(point.frustration, 'frustration') },
          fatigue: { value: Math.round(point.fatigue), level: getLevel(point.fatigue, 'fatigue') },
          mentalLoad: { value: Math.round(point.mental_load), level: getLevel(point.mental_load, 'mentalLoad') }
        });
      }
    }
  }, [timeSeries]);

  // ---- Real derived values for header / footer / chart ----
  const chartData = useMemo(() => {
    if (!raceContext?.laps) return [];
    const ctxKey = `${raceContext.session?.session_key}_${raceContext.driver?.number}`;
    const pins = stressMap[ctxKey] || {};
    return raceContext.laps
      .filter(l => l.lap != null)
      .map(l => ({
        lap: l.lap,
        lapTime: l.pit_out ? null : l.time,
        stress: pins[l.lap] ?? null
      }));
  }, [raceContext, stressMap]);

  const clipPosition = useMemo(() => {
    if (!selectedClip?.date || !raceContext?.positions?.length) return null;
    let pos = null;
    for (const p of raceContext.positions) {
      if (p.date && p.date <= selectedClip.date) pos = p.position;
      else break;
    }
    return pos;
  }, [selectedClip, raceContext]);

  const clipTyre = useMemo(() => {
    const lap = selectedClip?.lap_number;
    if (lap == null || !raceContext?.stints?.length) return null;
    const stint = raceContext.stints.find(s => s.lap_start != null && lap >= s.lap_start && lap <= (s.lap_end ?? Infinity));
    if (!stint) return null;
    return {
      compound: stint.compound,
      age: lap - stint.lap_start + (stint.tyre_age_at_start || 0)
    };
  }, [selectedClip, raceContext]);

  const driver = raceContext?.driver;
  const teamColour = driver?.team_colour ? `#${driver.team_colour}` : 'var(--accent-red)';
  const totalLaps = raceContext?.session?.total_laps;

  return (
    <div className="app-container">
      {/* Slim brand rail — no fake navigation */}
      <div style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px' }}>
        <div style={{ fontWeight: '900', fontSize: '11px', letterSpacing: '3px', color: 'var(--accent-red)', marginBottom: '32px', padding: '8px 0' }}>
          ⚡PW
        </div>
        <div style={{ width: '100%', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', color: 'var(--text-primary)', background: 'linear-gradient(90deg, rgba(231,76,60,0.15) 0%, transparent 100%)' }} title="Driver Radio Analysis">
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: 'var(--accent-red)', boxShadow: '0 0 10px var(--accent-red)' }} />
          <Radio size={22} />
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* Header — all values real (OpenF1) */}
        <header style={{ padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '2px' }}>DRIVER RADIO ANALYSIS</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isLive ? 'rgba(231, 76, 60, 0.1)' : 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: '12px', border: `1px solid ${isLive ? 'rgba(231, 76, 60, 0.3)' : 'var(--border-card)'}` }}>
              {isLive
                ? <div className="pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-red)' }} />
                : <WifiOff size={11} color="var(--text-secondary)" />}
              <span style={{ fontSize: '11px', color: isLive ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>
                {isLive ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Real-time insight from every word</span>
          </div>

          <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--text-secondary)', alignItems: 'center' }}>
            <div><span style={{ fontSize: '10px', letterSpacing: '1px' }}>SESSION</span><br/><span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{raceContext?.session?.label || sessionLabel || '—'}</span></div>
            <div><span style={{ fontSize: '10px', letterSpacing: '1px' }}>RADIO LAP</span><br/><span className="mono" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{selectedClip?.lap_number != null ? `${selectedClip.lap_number}${totalLaps ? ` / ${totalLaps}` : ''}` : '—'}</span></div>
            <div><span style={{ fontSize: '10px', letterSpacing: '1px' }}>POSITION</span><br/><span className="mono" style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '16px' }}>{clipPosition != null ? `P${clipPosition}` : '—'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border-card)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: teamColour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>
                {driver?.number ?? '–'}
              </div>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>{driver?.full_name || 'Select a radio clip'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{driver?.team || 'Driver context loads from OpenF1'}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Offline notice — no fake demo data */}
        {!isLive && (
          <div style={{ padding: '10px 28px', background: 'rgba(231, 76, 60, 0.08)', borderBottom: '1px solid rgba(231, 76, 60, 0.25)', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <WifiOff size={14} color="var(--accent-red)" />
            <span><b style={{ color: 'var(--accent-red)' }}>Backend offline.</b> Start it with <code className="mono" style={{ color: 'var(--text-primary)' }}>python -m uvicorn api.main:app --port 8000</code> — this dashboard only shows real analyzed data.</span>
          </div>
        )}

        {/* Dashboard Grid */}
        <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto 1fr', gap: '20px', alignContent: 'start' }}>

          <LiveRadio
            onAudioUpload={handleAudioUpload}
            isLive={isLive}
            currentAnalysis={currentAnalysis}
            onPlaybackProgress={handlePlaybackProgress}
            onLiveSpeechUpdate={handleLiveSpeechUpdate}
            clips={sampleClips}
            sessionLabel={sessionLabel}
            onClipSelect={handleClipSelect}
            apiBase={API_BASE}
          />

          <DriverState state={driverState} stressTrend={stressTrend} />

          <AlertsInsights alerts={alerts} stressLevel={driverState.stress.level} stressValue={driverState.stress.value} signals={lastSignals} recommendations={recommendations} />

          <StateChart data={chartData} driverLabel={driver ? `${driver.acronym} #${driver.number}` : null} bestLapTime={raceContext?.best_lap?.time ?? null} />

          <RadioTimeline entries={radioEntries} />

        </div>

        {/* Footer — real session data */}
        <PerformanceBar isLive={isLive} context={raceContext} analyzedLap={selectedClip?.lap_number ?? null} tyre={clipTyre} />

      </div>
    </div>
  );
};

export default App;
