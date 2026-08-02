'use client';

import React, { useEffect, useState } from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { PaginatedResponse } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

interface WorkspaceRow {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  owner_email: string;
  policy_revision: number;
  archived: boolean;
  member_count: number;
  profile_count: number;
  task_count: number;
  audit_count: number;
  sop_count: number;
  created_at: string;
  updated_at: string;
}

interface MigrationRow {
  owner_id: string;
  owner_email: string;
  has_default_workspace: boolean;
  migration_complete: boolean;
}

export default function WorkspacesPage() {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [migration, setMigration] = useState<MigrationRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<WorkspaceRow>>(`/v1/admin/workspaces?page=${page}&perPage=10`);
      setWorkspaces(res.data || []);
      setTotalPages(res.total_pages || 1);
      setTotalItems(res.total || 0);
      const mig = await api.get<{ data: MigrationRow[] }>('/v1/admin/migration/status');
      setMigration(mig.data || []);
    } catch (err) {
      toast.error('Không thể tải danh sách Workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const columns: Column<WorkspaceRow>[] = [
    { header: 'Workspace', accessorKey: 'name', cell: (w) => <span className="font-semibold">{w.name}{w.archived ? ' (archived)' : ''}</span> },
    { header: 'Owner', accessorKey: 'owner_email', cell: (w) => <span className="text-[#7fc9df]">{w.owner_email}</span> },
    { header: 'Members', accessorKey: 'member_count' },
    { header: 'Profiles', accessorKey: 'profile_count' },
    { header: 'Tasks', accessorKey: 'task_count' },
    { header: 'Audit', accessorKey: 'audit_count' },
    { header: 'SOP', accessorKey: 'sop_count' },
    { header: 'Policy Rev', accessorKey: 'policy_revision', cell: (w) => <Badge variant="info">{w.policy_revision}</Badge> },
    { header: 'Tạo lúc', accessorKey: 'created_at', cell: (w) => formatDate(w.created_at) },
  ];

  const migrated = migration.filter((m) => m.migration_complete).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#00f0ff]" /> Workspaces & Migration
        </h1>
        <button
          onClick={fetchAll}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-[#194354] text-[#a8d5e8] hover:bg-[#112b38]"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">Danh sách Workspace</h2>
            <span className="text-xs text-[#6b9eb3]">{totalItems} workspace</span>
          </div>
          {loading ? (
            <div className="text-xs text-[#6b9eb3]">Đang tải…</div>
          ) : workspaces.length === 0 ? (
            <EmptyState title="Chưa có workspace" description="Chạy migrate.js để backfill Default Workspace" />
          ) : (
            <Table columns={columns} data={workspaces} />
          )}
          {totalPages > 1 && (
            <div className="flex gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 text-xs rounded border border-[#194354] disabled:opacity-40">Trước</button>
              <span className="text-xs text-[#6b9eb3] self-center">Trang {page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 text-xs rounded border border-[#194354] disabled:opacity-40">Sau</button>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-bold mb-3">Trạng thái Migration</h2>
          <div className="text-xs space-y-2">
            <div className="flex justify-between">
              <span>Đã có Default Workspace</span>
              <Badge variant={migrated === migration.length && migration.length > 0 ? 'success' : 'warning'}>
                {migrated}/{migration.length}
              </Badge>
            </div>
            {migration.length === 0 && <div className="text-[#6b9eb3]">Chưa có Owner nào trong hệ thống.</div>}
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {migration.slice(0, 30).map((m) => (
                <li key={m.owner_id} className="flex justify-between border-b border-[#0e2b38] pb-1">
                  <span className="truncate max-w-[200px]">{m.owner_email}</span>
                  <Badge variant={m.migration_complete ? 'success' : 'danger'}>{m.migration_complete ? 'OK' : 'Thiếu'}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}


