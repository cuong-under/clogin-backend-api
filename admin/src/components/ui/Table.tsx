'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectAll?: (checked: boolean) => void;
  onSelectOne?: (id: string, checked: boolean) => void;
  getId?: (item: T) => string;
  onRowClick?: (item: T) => void;
}

export function Table<T>({
  columns,
  data,
  loading = false,
  emptyText = 'Không tìm thấy dữ liệu nào',
  selectable = false,
  selectedIds = [],
  onSelectAll,
  onSelectOne,
  getId = (item: any) => item.id,
  onRowClick,
}: TableProps<T>) {
  const allSelected = data.length > 0 && data.every((item) => selectedIds.includes(getId(item)));

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[#194354] bg-[#0a202a]/80 shadow-xl">
      <table className="w-full text-left text-xs text-[#b0d5e3]">
        <thead className="bg-[#07151c] text-[11px] uppercase font-bold text-[#6b9eb3] border-b border-[#194354] tracking-wider">
          <tr>
            {selectable && (
              <th className="p-3.5 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                  className="rounded border-[#194354] bg-[#112b38] text-[#00f0ff] focus:ring-[#00f0ff]"
                />
              </th>
            )}
            {columns.map((col, idx) => (
              <th key={idx} className={cn('px-4 py-3.5 font-bold', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#194354]">
          {loading ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-4">
                <Skeleton type="table" lines={5} />
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-8">
                <EmptyState title={emptyText} />
              </td>
            </tr>
          ) : (
            data.map((item, rowIdx) => {
              const id = getId(item);
              const isSelected = selectedIds.includes(id);
              return (
                <tr
                  key={id || rowIdx}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'hover:bg-[#1e4254]/50 transition-colors',
                    isSelected && 'bg-[#00f0ff]/10 hover:bg-[#00f0ff]/15',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {selectable && (
                    <td className="p-3.5 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelectOne?.(id, e.target.checked)}
                        className="rounded border-[#194354] bg-[#112b38] text-[#00f0ff] focus:ring-[#00f0ff]"
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={cn('px-4 py-3.5 text-white font-medium', col.className)}>
                      {col.cell
                        ? col.cell(item)
                        : col.accessorKey
                        ? (item[col.accessorKey] as unknown as React.ReactNode)
                        : null}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
