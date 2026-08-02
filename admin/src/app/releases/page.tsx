'use client';

import React, { useEffect, useState } from 'react';
import { DownloadCloud, Plus, CheckCircle, ExternalLink, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Release, Channel } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDateShort, truncateText } from '@/lib/utils';

export default function ReleasesPage() {
  const toast = useToast();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Create
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    version: '',
    channel: 'stable' as Channel,
    changelog: '',
    download_url: '',
    min_version: '',
    is_current: false,
  });
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchReleases = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Release[] }>('/v1/admin/releases');
      setReleases(res.data || []);
    } catch (err) {
      toast.error('Không thể tải danh sách bản phát hành');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReleases();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/v1/admin/releases', form);
      toast.success('Đã phát hành phiên bản mới');
      setIsOpen(false);
      fetchReleases();
    } catch (err: any) {
      toast.error(err.message || 'Phát hành thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetCurrent = async (id: string) => {
    try {
      await api.post(`/v1/admin/releases/${id}/publish`);
      toast.success('Đã thiết lập làm phiên bản hiện tại (Current)');
      fetchReleases();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi đặt bản hiện tại');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/releases/${deleteId}`);
      toast.success('Đã xóa bản phát hành');
      setDeleteId(null);
      fetchReleases();
    } catch (err: any) {
      toast.error(err.message || 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const getChannelBadge = (channel: Channel) => {
    switch (channel) {
      case 'stable':
        return <Badge variant="success">Stable</Badge>;
      case 'beta':
        return <Badge variant="warning">Beta</Badge>;
      case 'canary':
        return <Badge variant="orange">Canary</Badge>;
      default:
        return <Badge variant="default">{channel}</Badge>;
    }
  };

  const columns: Column<Release>[] = [
    {
      header: 'Phiên bản (Version)',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-100 text-sm font-mono">{item.version}</span>
          {item.is_current && <Badge variant="info">Current</Badge>}
        </div>
      ),
    },
    {
      header: 'Kênh (Channel)',
      cell: (item) => getChannelBadge(item.channel),
    },
    {
      header: 'Nhật ký thay đổi (Changelog)',
      hideOnMobile: true,
      cell: (item) => (
        <span className="text-xs text-slate-300 max-w-xs block truncate" title={item.changelog}>
          {truncateText(item.changelog, 60)}
        </span>
      ),
    },
    {
      header: 'Ngày phát hành',
      hideOnMobile: true,
      cell: (item) => <span className="text-xs text-slate-400">{formatDateShort(item.published_at)}</span>,
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <div className="flex items-center gap-2">
          {!item.is_current && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSetCurrent(item.id)}
              icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
            >
              Publish Current
            </Button>
          )}
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
            <DownloadCloud className="w-5 h-5 text-sky-400" /> Quản lý Bản phát hành (Releases)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Phát hành và cập nhật các phiên bản Clogin Studio Desktop Client</p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsOpen(true)} icon={<Plus className="w-4 h-4" />}>
          Tạo Release mới
        </Button>
      </div>

      <Table columns={columns} data={releases} loading={loading} />

      {/* Create Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Phát hành phiên bản ứng dụng mới"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreate} isLoading={submitting}>
              Phát hành
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phiên bản (Version)"
              placeholder="VD: 1.2.0"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              required
            />
            <Select
              label="Kênh phát hành"
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}
              options={[
                { value: 'stable', label: 'Stable (Chính thức)' },
                { value: 'beta', label: 'Beta (Thử nghiệm)' },
                { value: 'canary', label: 'Canary (Mới nhất)' },
              ]}
            />
          </div>

          <Input
            label="Link tải file cài đặt (Download URL)"
            placeholder="https://clogin.nghemmo.com/download/Clogin_1.2.0.exe"
            value={form.download_url}
            onChange={(e) => setForm({ ...form, download_url: e.target.value })}
            required
          />

          <Input
            label="Phiên bản tối thiểu yêu cầu (Min Version)"
            placeholder="VD: 1.0.0"
            value={form.min_version}
            onChange={(e) => setForm({ ...form, min_version: e.target.value })}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Nội dung cập nhật (Changelog)</label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm text-slate-100 focus:outline-none focus:border-sky-400 h-28"
              placeholder="- Tối ưu tốc độ mở Profile&#10;- Sửa lỗi cookie sync"
              value={form.changelog}
              onChange={(e) => setForm({ ...form, changelog: e.target.value })}
              required
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Xóa Release"
        message="Bạn có chắc chắn muốn xóa bản phát hành này?"
      />
    </div>
  );
}
