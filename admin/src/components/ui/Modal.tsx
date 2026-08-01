'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'lg',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-[#05161e]/85 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div
        className={cn(
          'relative w-full rounded-2xl bg-gradient-to-br from-[#0a202a] to-[#112b38] border border-[#194354] shadow-2xl overflow-hidden z-10 my-8 animate-in fade-in zoom-in-95 duration-150',
          widthClasses[maxWidth]
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#194354] bg-[#07151c]/80">
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-white tracking-wide">{title}</h3>
              {description && <p className="text-xs text-[#6b9eb3] mt-0.5">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#6b9eb3] hover:text-[#00f0ff] hover:bg-[#112b38] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">{children}</div>

        {footer && <div className="flex flex-wrap items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-[#194354] bg-[#07151c]/60">{footer}</div>}
      </div>
    </div>
  );
};
