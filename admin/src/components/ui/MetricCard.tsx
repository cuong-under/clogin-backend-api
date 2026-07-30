import React from 'react';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value?: number | string;
  change?: string;
  changeType?: 'increase' | 'decrease' | 'neutral';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  loading = false,
}) => {
  if (loading) return <Skeleton type="metric" />;

  return (
    <Card className="hover:border-[#00f0ff]/50 transition-colors bg-gradient-to-br from-[#0a202a] to-[#112b38] border-[#194354]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#6b9eb3] uppercase tracking-wider">{title}</span>
        {icon && <div className="p-2 rounded-lg bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/20">{icon}</div>}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <h3 className="text-2.5xl font-extrabold text-[#00f0ff] tracking-tight drop-shadow-[0_0_10px_rgba(0,240,255,0.2)]">
          {typeof value === 'number' ? value.toLocaleString('vi-VN') : value ?? 0}
        </h3>

        {change && (
          <div
            className={cn(
              'flex items-center text-xs font-semibold gap-0.5',
              changeType === 'increase' && 'text-[#00ffb7]',
              changeType === 'decrease' && 'text-[#ff2a6d]',
              changeType === 'neutral' && 'text-[#6b9eb3]'
            )}
          >
            {changeType === 'increase' && <TrendingUp className="w-3.5 h-3.5" />}
            {changeType === 'decrease' && <TrendingDown className="w-3.5 h-3.5" />}
            <span>{change}</span>
          </div>
        )}
      </div>
    </Card>
  );
};
