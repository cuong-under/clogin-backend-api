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
    <Card className="hover:border-slate-600 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        {icon && <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">{icon}</div>}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <h3 className="text-2xl font-bold text-slate-50 tracking-tight">
          {typeof value === 'number' ? value.toLocaleString('vi-VN') : value ?? 0}
        </h3>

        {change && (
          <div
            className={cn(
              'flex items-center text-xs font-medium gap-0.5',
              changeType === 'increase' && 'text-emerald-400',
              changeType === 'decrease' && 'text-rose-400',
              changeType === 'neutral' && 'text-slate-400'
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
