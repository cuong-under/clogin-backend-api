import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps {
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'default' | 'purple' | 'orange';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className }) => {
  const variants = {
    success: 'bg-[#00ffb7]/12 text-[#00ffb7] border-[#00ffb7]/30 font-semibold',
    danger: 'bg-[#ff2a6d]/12 text-[#ff2a6d] border-[#ff2a6d]/30 font-semibold',
    warning: 'bg-[#ffb703]/12 text-[#ffb703] border-[#ffb703]/30 font-semibold',
    info: 'bg-[#00f0ff]/12 text-[#00f0ff] border-[#00f0ff]/30 font-semibold',
    default: 'bg-[#183747] text-[#b0d5e3] border-[#275c73]',
    purple: 'bg-[#e040fb]/12 text-[#e040fb] border-[#e040fb]/30 font-semibold',
    orange: 'bg-orange-500/12 text-orange-400 border-orange-500/30 font-semibold',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
};
