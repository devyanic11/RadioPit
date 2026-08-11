import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

const AlertsInsights = ({ alerts, stressLevel = 'LOW', stressValue = 0 }) => {
  const showBanner = stressLevel === 'HIGH' || stressLevel === 'CRITICAL';
  
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '1px', marginBottom: '24px' }}>ALERTS & INSIGHTS</h2>
      
      {showBanner && (
        <div style={{ 
          border: '1px solid var(--accent-red)', 
          background: 'rgba(231, 76, 60, 0.1)', 
          borderRadius: '6px', 
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          boxShadow: '0 0 15px rgba(231, 76, 60, 0.15)'
        }}>
          <AlertTriangle color="var(--accent-red)" size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ color: 'var(--accent-red)', fontWeight: 'bold', letterSpacing: '0.5px', fontSize: '14px' }}>ELEVATED STRESS DETECTED</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>Stress has increased to {stressValue}% over the last radio calls.</div>
          </div>
        </div>
      )}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        {alerts.map(alert => (
          <div key={alert.id} style={{ display: 'flex', gap: '12px' }}>
            {alert.type === 'warning' ? <AlertTriangle size={18} color="var(--accent-orange)" /> : <Info size={18} color="var(--accent-teal)" />}
            <div>
              <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>{alert.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{alert.subtitle}</div>
            </div>
          </div>
        ))}
      </div>
      
      <button style={{
        marginTop: '24px',
        width: '100%',
        padding: '12px',
        background: 'var(--accent-red)',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontWeight: 'bold',
        cursor: 'pointer',
        letterSpacing: '1px',
        transition: 'background 0.2s'
      }} onMouseOver={(e) => e.target.style.background = '#c0392b'} onMouseOut={(e) => e.target.style.background = 'var(--accent-red)'}>
        MARK FOR RACE ENGINEER REVIEW
      </button>
    </div>
  );
};

export default AlertsInsights;
