import React from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

const fmtLap = (secs) => {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2);
  return `${m}:${s.padStart(5, '0')}`;
};

// MOOD vs LAP PERFORMANCE — the problem statement's core visual.
// data: [{ lap, lapTime (real, OpenF1, pit laps excluded), stress (only at radio laps) }]
const StateChart = ({ data, driverLabel, bestLapTime }) => {
  const hasData = data && data.length > 0;
  const radioLaps = hasData ? data.filter(d => d.stress != null).length : 0;

  return (
    <div className="card" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '1px' }}>MOOD vs LAP PERFORMANCE</h2>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {hasData
            ? `${driverLabel || ''} · real lap times (OpenF1) · ${radioLaps} radio ${radioLaps === 1 ? 'call' : 'calls'} analyzed`
            : 'Waiting for race data'}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: '250px' }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
              <XAxis dataKey="lap" stroke="var(--text-secondary)" tick={{fontSize: 12}} tickFormatter={(val) => `L${val}`} />
              <YAxis yAxisId="stress" stroke="var(--text-secondary)" tick={{fontSize: 12}} domain={[0, 100]} label={{ value: 'Stress %', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 11, dx: 20 }} />
              <YAxis yAxisId="time" orientation="right" stroke="var(--text-secondary)" tick={{fontSize: 12}} domain={['auto', 'auto']} tickFormatter={fmtLap} width={70} />

              <ReferenceLine y={75} yAxisId="stress" stroke="rgba(231, 76, 60, 0.25)" strokeDasharray="3 3" />
              {bestLapTime != null && (
                <ReferenceLine y={bestLapTime} yAxisId="time" stroke="rgba(26, 188, 156, 0.35)" strokeDasharray="4 4" label={{ value: 'best', fill: 'var(--accent-teal)', fontSize: 10, position: 'right' }} />
              )}

              <Tooltip
                contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--border-card)', borderRadius: '8px' }}
                labelStyle={{ color: 'var(--text-secondary)' }}
                labelFormatter={(lap) => `Lap ${lap}`}
                formatter={(value, name) => name === 'Lap Time' ? [fmtLap(value), name] : [`${Math.round(value)}%`, name]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              <Line yAxisId="time" type="monotone" dataKey="lapTime" name="Lap Time" stroke="var(--text-secondary)" strokeWidth={1.5} dot={false} connectNulls />
              <Line
                yAxisId="stress"
                type="monotone"
                dataKey="stress"
                name="Stress (radio)"
                stroke="var(--accent-red)"
                strokeWidth={2}
                connectNulls
                dot={{ r: 5, fill: 'var(--accent-red)', stroke: '#fff', strokeWidth: 1 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
            Race data loads when the backend connects — analyze a radio clip to pin stress onto the lap chart
          </div>
        )}
      </div>

      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '6px' }}>
        Pit-stop laps excluded from the lap-time trace. Red dots mark laps with an analyzed radio message.
      </div>
    </div>
  );
};

export default StateChart;
