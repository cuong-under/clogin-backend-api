import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
  type?: 'line' | 'card' | 'table' | 'metric';
  lines?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, type = 'line', lines = 3 }) => {
  if (type === 'metric') {
    return (
      <div className={cn('p-6 rounded-xl bg-slate-800 border border-slate-700 animate-pulse space-y-3', className)}>
        <div className="h-4 bg-slate-700 rounded w-1/3" />
        <div className="h-8 bg-slate-700 rounded w-1/2" />
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={cn('p-6 rounded-xl bg-slate-800 border border-slate-700 animate-pulse space-y-4', className)}>
        <div className="h-5 bg-slate-700 rounded w-1/4" />
        <div className="h-32 bg-slate-700/60 rounded" />
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-700/40 rounded w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn('h-4 bg-slate-700/60 rounded', i === lines - 1 ? 'w-2/3' : 'w-full', className)}
        />
      ))}
    </div>
  );
};
