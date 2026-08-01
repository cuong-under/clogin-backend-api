'use client';

import React, { useEffect, useState } from 'react';
import { FolderGit2, Trash2, ArrowRightLeft, Cookie, Code, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { CloudProfile, OwnerUser, PaginatedResponse } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

export default function CloudProfilesPage() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<CloudProfile[]>([]);
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Detail Modal
  const [selectedProfile, setSelectedProfile] = useState<CloudProfile | null>(null);

  // Transfer Owner Modal
  const [transferProfile, setTransferProfile] = useState<CloudProfile | null>(null);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Delete Confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchOwnersList = async () => {
    try {
      const res = await api.get<{ data: OwnerUser[] }>('/v1/admin/users/owners?limit=100');
      setOwners(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: page.toString(), limit: '10', search });
      const res = await api.get<PaginatedResponse<CloudProfile>>(`/v1/admin/profiles?${query.toString()}`);
      setProfiles(res.data || []);
      setTotalPages(res.total_pages || 1);
      setTotalItems(res.total || 0);
    } catch (err) {
      toast.error('Không thể tải danh sách Cloud Profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOwnersList();
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [page, search]);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferProfile || !newOwnerId) return;
    setTransferring(true);
    try {
      await api.post(`/v1/admin/profiles/${transferProfile.id}/transfer`, { new_owner_id: newOwnerId });
      toast.success('Đã chuyển quyền sở hữu Profile');
      setTransferProfile(null);
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Chuyển quyền thất bại');
    } finally {
      setTransferring(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/profiles/${deleteId}`);
      toast.success('Đã xóa Cloud Profile');
      setDeleteId(null);
      if (selectedProfile) setSelectedProfile(null);
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Xóa Profile thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<CloudProfile>[] = [
    {
      header: 'Tên Profile',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.name}</span>
          <span className="text-[11px] font-mono text-slate-400">{item.folder}</span>
        </div>
      ),
    },
    {
      header: 'Chủ sở hữu (Owner)',
      cell: (item) => <span className="text-xs text-slate-300">{item.owner_email}</span>,
    },
    {
      header: 'Worker được gán',
      cell: (item) => <span className="text-xs font-mono">{item.assigned_workers_count}</span>,
    },
    {
      header: 'Cookies',
      cell: (item) =>
        item.has_cookies ? (
          <Badge variant="info" className="gap-1">
            <Cookie className="w-3 h-3" /> Đã lưu
          </Badge>
        ) : (
          <Badge variant="default">Chưa có</Badge>
        ),
    },
    {
      header: 'Cập nhật cuối',
      cell: (item) => <span className="text-xs text-slate-400">{formatDate(item.updated_at)}</span>,
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setSelectedProfile(item)}>
            Xem
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTransferProfile(item);
              setNewOwnerId(item.owner_id);
            }}
            icon={<ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />}
            title="Chuyển Owner"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(item.id)}
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
            <FolderGit2 className="w-5 h-5 text-sky-400" /> Quản lý Cloud Profiles
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Quản lý cấu hình, cookie và đồng bộ hóa trình duyệt đa tài khoản</p>
        </div>
      </div>

      <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
        <SearchBar value={search} onChange={setSearch} placeholder="Tìm profile theo tên, folder..." className="w-full sm:w-80" />
      </div>

      <Table columns={columns} data={profiles} loading={loading} onRowClick={(item) => setSelectedProfile(item)} />
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />

      {/* Transfer Owner Modal */}
      <Modal
        isOpen={!!transferProfile}
        onClose={() => setTransferProfile(null)}
        title="Chuyển quyền sở hữu Cloud Profile"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setTransferProfile(null)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleTransferSubmit} isLoading={transferring}>
              Xác nhận chuyển
            </Button>
          </>
        }
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <p className="text-xs text-slate-300">
            Chuyển Profile <span className="font-bold text-sky-400">{transferProfile?.name}</span> sang Owner khác:
          </p>
          <Select
            label="Chọn Owner mới"
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
            options={owners.map((o) => ({ value: o.id, label: `${o.name} (${o.email})` }))}
          />
        </form>
      </Modal>

      {/* Profile Detail Modal */}
      {selectedProfile && (
        <Modal
          isOpen={!!selectedProfile}
          onClose={() => setSelectedProfile(null)}
          title={`Chi tiết Profile: ${selectedProfile.name}`}
          maxWidth="2xl"
          footer={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
              <Button variant="danger" size="sm" onClick={() => setDeleteId(selectedProfile.id)}>
                Xóa Profile
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelectedProfile(null)}>
                Đóng
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs p-4 rounded-xl bg-slate-900 border border-slate-700">
              <div>
                <span className="text-slate-400 block">Folder lưu trữ:</span>
                <span className="font-mono text-slate-200 mt-1 block">{selectedProfile.folder}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Owner sở hữu:</span>
                <span className="font-semibold text-slate-200 mt-1 block">{selectedProfile.owner_email}</span>
              </div>
            </div>

            {/* Config JSON Viewer */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-sky-400" /> Cấu hình Config JSON
              </h4>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-48">
                {selectedProfile.config_json || JSON.stringify({ user_agent: 'Default', proxy: null }, null, 2)}
              </pre>
            </div>

            {/* Cookies info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                <Cookie className="w-4 h-4 text-amber-400" /> Dữ liệu Cookie
              </h4>
              <p className="text-xs text-slate-300 bg-slate-900 p-3 rounded-lg border border-slate-700">
                {selectedProfile.cookies_info || 'Dữ liệu Cookie được mã hóa an toàn trên Cloud Storage.'}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Xóa Profile"
        message="Bạn có chắc chắn muốn xóa Cloud Profile này?"
      />
    </div>
  );
}
