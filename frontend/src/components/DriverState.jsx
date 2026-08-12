import React from 'react';
import { Zap, Flame, BatteryWarning, Cpu } from 'lucide-react';

const ProgressBar = ({ label, icon: Icon, value, color, level }) => {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon size={16} color={color} />
          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>{label}</span>
          <span style={{ 
            fontSize: '10px', 
            padding: '2px 6px', 
            borderRadius: '4px', 
            background: `${color}33`, 
            color: color,
            fontWeight: 'bold'
          }}>{level}</span>
        </div>
        <span className="mono" style={{ fontSize: '14px', color }}>{value}%</span>
      </div>
      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ 
          width: `${value}%`, 
          height: '100%', 
          background: color, 
          borderRadius: '4px',
          transition: 'width 1s ease-out'
        }}></div>
      </div>
    </div>
  );
};

const DriverState = ({ state, stressTrend = null }) => {
  // stressTrend: real % change vs mean of previous radio calls (null until 2+ analyses)
  const trendUp = stressTrend != null && stressTrend > 0;
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '1px' }}>DRIVER STATE</h2>
        {stressTrend != null && (
          <span style={{ fontSize: '12px', color: trendUp ? 'var(--accent-red)' : 'var(--accent-teal)' }}>
            Trending {trendUp ? '↗' : '↘'}
          </span>
        )}
      </div>

      <ProgressBar label="Stress" icon={Zap} value={state.stress.value} level={state.stress.level} color="var(--accent-red)" />
      <ProgressBar label="Frustration" icon={Flame} value={state.frustration.value} level={state.frustration.level} color="var(--accent-orange)" />
      <ProgressBar label="Fatigue" icon={BatteryWarning} value={state.fatigue.value} level={state.fatigue.level} color="var(--accent-yellow)" />
      <ProgressBar label="Mental Load" icon={Cpu} value={state.mentalLoad.value} level={state.mentalLoad.level} color="var(--accent-teal)" />

      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-card)', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {stressTrend != null ? (
          <>Stress vs previous radio calls: <span style={{ color: trendUp ? 'var(--accent-red)' : 'var(--accent-teal)' }}>{trendUp ? '↑' : '↓'}{Math.abs(Math.round(stressTrend))}%</span></>
        ) : (
          <>Analyze more radio calls to see the trend</>
        )}
      </div>
    </div>
  );
};

export default DriverState;
