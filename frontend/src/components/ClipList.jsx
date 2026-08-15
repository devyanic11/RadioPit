import React from 'react';
import { Radio, Loader2, Zap } from 'lucide-react';

const stressColor = (s) => s >= 75 ? 'var(--accent-red)' : s >= 55 ? 'var(--accent-orange)' : s >= 30 ? 'var(--accent-yellow)' : 'var(--accent-teal)';

// Horizontal strip of radio clips in race order.
// status per clip: undefined | 'analyzing' | analysis result object
const ClipList = ({ clips, analyses, analyzingId, selectedClipId, onSelect }) => {
  if (!clips || clips.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
      {clips.map((clip) => {
        const analysis = analyses[clip.clip_id];
        const isAnalyzing = analyzingId === clip.clip_id;
        const isSelected = selectedClipId === clip.clip_id;
        const stress = analysis ? Math.round(analysis.driver_state?.stress?.score ?? 0) : null;
        const border = isSelected ? 'var(--accent-teal)' : stress != null ? `${stressColor(stress)}66` : 'var(--border-card)';

        return (
          <div
            key={clip.clip_id}
            onClick={() => onSelect(clip)}
            style={{
              minWidth: '150px', maxWidth: '150px', cursor: 'pointer',
              padding: '8px 10px', borderRadius: '8px',
              background: isSelected ? 'rgba(26,188,156,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${border}`,
              transition: 'all 0.15s', flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span className="mono" style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                <Radio size={9} style={{ verticalAlign: '-1px' }} color="var(--accent-teal)" /> {clip.lap != null ? `LAP ${clip.lap}` : 'PRE'}
              </span>
              {isAnalyzing ? (
                <Loader2 size={11} className="spin" color="var(--accent-yellow)" />
              ) : stress != null ? (
                <span className="mono" style={{ fontSize: '10px', fontWeight: 'bold', color: stressColor(stress) }}>
                  <Zap size={9} style={{ verticalAlign: '-1px' }} /> {stress}%
                </span>
              ) : (
                <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>PENDING</span>
              )}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.35 }}>
              {clip.transcription_gt || '(no transcript)'}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ClipList;
