import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  title?: React.ReactNode;
  subtitle?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  extra,
  children,
  className,
  bodyClassName,
}) => {
  return (
    <div className={cn('rounded-xl bg-slate-800 border border-slate-700/80 shadow-md overflow-hidden', className)}>
      {(title || extra) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/70">
          <div>
            {typeof title === 'string' ? (
              <h3 className="text-base font-semibold text-slate-100">{title}</h3>
            ) : (
              title
            )}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {extra && <div>{extra}</div>}
        </div>
      )}
      <div className={cn('p-6', bodyClassName)}>{children}</div>
    </div>
  );
};
