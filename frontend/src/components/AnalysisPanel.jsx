import React, { useRef, useState } from 'react';
import { Play, Pause, BrainCircuit, Headset, CheckCircle2 } from 'lucide-react';

const FUSION_COMPONENTS = [
  { key: 'acoustic_stress', label: 'Acoustic (wav2vec2)', weight: '35%', color: 'var(--accent-red)' },
  { key: 'prosody_stress', label: 'Prosody (Praat DSP)', weight: '25%', color: 'var(--accent-orange)' },
  { key: 'nlp_stress', label: 'Language (DistilBERT)', weight: '25%', color: 'var(--accent-yellow)' },
  { key: 'keyword_boost', label: 'F1 Keywords', weight: '15%', color: 'var(--accent-teal)' }
];

const PRIORITY_COLORS = { critical: 'var(--accent-red)', high: 'var(--accent-orange)', medium: 'var(--accent-yellow)', low: 'var(--accent-teal)' };

const Gauge = ({ label, value, level, color }) => (
  <div style={{ flex: 1, minWidth: '90px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="mono" style={{ color, fontWeight: 'bold' }}>{value}%</span>
    </div>
    <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, transition: 'width 0.5s' }} />
    </div>
    <div style={{ fontSize: '8px', color, marginTop: '2px', letterSpacing: '0.5px', fontWeight: 'bold' }}>{level}</div>
  </div>
);

const AnalysisPanel = ({ clip, analysis, analyzing, apiBase }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  if (!clip && !analysis) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
        Select a radio call from the strip below —<br/>or hit RUN to analyze them all
      </div>
    );
  }

  const ds = analysis?.driver_state;
  const signals = analysis?.signals;
  const subScores = signals?.sub_scores;
  const keywords = signals?.nlp?.f1_keywords || [];
  const recs = analysis?.recommendations || [];
  const gt = analysis?.transcription_gt ?? clip?.transcription_gt;
  const whisperText = analysis?.transcript;
  const similarity = analysis?.asr_similarity;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  return (
    <div style={{ overflowY: 'auto', height: '100%', paddingRight: '6px' }}>
      {/* Clip header + player */}
      {clip && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <button onClick={togglePlay} style={{ background: 'var(--accent-red)', border: 'none', color: '#fff', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            {playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <audio ref={audioRef} src={`${apiBase}${clip.audio_url}`} onEnded={() => setPlaying(false)} style={{ display: 'none' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {clip.acronym} · {clip.lap != null ? `Lap ${clip.lap}` : 'Pre-race'}
            </div>
            <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{clip.ts?.replace('T', ' ').replace('Z', ' UTC')}</div>
          </div>
        </div>
      )}

      {analyzing && (
        <div style={{ color: 'var(--accent-yellow)', fontSize: '12px', fontStyle: 'italic', marginBottom: '12px' }}>
          Running Whisper + emotion models…
        </div>
      )}

      {/* Transcripts: Whisper vs dataset ground truth */}
      {(whisperText || gt) && (
        <div style={{ marginBottom: '14px' }}>
          {whisperText && (
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '10px', marginBottom: '6px' }}>
              <div style={{ fontSize: '9px', color: 'var(--accent-yellow)', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '4px' }}>WHISPER TRANSCRIPT</div>
              <div style={{ fontSize: '13px', color: '#fff', fontStyle: 'italic' }}>"{whisperText}"</div>
            </div>
          )}
          {gt && (
            <div style={{ background: 'rgba(26,188,156,0.05)', border: '1px solid rgba(26,188,156,0.3)', borderRadius: '8px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '9px', color: 'var(--accent-teal)', letterSpacing: '1px', fontWeight: 'bold' }}>GROUND TRUTH (HF DATASET)</span>
                {similarity != null && (
                  <span className="mono" style={{ fontSize: '9px', color: 'var(--accent-teal)' }}>
                    <CheckCircle2 size={9} style={{ verticalAlign: '-1px' }} /> {Math.round(similarity * 100)}% match
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontStyle: 'italic' }}>"{gt}"</div>
            </div>
          )}
        </div>
      )}

      {/* Driver state gauges */}
      {ds && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <Gauge label="Stress" value={Math.round(ds.stress.score)} level={ds.stress.level} color="var(--accent-red)" />
          <Gauge label="Frustration" value={Math.round(ds.frustration.score)} level={ds.frustration.level} color="var(--accent-orange)" />
          <Gauge label="Fatigue" value={Math.round(ds.fatigue.score)} level={ds.fatigue.level} color="var(--accent-yellow)" />
          <Gauge label="Mental Load" value={Math.round(ds.mental_load.score)} level={ds.mental_load.level} color="var(--accent-teal)" />
        </div>
      )}

      {/* Why this score */}
      {subScores && (
        <div style={{ marginBottom: '14px', padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-card)', borderRadius: '8px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-primary)', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <BrainCircuit size={12} color="var(--accent-teal)" /> WHY THIS SCORE
          </div>
          {FUSION_COMPONENTS.map(c => (
            <div key={c.key} style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '2px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{c.label} · {c.weight}</span>
                <span className="mono" style={{ color: 'var(--text-primary)' }}>{Math.round((subScores[c.key] || 0) * 100)}</span>
              </div>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                <div style={{ width: `${Math.min((subScores[c.key] || 0) * 100, 100)}%`, height: '100%', background: c.color, borderRadius: '2px' }} />
              </div>
            </div>
          ))}
          {keywords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
              {keywords.map((k, i) => (
                <span key={i} style={{ fontSize: '9px', padding: '1px 7px', borderRadius: '8px', color: 'var(--accent-yellow)', border: '1px solid rgba(241,196,15,0.4)' }}>{k.word}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Engineer actions */}
      {recs.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-primary)', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Headset size={12} color="var(--accent-orange)" /> ENGINEER ACTIONS
          </div>
          {recs.map((rec, i) => (
            <div key={i} style={{ padding: '7px 9px', borderRadius: '6px', border: `1px solid ${PRIORITY_COLORS[rec.priority] || 'var(--border-card)'}44`, background: 'rgba(255,255,255,0.02)', marginBottom: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>{rec.title}</span>
                <span style={{ fontSize: '8px', fontWeight: 'bold', color: PRIORITY_COLORS[rec.priority], flexShrink: 0 }}>{rec.priority.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{rec.detail}</div>
              {rec.because && <div className="mono" style={{ fontSize: '8px', color: PRIORITY_COLORS[rec.priority], marginTop: '2px', opacity: 0.8 }}>↳ {rec.because}</div>}
            </div>
          ))}
        </div>
      )}

      {!analyzing && !analysis && clip && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>
          Not analyzed yet — hit RUN, or click this clip's ANALYZE button below.
        </div>
      )}
    </div>
  );
};

export default AnalysisPanel;
