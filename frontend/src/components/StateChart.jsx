import React from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

const StateChart = ({ data }) => {
  return (
    <div className="card" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '1px' }}>STATE OVER TIME</h2>
        <select style={{ 
          background: 'var(--bg-dark)', 
          color: 'var(--text-primary)', 
          border: '1px solid var(--border-card)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <option>Last 15 Laps</option>
          <option>Last 30 Laps</option>
          <option>Full Session</option>
        </select>
      </div>
      
      <div style={{ flex: 1, minHeight: '250px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-red)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--accent-red)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
            <XAxis dataKey="lap" stroke="var(--text-secondary)" tick={{fontSize: 12}} tickFormatter={(val) => `L${val}`} />
            <YAxis yAxisId="left" stroke="var(--text-secondary)" tick={{fontSize: 12}} domain={[0, 100]} />
            <YAxis yAxisId="right" orientation="right" stroke="var(--text-secondary)" tick={{fontSize: 12}} domain={['auto', 'auto']} />
            
            <ReferenceLine y={75} yAxisId="left" stroke="rgba(231, 76, 60, 0.2)" strokeDasharray="3 3" />
            <ReferenceLine y={50} yAxisId="left" stroke="rgba(241, 196, 15, 0.2)" strokeDasharray="3 3" />
            
            <Tooltip 
              contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--border-card)', borderRadius: '8px' }}
              labelStyle={{ color: 'var(--text-secondary)' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            
            <Area yAxisId="left" type="monotone" dataKey="stress" name="Stress" stroke="none" fillOpacity={1} fill="url(#colorStress)" />
            <Line yAxisId="left" type="monotone" dataKey="stress" name="Stress" stroke="var(--accent-red)" strokeWidth={2} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="frustration" name="Frustration" stroke="var(--accent-orange)" strokeWidth={2} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="fatigue" name="Fatigue" stroke="var(--accent-yellow)" strokeWidth={2} dot={false} />
            
            <Line yAxisId="right" type="step" dataKey="lapTime" name="Lap Time (s)" stroke="var(--text-secondary)" strokeWidth={1} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StateChart;
