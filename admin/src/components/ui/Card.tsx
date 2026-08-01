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
    <div className={cn('rounded-xl bg-gradient-to-br from-[#0a202a] to-[#112b38] border border-[#194354] shadow-xl backdrop-blur-md overflow-hidden', className)}>
      {(title || extra) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-[#194354] bg-[#07151c]/60">
          <div>
            {typeof title === 'string' ? (
              <h3 className="text-base font-bold text-white tracking-wide">{title}</h3>
            ) : (
              title
            )}
            {subtitle && <p className="text-xs text-[#6b9eb3] mt-0.5">{subtitle}</p>}
          </div>
          {extra && <div className="shrink-0">{extra}</div>}
        </div>
      )}
      <div className={cn('p-4 sm:p-6', bodyClassName)}>{children}</div>
    </div>
  );
};
