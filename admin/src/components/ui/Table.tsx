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
    <div className="w-full overflow-x-auto rounded-lg border border-slate-700 bg-slate-800/40">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-slate-800 text-xs uppercase font-medium text-slate-400 border-b border-slate-700">
          <tr>
            {selectable && (
              <th className="p-4 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-sky-400 focus:ring-sky-400 focus:ring-offset-slate-900"
                />
              </th>
            )}
            {columns.map((col, idx) => (
              <th key={idx} className={cn('px-4 py-3.5 font-medium', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/60">
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
                    'hover:bg-slate-700/30 transition-colors',
                    isSelected && 'bg-sky-500/10 hover:bg-sky-500/15',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {selectable && (
                    <td className="p-4 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelectOne?.(id, e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-400 focus:ring-sky-400 focus:ring-offset-slate-900"
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={cn('px-4 py-3.5 text-slate-200', col.className)}>
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
