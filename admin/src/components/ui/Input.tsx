'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, rightElement, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-[#b0d5e3]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && <div className="absolute left-3 text-[#6b9eb3] pointer-events-none">{icon}</div>}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full rounded-lg bg-[#112b38] border border-[#194354] px-3.5 py-2 text-sm text-white placeholder-[#487385] focus:outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] transition-colors',
              icon && 'pl-9',
              rightElement && 'pr-10',
              error && 'border-[#ff2a6d] focus:border-[#ff2a6d] focus:ring-[#ff2a6d]',
              className
            )}
            {...props}
          />
          {rightElement && <div className="absolute right-3 flex items-center">{rightElement}</div>}
        </div>
        {error && <p className="text-xs text-[#ff2a6d] font-semibold">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
