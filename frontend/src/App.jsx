import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutDashboard, Radio, Activity, Gauge, Bell, FileText, Settings } from 'lucide-react';
import LiveRadio from './components/LiveRadio';
import DriverState from './components/DriverState';
import AlertsInsights from './components/AlertsInsights';
import StateChart from './components/StateChart';
import RadioTimeline from './components/RadioTimeline';
import PerformanceBar from './components/PerformanceBar';
import { DEMO_RACE_INFO, DEMO_STATE, DEMO_TIMELINE, DEMO_RADIO_ENTRIES, DEMO_ALERTS } from './data/demoData';

const API_BASE = 'http://localhost:8000';

const SidebarIcon = ({ icon: Icon, label, active }) => (
  <div style={{
    width: '100%',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    position: 'relative',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    background: active ? 'linear-gradient(90deg, rgba(231,76,60,0.15) 0%, transparent 100%)' : 'transparent',
    transition: 'all 0.2s'
  }}
    title={label}
  >
    {active && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: 'var(--accent-red)', boxShadow: '0 0 10px var(--accent-red)' }} />}
    <Icon size={22} />
  </div>
);

const App = () => {
  const [isLive, setIsLive] = useState(false);
  const [driverState, setDriverState] = useState(DEMO_STATE);
  const [timelineData, setTimelineData] = useState(DEMO_TIMELINE);
  const [radioEntries, setRadioEntries] = useState(DEMO_RADIO_ENTRIES);
  const [alerts, setAlerts] = useState(DEMO_ALERTS);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [timeSeries, setTimeSeries] = useState([]);
  const [lapCounter, setLapCounter] = useState(42);
  
  const activeUtteranceRef = useRef(null);

  // Check backend health on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) setIsLive(true);
      } catch {
        setIsLive(false);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  const getLevel = (v, type) => {
    if (type === 'stress') return v >= 75 ? 'CRITICAL' : v >= 55 ? 'HIGH' : v >= 30 ? 'MODERATE' : 'LOW';
    if (type === 'frustration') return v >= 75 ? 'HIGH' : v >= 55 ? 'ELEVATED' : v >= 30 ? 'MODERATE' : 'LOW';
    return v >= 55 ? 'HIGH' : v >= 30 ? 'MODERATE' : 'LOW';
  };

  const handleAudioUpload = useCallback(async (file) => {
    const currentLap = lapCounter;
    setLapCounter(prev => prev + 1);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        
        activeUtteranceRef.current = result;
        setTimeSeries(result.time_series || []);

        const ds = result.driver_state || {};
        const sVal = Math.round(ds.stress?.score || result.stress_score || 50);
        const frVal = Math.round(ds.frustration?.score || result.frustration_score || 30);
        const faVal = Math.round(ds.fatigue?.score || result.fatigue_score || 25);
        const mlVal = Math.round(ds.mental_load?.score || result.mental_load_score || 40);

        const initialDriverState = {
          stress: { value: sVal, level: getLevel(sVal, 'stress'), trend: 'up' },
          frustration: { value: frVal, level: getLevel(frVal, 'frustration'), trend: 'up' },
          fatigue: { value: faVal, level: getLevel(faVal, 'fatigue'), trend: 'stable' },
          mentalLoad: { value: mlVal, level: getLevel(mlVal, 'mentalLoad'), trend: 'up' }
        };

        setDriverState(initialDriverState);

        // Word timestamps for instant YouTube CC subtitle guessing
        setCurrentAnalysis({
          transcript: result.transcript || 'Audio analyzed',
          word_timestamps: result.word_timestamps || [],
          confidence: Math.round((result.confidence || 0.88) * 100),
          segments: result.segments || []
        });

        // Add to timeline chart
        setTimelineData(prev => [...prev.slice(1), {
          lap: currentLap,
          stress: sVal,
          frustration: frVal,
          fatigue: faVal,
          lapTime: 91 + (sVal * 0.03)
        }]);

        // Add to radio timeline
        const nlpKeywords = result.signals?.nlp?.f1_keywords || [];
        const tags = nlpKeywords.map(k => k.word || k);
        if (sVal > 55) tags.push('High Stress');
        
        setRadioEntries(prev => [{
          id: Date.now(),
          lap: currentLap,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          transcript: result.transcript || 'Transmission analyzed',
          severity: sVal >= 75 ? 'HIGH' : sVal >= 55 ? 'ELEVATED' : sVal >= 30 ? 'MODERATE' : 'CALM',
          tags: tags.length > 0 ? tags : ['Radio Call']
        }, ...prev].slice(0, 20));

        // Insights / Alerts
        if (sVal > 55) {
          setAlerts(prev => [{
            id: Date.now(),
            type: sVal >= 75 ? 'warning' : 'info',
            title: sVal >= 75 ? 'ELEVATED STRESS DETECTED' : 'Driver Stress Rising',
            subtitle: `Stress reaches ${sVal}% on Lap ${currentLap}`
          }, ...prev].slice(0, 10));
        }

        return;
      }
    } catch (err) {
      console.warn('Backend unavailable, running live demo simulation:', err.message);
    }

    simulateLiveAudioUpload(currentLap);
  }, [lapCounter]);

  // Real-time live mic speech update handler
  const handleLiveSpeechUpdate = useCallback((speechData) => {
    setCurrentAnalysis(prev => ({
      ...prev,
      transcript: speechData.transcript,
      word_timestamps: speechData.word_timestamps,
      confidence: speechData.confidence || 95
    }));
  }, []);

  // LIVE REAL-TIME MOTION: Updates all 4 variables & graph frame-by-frame as audio plays!
  const handlePlaybackProgress = useCallback((curTimeSec) => {
    if (timeSeries && timeSeries.length > 0) {
      const point = timeSeries.reduce((prev, curr) => {
        return Math.abs(curr.time - curTimeSec) < Math.abs(prev.time - curTimeSec) ? curr : prev;
      }, timeSeries[0]);

      if (point) {
        setDriverState({
          stress: { value: Math.round(point.stress), level: getLevel(point.stress, 'stress'), trend: 'up' },
          frustration: { value: Math.round(point.frustration), level: getLevel(point.frustration, 'frustration'), trend: 'up' },
          fatigue: { value: Math.round(point.fatigue), level: getLevel(point.fatigue, 'fatigue'), trend: 'stable' },
          mentalLoad: { value: Math.round(point.mental_load), level: getLevel(point.mental_load, 'mentalLoad'), trend: 'up' }
        });
      }
    }
  }, [timeSeries]);

  const simulateLiveAudioUpload = (lap) => {
    const sVal = 65 + Math.floor(Math.random() * 25);
    const frVal = 50 + Math.floor(Math.random() * 25);
    const faVal = 30 + Math.floor(Math.random() * 20);
    const mlVal = 55 + Math.floor(Math.random() * 25);

    setDriverState({
      stress: { value: sVal, level: getLevel(sVal, 'stress'), trend: 'up' },
      frustration: { value: frVal, level: getLevel(frVal, 'frustration'), trend: 'up' },
      fatigue: { value: faVal, level: getLevel(faVal, 'fatigue'), trend: 'stable' },
      mentalLoad: { value: mlVal, level: getLevel(mlVal, 'mentalLoad'), trend: 'up' }
    });

    const demoText = "The rear is gone. I can't get it through Turn 7. Too much sliding.";
    const words = demoText.split(' ');
    const step = 0.35;
    const demoWordTs = words.map((w, i) => ({ word: w, start: i * step, end: (i + 1) * step }));

    setCurrentAnalysis({ 
      transcript: demoText, 
      word_timestamps: demoWordTs,
      confidence: 92 
    });

    setTimelineData(prev => [...prev.slice(1), {
      lap, stress: sVal, frustration: frVal, fatigue: faVal, lapTime: 91 + sVal * 0.03
    }]);

    setRadioEntries(prev => [{
      id: Date.now(), lap, timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      transcript: demoText, severity: sVal > 70 ? 'HIGH' : 'MODERATE', tags: ['Rear Grip', 'Turn 7']
    }, ...prev].slice(0, 20));
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px' }}>
        <div style={{ fontWeight: '900', fontSize: '11px', letterSpacing: '3px', color: 'var(--accent-red)', marginBottom: '32px', padding: '8px 0' }}>
          ⚡PW
        </div>
        
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <SidebarIcon icon={LayoutDashboard} label="Dashboard" active={false} />
          <SidebarIcon icon={Radio} label="Live Radio" active={true} />
          <SidebarIcon icon={Activity} label="Driver State" active={false} />
          <SidebarIcon icon={Gauge} label="Performance" active={false} />
          <SidebarIcon icon={Bell} label="Alerts" active={false} />
          <SidebarIcon icon={FileText} label="Reports" active={false} />
        </div>
        
        <div style={{ marginTop: 'auto', marginBottom: '16px', width: '100%' }}>
          <SidebarIcon icon={Settings} label="Settings" active={false} />
        </div>
      </div>
      
      {/* Main Content */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* Header */}
        <header style={{ padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '2px' }}>DRIVER RADIO ANALYSIS</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(231, 76, 60, 0.1)', padding: '3px 10px', borderRadius: '12px', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
              <div className="pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-red)' }} />
              <span style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: 'bold', letterSpacing: '1px' }}>
                {isLive ? 'LIVE' : 'DEMO'}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Real-time insight from every word</span>
          </div>
          
          <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--text-secondary)', alignItems: 'center' }}>
            <div><span style={{ color: 'var(--text-secondary)', fontSize: '10px', letterSpacing: '1px' }}>RACE</span><br/><span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{DEMO_RACE_INFO.race}</span></div>
            <div><span style={{ color: 'var(--text-secondary)', fontSize: '10px', letterSpacing: '1px' }}>LAP</span><br/><span className="mono" style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{lapCounter} / 78</span></div>
            <div><span style={{ color: 'var(--text-secondary)', fontSize: '10px', letterSpacing: '1px' }}>POSITION</span><br/><span className="mono" style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '16px' }}>{DEMO_RACE_INFO.position}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border-card)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #e74c3c, #c0392b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>16</div>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>A. Leclerc</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Team Scuderia</div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Dashboard Grid */}
        <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto 1fr', gap: '20px', alignContent: 'start' }}>
          
          <LiveRadio 
            onAudioUpload={handleAudioUpload} 
            isLive={isLive} 
            currentAnalysis={currentAnalysis}
            onPlaybackProgress={handlePlaybackProgress}
            onLiveSpeechUpdate={handleLiveSpeechUpdate}
          />
          
          <DriverState state={driverState} />
          
          <AlertsInsights alerts={alerts} stressLevel={driverState.stress.level} stressValue={driverState.stress.value} />
          
          <StateChart data={timelineData} />
          
          <RadioTimeline entries={radioEntries} />
          
        </div>
        
        {/* Footer */}
        <PerformanceBar isLive={isLive} />
        
      </div>
    </div>
  );
};

export default App;
