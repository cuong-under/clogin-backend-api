'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  totalItems,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-2 py-3">
      {totalItems !== undefined ? (
        <p className="text-xs text-slate-400">
          Hiển thị trang <span className="font-semibold text-slate-200">{page}</span> /{' '}
          <span className="font-semibold text-slate-200">{totalPages}</span> ({totalItems} kết quả)
        </p>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          icon={<ChevronLeft className="w-4 h-4" />}
        >
          Trước
        </Button>
        <span className="text-xs text-slate-400 font-medium px-2">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          icon={<ChevronRight className="w-4 h-4" />}
        >
          Sau
        </Button>
      </div>
    </div>
  );
};
