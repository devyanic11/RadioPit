import React from 'react';
import { Play } from 'lucide-react';

const RadioTimeline = ({ entries }) => {
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'HIGH': return 'var(--accent-red)';
      case 'ELEVATED': return 'var(--accent-orange)';
      case 'MODERATE': return 'var(--accent-yellow)';
      default: return 'var(--accent-green)';
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '1px' }}>RADIO TIMELINE</h2>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{entries.length} analyzed</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
        {entries.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', padding: '16px 0' }}>
            No radio calls analyzed yet — play a clip from the Real Team Radio library.
          </div>
        )}
        <div style={{ position: 'relative', paddingLeft: '20px' }}>
          <div style={{ position: 'absolute', left: '7px', top: '10px', bottom: '0', width: '2px', background: 'var(--border-card)' }}></div>
          
          {entries.map((entry, index) => (
            <div key={entry.id} className="slide-in" style={{ position: 'relative', marginBottom: '24px', animationDelay: `${index * 0.1}s` }}>
              <div style={{ 
                position: 'absolute', 
                left: '-20px', 
                top: '4px', 
                width: '16px', 
                height: '16px', 
                borderRadius: '50%', 
                background: 'var(--bg-dark)',
                border: `2px solid ${getSeverityColor(entry.severity)}`,
                zIndex: 1
              }}></div>
              
              <div style={{ 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--border-card)', 
                borderRadius: '8px', 
                padding: '12px',
                transition: 'background 0.2s'
              }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}>
                      <Play size={12} fill="currentColor" />
                    </div>
                    <span className="mono" style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{entry.lap != null ? `LAP ${entry.lap}` : 'UPLOAD'}</span>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{entry.timestamp}</span>
                  </div>
                  <span style={{ 
                    fontSize: '10px', 
                    fontWeight: 'bold', 
                    padding: '2px 6px', 
                    borderRadius: '4px', 
                    background: `${getSeverityColor(entry.severity)}33`,
                    color: getSeverityColor(entry.severity)
                  }}>{entry.severity}</span>
                </div>
                
                <div style={{ fontStyle: 'italic', fontSize: '14px', marginBottom: '12px', color: '#fff' }}>
                  "{entry.transcript}"
                </div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {entry.tags.map(tag => (
                    <span key={tag} style={{ 
                      fontSize: '11px', 
                      padding: '2px 8px', 
                      borderRadius: '12px', 
                      background: 'rgba(255,255,255,0.1)', 
                      color: 'var(--text-secondary)' 
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RadioTimeline;
