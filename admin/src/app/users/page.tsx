'use client';

import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, Search, Key, Shield, KeyRound, Ban, Trash2, Edit, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { OwnerUser, WorkerUser, CloudProfile, LoginHistoryEntry, PaginatedResponse } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

export default function OwnersPage() {
  const toast = useToast();
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Detail Modal State
  const [selectedOwner, setSelectedOwner] = useState<OwnerUser | null>(null);
  const [detailTab, setDetailTab] = useState<'workers' | 'profiles' | 'logins'>('workers');
  const [ownerWorkers, setOwnerWorkers] = useState<WorkerUser[]>([]);
  const [ownerProfiles, setOwnerProfiles] = useState<CloudProfile[]>([]);
  const [ownerLogins, setOwnerLogins] = useState<LoginHistoryEntry[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Edit Modal
  const [editingOwner, setEditingOwner] = useState<OwnerUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);

  // Confirm Actions
  const [confirmState, setConfirmState] = useState<{
    type: 'suspend' | 'reset_pwd' | 'delete';
    isOpen: boolean;
    owner?: OwnerUser;
  }>({ type: 'suspend', isOpen: false });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOwners = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: page.toString(), limit: '10', search });
      const res = await api.get<PaginatedResponse<OwnerUser>>(`/v1/admin/users/owners?${query.toString()}`);
      setOwners(res.data || []);
      setTotalPages(res.total_pages || 1);
      setTotalItems(res.total || 0);
    } catch (err) {
      toast.error('Không thể tải danh sách Owner');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOwners();
  }, [page, search]);

  const loadOwnerDetails = async (owner: OwnerUser) => {
    setSelectedOwner(owner);
    setLoadingDetails(true);
    try {
      const [wRes, pRes, lRes] = await Promise.all([
        api.get<{ data: WorkerUser[] }>(`/v1/admin/users/owners/${owner.id}/workers`).catch(() => ({ data: [] })),
        api.get<{ data: CloudProfile[] }>(`/v1/admin/users/owners/${owner.id}/profiles`).catch(() => ({ data: [] })),
        api.get<{ data: LoginHistoryEntry[] }>(`/v1/admin/users/owners/${owner.id}/logins`).catch(() => ({ data: [] })),
      ]);
      setOwnerWorkers(wRes.data || []);
      setOwnerProfiles(pRes.data || []);
      setOwnerLogins(lRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOwner) return;
    setSubmitting(true);
    try {
      await api.put(`/v1/admin/users/owners/${editingOwner.id}`, editForm);
      toast.success('Đã cập nhật thông tin Owner');
      setEditingOwner(null);
      fetchOwners();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi cập nhật');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState.owner) return;
    setActionLoading(true);
    try {
      const id = confirmState.owner.id;
      if (confirmState.type === 'suspend') {
        const isSuspended = confirmState.owner.status === 'suspended';
        await api.post(`/v1/admin/users/owners/${id}/toggle-status`);
        toast.success(isSuspended ? 'Đã kích hoạt lại tài khoản' : 'Đã khóa tài khoản');
      } else if (confirmState.type === 'reset_pwd') {
        const res = await api.post<{ new_password?: string }>(`/v1/admin/users/owners/${id}/reset-password`);
        toast.success(`Reset mật khẩu thành công! Mật khẩu mới: ${res.new_password || '12345678'}`);
      } else if (confirmState.type === 'delete') {
        await api.delete(`/v1/admin/users/owners/${id}`);
        toast.success('Đã xóa Owner');
      }
      setConfirmState({ type: 'suspend', isOpen: false });
      fetchOwners();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const columns: Column<OwnerUser>[] = [
    {
      header: 'Người dùng Owner',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.name || item.email}</span>
          <span className="text-xs text-slate-400">{item.email}</span>
        </div>
      ),
    },
    {
      header: 'License Key',
      hideOnMobile: true,
      cell: (item) =>
        item.license_key ? (
          <span className="font-mono text-xs text-sky-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
            {item.license_key}
          </span>
        ) : (
          <span className="text-xs text-slate-500 italic">Chưa có</span>
        ),
    },
    {
      header: 'Workers',
      hideOnMobile: true,
      cell: (item) => (
        <span className="text-xs font-mono">
          {item.workers_count}/{item.max_workers}
        </span>
      ),
    },
    {
      header: 'Profiles',
      hideOnMobile: true,
      cell: (item) => <span className="text-xs font-mono">{item.profiles_count}</span>,
    },
    {
      header: 'Đăng nhập cuối',
      hideOnMobile: true,
      cell: (item) => <span className="text-xs text-slate-400">{formatDate(item.last_login)}</span>,
    },
    {
      header: 'Trạng thái',
      cell: (item) =>
        item.status === 'active' ? (
          <Badge variant="success">Hoạt động</Badge>
        ) : (
          <Badge variant="danger">Đã khóa</Badge>
        ),
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => loadOwnerDetails(item)}>
            Chi tiết
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingOwner(item);
              setEditForm({ name: item.name, email: item.email });
            }}
            icon={<Edit className="w-3.5 h-3.5" />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmState({ type: 'reset_pwd', isOpen: true, owner: item })}
            icon={<KeyRound className="w-3.5 h-3.5 text-amber-400" />}
            title="Reset Password"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmState({ type: 'delete', isOpen: true, owner: item })}
            icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
            title="Xóa"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-sky-400" /> Quản lý Chủ sở hữu (Owners)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Danh sách tài khoản Owner chính điều hành các Worker và Profile</p>
        </div>
      </div>

      <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 flex items-center justify-between">
        <SearchBar value={search} onChange={setSearch} placeholder="Tìm kiếm theo email, tên Owner..." className="w-full sm:w-80" />
      </div>

      <Table columns={columns} data={owners} loading={loading} onRowClick={(item) => loadOwnerDetails(item)} />
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingOwner}
        onClose={() => setEditingOwner(null)}
        title="Chỉnh sửa thông tin Owner"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditingOwner(null)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleEditSubmit} isLoading={submitting}>
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <Input
            label="Tên hiển thị"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            required
          />
        </form>
      </Modal>

      {/* Owner Detail Drawer Modal */}
      {selectedOwner && (
        <Modal
          isOpen={!!selectedOwner}
          onClose={() => setSelectedOwner(null)}
          title={`Chi tiết tài khoản Owner: ${selectedOwner.email}`}
          maxWidth="4xl"
          footer={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
              <Button
                variant={selectedOwner.status === 'active' ? 'danger' : 'primary'}
                size="sm"
                onClick={() => setConfirmState({ type: 'suspend', isOpen: true, owner: selectedOwner })}
              >
                {selectedOwner.status === 'active' ? 'Khóa tài khoản' : 'Kích hoạt lại'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelectedOwner(null)}>
                Đóng
              </Button>
            </div>
          }
        >
          <div className="space-y-6">
            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-700 text-xs">
              <div>
                <span className="text-slate-400 block">Tên:</span>
                <span className="font-semibold text-slate-100 mt-1 block">{selectedOwner.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">License Key:</span>
                <span className="font-mono text-sky-400 mt-1 block">{selectedOwner.license_key || 'Chưa gán'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Workers / Max:</span>
                <span className="font-mono text-slate-100 mt-1 block">
                  {selectedOwner.workers_count} / {selectedOwner.max_workers}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Profiles count:</span>
                <span className="font-mono text-slate-100 mt-1 block">{selectedOwner.profiles_count}</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs
              activeTab={detailTab}
              onChange={(id) => setDetailTab(id as any)}
              tabs={[
                { id: 'workers', label: 'Danh sách Workers', count: ownerWorkers.length },
                { id: 'profiles', label: 'Cloud Profiles', count: ownerProfiles.length },
                { id: 'logins', label: 'Lịch sử đăng nhập', count: ownerLogins.length },
              ]}
            />

            {detailTab === 'workers' && (
              <div className="space-y-2">
                {ownerWorkers.length > 0 ? (
                  <div className="divide-y divide-slate-700/60 border border-slate-700 rounded-lg overflow-hidden bg-slate-900/40">
                    {ownerWorkers.map((w) => (
                      <div key={w.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-200">{w.name}</span>{' '}
                          <span className="text-slate-400">({w.email})</span>
                        </div>
                        <Badge variant={w.active ? 'success' : 'danger'}>{w.active ? 'Active' : 'Disabled'}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic py-4 text-center">Không có Worker nào</p>
                )}
              </div>
            )}

            {detailTab === 'profiles' && (
              <div className="space-y-2">
                {ownerProfiles.length > 0 ? (
                  <div className="divide-y divide-slate-700/60 border border-slate-700 rounded-lg overflow-hidden bg-slate-900/40">
                    {ownerProfiles.map((p) => (
                      <div key={p.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-200">{p.name}</span>{' '}
                          <span className="text-slate-500 font-mono">[{p.folder}]</span>
                        </div>
                        <Badge variant={p.has_cookies ? 'info' : 'default'}>
                          {p.has_cookies ? 'Has Cookies' : 'No Cookies'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic py-4 text-center">Không có Cloud Profile nào</p>
                )}
              </div>
            )}

            {detailTab === 'logins' && (
              <div className="space-y-2">
                {ownerLogins.length > 0 ? (
                  <div className="divide-y divide-slate-700/60 border border-slate-700 rounded-lg overflow-hidden bg-slate-900/40">
                    {ownerLogins.map((l) => (
                      <div key={l.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-mono text-slate-300">{l.ip}</span>{' '}
                          <span className="text-slate-500">({l.country || 'N/A'})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={l.success ? 'success' : 'danger'}>{l.success ? 'Thành công' : 'Thất bại'}</Badge>
                          <span className="text-slate-400">{formatDate(l.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic py-4 text-center">Chưa có lịch sử đăng nhập</p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ ...confirmState, isOpen: false })}
        onConfirm={handleConfirmAction}
        isLoading={actionLoading}
        title="Xác nhận thao tác"
        message={`Bạn có chắc chắn muốn thực hiện thao tác '${confirmState.type}' với tài khoản ${confirmState.owner?.email}?`}
      />
    </div>
  );
}
