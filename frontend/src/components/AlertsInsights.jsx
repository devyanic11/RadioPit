import React from 'react';
import { AlertTriangle, Info, BrainCircuit, Headset } from 'lucide-react';

const PRIORITY_STYLES = {
  critical: { color: 'var(--accent-red)', border: 'rgba(231, 76, 60, 0.5)' },
  high: { color: 'var(--accent-orange)', border: 'rgba(230, 126, 34, 0.5)' },
  medium: { color: 'var(--accent-yellow)', border: 'rgba(241, 196, 15, 0.4)' },
  low: { color: 'var(--accent-teal)', border: 'rgba(26, 188, 156, 0.4)' }
};

const EngineerActions = ({ recommendations }) => {
  if (!recommendations || recommendations.length === 0) return null;
  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ fontSize: '11px', color: 'var(--text-primary)', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Headset size={13} color="var(--accent-orange)" /> ENGINEER ACTIONS
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {recommendations.map((rec, i) => {
          const st = PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.low;
          return (
            <div key={i} style={{ padding: '8px 10px', borderRadius: '6px', border: `1px solid ${st.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{rec.title}</span>
                <span style={{ fontSize: '8px', fontWeight: 'bold', letterSpacing: '1px', color: st.color, border: `1px solid ${st.border}`, padding: '1px 6px', borderRadius: '8px', flexShrink: 0 }}>
                  {rec.priority.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>{rec.detail}</div>
              {rec.because && (
                <div className="mono" style={{ fontSize: '9px', color: st.color, marginTop: '3px', opacity: 0.8 }}>↳ {rec.because}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Mirrors backend config.FUSION_WEIGHTS
const FUSION_COMPONENTS = [
  { key: 'acoustic_stress', label: 'Acoustic (wav2vec2)', weight: '35%', color: 'var(--accent-red)' },
  { key: 'prosody_stress', label: 'Prosody (Praat DSP)', weight: '25%', color: 'var(--accent-orange)' },
  { key: 'nlp_stress', label: 'Language (DistilBERT)', weight: '25%', color: 'var(--accent-yellow)' },
  { key: 'keyword_boost', label: 'F1 Keywords', weight: '15%', color: 'var(--accent-teal)' }
];

const SubScoreBar = ({ label, weight, value, color }) => (
  <div style={{ marginBottom: '8px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label} <span style={{ opacity: 0.6 }}>· {weight}</span></span>
      <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{Math.round(value * 100)}</span>
    </div>
    <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(value * 100, 100)}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
    </div>
  </div>
);

const WhyThisScore = ({ signals }) => {
  const subScores = signals?.sub_scores;
  if (!subScores) return null;

  const sentiment = signals?.nlp?.sentiment;
  const keywords = signals?.nlp?.f1_keywords || [];
  const complaints = signals?.nlp?.complaints || [];
  const prosody = signals?.prosody?.raw;

  return (
    <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-card)', borderRadius: '8px' }}>
      <h3 style={{ fontSize: '11px', color: 'var(--text-primary)', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <BrainCircuit size={13} color="var(--accent-teal)" /> WHY THIS SCORE
      </h3>

      {FUSION_COMPONENTS.map(c => (
        <SubScoreBar key={c.key} label={c.label} weight={c.weight} value={subScores[c.key] || 0} color={c.color} />
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '10px' }}>
        {sentiment?.label && (
          <span style={{
            fontSize: '9px', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', letterSpacing: '0.5px',
            color: sentiment.label === 'negative' ? 'var(--accent-red)' : sentiment.label === 'positive' ? 'var(--accent-teal)' : 'var(--text-secondary)',
            border: `1px solid ${sentiment.label === 'negative' ? 'var(--accent-red)' : sentiment.label === 'positive' ? 'var(--accent-teal)' : 'var(--border-card)'}`
          }}>
            {sentiment.label.toUpperCase()} {Math.round((sentiment.score || 0) * 100)}%
          </span>
        )}
        {keywords.map((k, i) => (
          <span key={i} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', color: 'var(--accent-yellow)', border: '1px solid rgba(241, 196, 15, 0.4)' }}>
            {k.word}
          </span>
        ))}
        {complaints.map((c, i) => (
          <span key={`c${i}`} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', color: 'var(--accent-red)', border: '1px solid rgba(231, 76, 60, 0.4)' }}>
            "{c.phrase}"
          </span>
        ))}
      </div>

      {prosody && (
        <div className="mono" style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '9px', color: 'var(--text-secondary)' }}>
          <span>Pitch σ {Math.round(prosody.pitch_std_hz || 0)}Hz</span>
          <span>{(prosody.speech_rate_wps || 0).toFixed(1)} w/s</span>
          <span>Jitter {(prosody.jitter_percent || 0).toFixed(1)}%</span>
          <span>HNR {Math.round(prosody.hnr_db || 0)}dB</span>
        </div>
      )}
    </div>
  );
};

const AlertsInsights = ({ alerts, stressLevel = 'LOW', stressValue = 0, signals = null, recommendations = [] }) => {
  const showBanner = stressLevel === 'HIGH' || stressLevel === 'CRITICAL';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '1px', marginBottom: '16px' }}>ALERTS & INSIGHTS</h2>

      <EngineerActions recommendations={recommendations} />

      <WhyThisScore signals={signals} />

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
