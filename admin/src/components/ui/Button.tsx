'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, icon, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-bold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-[#00f0ff]/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:translate-y-[1px]';

    const variants = {
      primary: 'bg-gradient-to-r from-[#00f0ff] to-[#0088ff] text-[#05161e] font-extrabold shadow-md shadow-[#00f0ff]/20 hover:shadow-lg hover:shadow-[#00f0ff]/40',
      secondary: 'bg-[#112b38] text-[#b0d5e3] border border-[#194354] hover:bg-[#183747] hover:border-[#275c73] hover:text-white',
      danger: 'bg-[#ff2a6d] text-white font-extrabold shadow-md shadow-[#ff2a6d]/20 hover:bg-[#ff2a6d]/90',
      outline: 'border border-[#194354] text-[#b0d5e3] hover:bg-[#112b38] hover:text-white hover:border-[#00f0ff]/50',
      ghost: 'text-[#6b9eb3] hover:text-[#00f0ff] hover:bg-[#112b38]/60',
    };

    const sizes = {
      sm: 'text-xs px-3 py-1.5 gap-1.5',
      md: 'text-sm px-4 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : icon ? <span className="shrink-0">{icon}</span> : null}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
