'use client';

import React from 'react';
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';

export interface PieChartProps {
  data: any[];
  nameKey: string;
  valueKey: string;
  colors?: string[];
  height?: number;
}

const DEFAULT_COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'];

export const PieChart: React.FC<PieChartProps> = ({
  data,
  nameKey,
  valueKey,
  colors = DEFAULT_COLORS,
  height = 300,
}) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RePieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={5}
            dataKey={valueKey}
            nameKey={nameKey}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              borderColor: '#334155',
              borderRadius: '8px',
              color: '#f8fafc',
            }}
          />
          <Legend formatter={(value) => <span className="text-xs text-slate-300">{value}</span>} />
        </RePieChart>
      </ResponsiveContainer>
    </div>
  );
};
