import React from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

const fmtLap = (secs) => {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2);
  return `${m}:${s.padStart(5, '0')}`;
};

// The story: real lap times (FastF1) with stress pinned at radio laps.
// data: [{ lap, lapTime, stress|null, hasRadio }]
const StoryChart = ({ data, bestLapTime, onLapClick, selectedLap }) => {
  const hasData = data && data.length > 0;

  const RadioDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload?.stress == null || cx == null) return null;
    const isSel = payload.lap === selectedLap;
    return (
      <circle
        cx={cx} cy={cy} r={isSel ? 7 : 5}
        fill="var(--accent-red)"
        stroke={isSel ? '#fff' : 'rgba(255,255,255,0.6)'}
        strokeWidth={isSel ? 2 : 1}
        style={{ cursor: 'pointer' }}
      />
    );
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: '220px' }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 0, left: -14, bottom: 0 }}
              onClick={(e) => {
                if (e && e.activeLabel != null && onLapClick) onLapClick(Number(e.activeLabel));
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
              <XAxis dataKey="lap" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} tickFormatter={(v) => `L${v}`} />
              <YAxis yAxisId="stress" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} domain={[0, 100]} />
              <YAxis yAxisId="time" orientation="right" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={fmtLap} width={64} />

              <ReferenceLine y={75} yAxisId="stress" stroke="rgba(231, 76, 60, 0.25)" strokeDasharray="3 3" />
              {bestLapTime != null && (
                <ReferenceLine y={bestLapTime} yAxisId="time" stroke="rgba(26, 188, 156, 0.35)" strokeDasharray="4 4" />
              )}

              <Tooltip
                contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--border-card)', borderRadius: '8px' }}
                labelStyle={{ color: 'var(--text-secondary)' }}
                labelFormatter={(lap) => `Lap ${lap}`}
                formatter={(value, name) => name === 'Lap Time' ? [fmtLap(value), name] : [`${Math.round(value)}%`, name]}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />

              <Line yAxisId="time" type="monotone" dataKey="lapTime" name="Lap Time" stroke="var(--text-secondary)" strokeWidth={1.5} dot={false} connectNulls />
              <Line yAxisId="stress" type="monotone" dataKey="stress" name="Stress (radio)" stroke="var(--accent-red)" strokeWidth={2} connectNulls dot={<RadioDot />} activeDot={{ r: 7 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
            Pick a Grand Prix and driver, then hit RUN
          </div>
        )}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', flexShrink: 0 }}>
        Grey line: official lap times (FastF1, pit laps excluded) · Red dots: analyzed radio calls — click one to inspect
      </div>
    </div>
  );
};

export default StoryChart;
