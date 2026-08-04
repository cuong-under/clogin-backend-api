'use client';

import React, { useEffect, useState } from 'react';
import { UserCheck, Trash2, CheckCircle2, XCircle, Eye, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { WorkerUser, OwnerUser, PaginatedResponse, WorkerMembership } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

export default function WorkersPage() {
  const toast = useToast();
  const [workers, setWorkers] = useState<WorkerUser[]>([]);
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Delete Confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detail Modal
  const [selectedWorker, setSelectedWorker] = useState<WorkerUser | null>(null);
  const [workerMemberships, setWorkerMemberships] = useState<WorkerMembership[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadWorkerDetail = async (worker: WorkerUser) => {
    setSelectedWorker(worker);
    setLoadingDetail(true);
    setWorkerMemberships([]);
    try {
      const res = await api
        .get<{ data: WorkerMembership[] }>(`/v1/admin/users/workers/${worker.id}/memberships`)
        .catch(() => ({ data: [] }));
      setWorkerMemberships(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const fetchOwnersList = async () => {
    try {
      const res = await api.get<{ data: OwnerUser[] }>('/v1/admin/users/owners?limit=100');
      setOwners(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        owner_id: ownerFilter !== 'all' ? ownerFilter : '',
      });
      const res = await api.get<PaginatedResponse<WorkerUser>>(`/v1/admin/users/workers?${query.toString()}`);
      setWorkers(res.data || []);
      setTotalPages(res.total_pages || 1);
      setTotalItems(res.total || 0);
    } catch (err) {
      toast.error('Không thể tải danh sách Worker');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOwnersList();
  }, []);

  useEffect(() => {
    fetchWorkers();
  }, [page, search, ownerFilter]);

  const handleToggleActive = async (worker: WorkerUser) => {
    try {
      await api.post(`/v1/admin/users/workers/${worker.id}/toggle-status`);
      toast.success(`Đã ${!worker.active ? 'kích hoạt' : 'khóa'} Worker ${worker.email}`);
      fetchWorkers();
    } catch (err: any) {
      toast.error(err.message || 'Không thể thay đổi trạng thái');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/users/workers/${deleteId}`);
      toast.success('Đã xóa Worker');
      setDeleteId(null);
      fetchWorkers();
    } catch (err: any) {
      toast.error(err.message || 'Xóa Worker thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<WorkerUser>[] = [
    {
      header: 'Tài khoản Worker',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.name || item.email}</span>
          <span className="text-xs text-slate-400">{item.email}</span>
        </div>
      ),
    },
    {
      header: 'Chủ sở hữu (Owner)',
      cell: (item) => (
        <Link href={`/users?search=${encodeURIComponent(item.owner_email)}`} className="text-xs text-sky-400 hover:underline">
          {item.owner_email}
        </Link>
      ),
    },
    {
      header: 'Đăng nhập cuối',
      hideOnMobile: true,
      cell: (item) => <span className="text-xs text-slate-400">{formatDate(item.last_login)}</span>,
    },
    {
      header: 'Ngày tạo',
      hideOnMobile: true,
      cell: (item) => <span className="text-xs text-slate-400">{formatDate(item.created_at)}</span>,
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <button onClick={() => handleToggleActive(item)} className="cursor-pointer">
          {item.active ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="w-3 h-3" /> Hoạt động
            </Badge>
          ) : (
            <Badge variant="danger" className="gap-1">
              <XCircle className="w-3 h-3" /> Đã khóa
            </Badge>
          )}
        </button>
      ),
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadWorkerDetail(item)}
            icon={<Eye className="w-3.5 h-3.5" />}
            className="text-sky-400 hover:bg-sky-500/10"
          >
            Chi tiết
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(item.id)}
            className="text-rose-400 hover:bg-rose-500/10"
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Xóa
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-sky-400" /> Quản lý Nhân viên (Workers)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Danh sách các tài khoản Worker phụ thuộc Owner</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
        <SearchBar value={search} onChange={setSearch} placeholder="Tìm Worker theo email..." className="w-full sm:w-80" />

        <Select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          options={[
            { value: 'all', label: 'Tất cả Owner' },
            ...owners.map((o) => ({ value: o.id, label: `${o.name} (${o.email})` })),
          ]}
          className="w-full sm:w-64"
        />
      </div>

      <Table columns={columns} data={workers} loading={loading} onRowClick={(item) => loadWorkerDetail(item)} />
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />

      {/* Worker Detail Modal */}
      {selectedWorker && (
        <Modal
          isOpen={!!selectedWorker}
          onClose={() => setSelectedWorker(null)}
          title={`Chi tiết Worker: ${selectedWorker.email}`}
          maxWidth="2xl"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedWorker(null)}>
              Đóng
            </Button>
          }
        >
          <div className="space-y-6">
            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-700 text-xs">
              <div>
                <span className="text-slate-400 block">Tên:</span>
                <span className="font-semibold text-slate-100 mt-1 block">{selectedWorker.name || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Email:</span>
                <span className="font-mono text-slate-200 mt-1 block">{selectedWorker.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Owner:</span>
                <span className="font-mono text-sky-400 mt-1 block">{selectedWorker.owner_email}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày tạo:</span>
                <span className="font-mono text-slate-200 mt-1 block">{formatDate(selectedWorker.created_at)}</span>
              </div>
            </div>

            {/* Workspace memberships */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-400" /> Workspace Memberships
              </h4>

              {loadingDetail ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">Đang tải...</p>
              ) : workerMemberships.length > 0 ? (
                <div className="divide-y divide-slate-700/60 border border-slate-700 rounded-lg overflow-hidden bg-slate-900/40">
                  {workerMemberships.map((m) => (
                    <div key={m.workspace_id} className="p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-200">{m.workspace_name}</span>
                          {m.workspace_archived && (
                            <Badge variant="danger" className="ml-2">Archived</Badge>
                          )}
                        </div>
                        <Badge variant={m.active ? 'success' : 'danger'}>
                          {m.active ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="info">{m.preset_role}</Badge>
                        {m.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Tham gia: {formatDate(m.member_created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic py-4 text-center">Worker chưa thuộc Workspace nào</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Xóa Worker"
        message="Bạn có chắc chắn muốn xóa tài khoản Worker này?"
      />
    </div>
  );
}
