import React from 'react';

const fmtLap = (secs) => {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(3);
  return `${m}:${s.padStart(6, '0')}`;
};

const fmtDelta = (delta) => {
  if (delta == null) return null;
  const sign = delta >= 0 ? '+' : '−';
  return `(${sign}${Math.abs(delta).toFixed(3)}s)`;
};

// All values real, from OpenF1 race context of the analyzed clip's driver.
const PerformanceBar = ({ isLive, context, analyzedLap, tyre }) => {
  const best = context?.best_lap || null;

  // The lap the last-analyzed radio message was sent on
  const lapRow = analyzedLap != null && context?.laps
    ? context.laps.find(l => l.lap === analyzedLap)
    : null;
  const lapDelta = lapRow?.time != null && best?.time != null ? lapRow.time - best.time : null;

  // Real sector deltas vs best lap's sectors
  const sectorDeltas = lapRow && best
    ? ['s1', 's2', 's3'].map(k => (lapRow[k] != null && best[k] != null ? lapRow[k] - best[k] : null))
    : [null, null, null];
  const worstSectorIdx = sectorDeltas.reduce(
    (acc, d, i) => (d != null && (acc === -1 || d > sectorDeltas[acc]) ? i : acc), -1
  );

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
          <div className={isLive ? 'pulse' : ''} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isLive ? 'var(--accent-red)' : 'var(--text-secondary)' }}></div>
          <span style={{ color: isLive ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: 'bold' }}>{isLive ? 'LIVE' : 'OFFLINE'}</span>
        </div>
        <div className="mono" style={{ fontSize: '12px' }}>
          {context?.session?.label || 'No session data'}
          {context?.session?.circuit ? ` · ${context.session.circuit}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '32px' }} className="mono">
        <div>Best Lap: <span style={{ color: 'var(--text-primary)' }}>{fmtLap(best?.time)}</span>{best?.lap ? <span style={{ fontSize: '11px' }}> L{best.lap}</span> : null}</div>
        <div>
          Radio Lap: <span style={{ color: 'var(--text-primary)' }}>{lapRow ? fmtLap(lapRow.time) : '—'}</span>
          {lapDelta != null && (
            <span style={{ color: lapDelta > 0 ? 'var(--accent-red)' : 'var(--accent-teal)', marginLeft: '6px' }}>{fmtDelta(lapDelta)}</span>
          )}
        </div>
        <div>
          {worstSectorIdx >= 0 ? (
            <>Sector {worstSectorIdx + 1}: <span style={{ color: sectorDeltas[worstSectorIdx] > 0 ? 'var(--accent-orange)' : 'var(--accent-teal)' }}>{fmtDelta(sectorDeltas[worstSectorIdx])}</span></>
          ) : (
            <>Sectors: <span style={{ color: 'var(--text-primary)' }}>—</span></>
          )}
        </div>
        <div>
          Tyres: <span style={{ color: 'var(--text-primary)' }}>
            {tyre ? `${tyre.compound || 'UNKNOWN'} · ${tyre.age} laps` : '—'}
          </span>
        </div>
      </div>

      <div className="mono" style={{ fontSize: '11px' }}>
        Data: OpenF1
      </div>
    </div>
  );
};

export default PerformanceBar;
