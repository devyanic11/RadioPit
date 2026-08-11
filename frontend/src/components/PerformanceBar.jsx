import React, { useState, useEffect } from 'react';

const PerformanceBar = () => {
  const [sessionTime, setSessionTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: '60px',
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border-card)',
      fontSize: '14px',
      color: 'var(--text-secondary)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-red)' }}></div>
          <span style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>LIVE</span>
        </div>
        <div className="mono">SESSION TIME {formatTime(sessionTime)}</div>
      </div>
      
      <div style={{ display: 'flex', gap: '32px' }} className="mono">
        <div>Best Lap: <span style={{ color: 'var(--text-primary)' }}>1:31.278</span></div>
        <div>Last Lap: <span style={{ color: 'var(--text-primary)' }}>1:34.042</span> <span style={{ color: 'var(--accent-red)' }}>(+2.764s)</span></div>
        <div>Sector 2: <span style={{ color: 'var(--accent-orange)' }}>+1.237s</span></div>
        <div>Tyre Age: <span style={{ color: 'var(--text-primary)' }}>18 Laps</span></div>
        <div>Fuel Load: <span style={{ color: 'var(--text-primary)' }}>28.4 kg</span></div>
      </div>
      
      <div style={{ width: '60px', height: '30px', border: '2px solid var(--text-secondary)', borderRadius: '15px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '-4px', left: '10px', width: '6px', height: '6px', backgroundColor: 'var(--accent-red)', borderRadius: '50%' }}></div>
      </div>
    </div>
  );
};

export default PerformanceBar;
