'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from './Input';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  className,
}) => {
  return (
    <div className={className}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        icon={<Search className="w-4 h-4" />}
        rightElement={
          value ? (
            <button
              onClick={() => onChange('')}
              className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : undefined
        }
      />
    </div>
  );
};
