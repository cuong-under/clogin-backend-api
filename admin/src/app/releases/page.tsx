'use client';

import React, { useEffect, useState } from 'react';
import { DownloadCloud, Plus, CheckCircle, Edit2, Github, Trash2 } from 'lucide-react';
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

function isUpdateReady(release: Pick<Release, 'download_url' | 'update_signature'>) {
  return Boolean(release.download_url?.startsWith('https://') && release.update_signature?.trim());
}

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
    update_signature: '',
    min_version: '',
    is_current: false,
  });
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [isGitHubImportOpen, setIsGitHubImportOpen] = useState(false);
  const [githubImport, setGithubImport] = useState({
    version: '',
    channel: 'stable' as Channel,
    changelog: '',
    min_version: '',
  });
  const [importingGitHub, setImportingGitHub] = useState(false);
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

  const handleOpenCreate = () => {
    setEditingRelease(null);
    setForm({ version: '', channel: 'stable', changelog: '', download_url: '', update_signature: '', min_version: '', is_current: false });
    setIsOpen(true);
  };

  const handleOpenEdit = (release: Release) => {
    setEditingRelease(release);
    setForm({
      version: release.version,
      channel: release.channel,
      changelog: release.changelog,
      download_url: release.download_url || '',
      update_signature: release.update_signature || '',
      min_version: release.min_version || '',
      is_current: release.is_current,
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingRelease) {
        await api.put(`/v1/admin/releases/${editingRelease.id}`, form);
        toast.success('Đã cập nhật bản phát hành');
      } else {
        await api.post('/v1/admin/releases', form);
        toast.success('Đã tạo bản phát hành mới');
      }
      setIsOpen(false);
      setEditingRelease(null);
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

  const handleGitHubImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportingGitHub(true);
    try {
      await api.post('/v1/admin/releases/import-github', githubImport);
      toast.success('Đã nhập artifact updater đã ký từ GitHub Release');
      setIsGitHubImportOpen(false);
      setGithubImport({ version: '', channel: 'stable', changelog: '', min_version: '' });
      fetchReleases();
    } catch (err: any) {
      toast.error(err.message || 'Không thể nhập GitHub Release');
    } finally {
      setImportingGitHub(false);
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
      header: 'Auto-update',
      hideOnMobile: true,
      cell: (item) => isUpdateReady(item)
        ? <Badge variant="success">Sẵn sàng</Badge>
        : <Badge variant="warning">Thiếu artifact/.sig</Badge>,
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenEdit(item)}
            icon={<Edit2 className="w-3.5 h-3.5" />}
          >
            Sửa
          </Button>
          {!item.is_current && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSetCurrent(item.id)}
              disabled={!isUpdateReady(item)}
              title={isUpdateReady(item) ? 'Đặt làm bản cập nhật hiện tại' : 'Cần URL updater HTTPS và nội dung file .sig trước khi Publish'}
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

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsGitHubImportOpen(true)} icon={<Github className="w-4 h-4" />}>
            Nhập từ GitHub
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
            Tạo Release mới
          </Button>
        </div>
      </div>

      <Table columns={columns} data={releases} loading={loading} />

      {/* Create Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => { setIsOpen(false); setEditingRelease(null); }}
        title={editingRelease ? 'Chỉnh sửa bản phát hành' : 'Tạo bản phát hành ứng dụng mới'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setIsOpen(false); setEditingRelease(null); }}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={submitting}>
              {editingRelease ? 'Lưu thay đổi' : 'Tạo Release'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
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
            label="Link artifact updater trực tiếp (HTTPS)"
            placeholder="https://github.com/.../Clogin_1.2.0_x64-setup.nsis.zip"
            value={form.download_url}
            onChange={(e) => setForm({ ...form, download_url: e.target.value })}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Chữ ký updater Tauri (.sig)</label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-400 h-24"
              placeholder="Dán nguyên văn nội dung file .sig được tạo cùng artifact updater"
              value={form.update_signature}
              onChange={(e) => setForm({ ...form, update_signature: e.target.value })}
              required
            />
            <p className="text-[11px] text-slate-400">Release chỉ có thể Publish Current khi URL và chữ ký này hợp lệ.</p>
          </div>

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

      <Modal
        isOpen={isGitHubImportOpen}
        onClose={() => setIsGitHubImportOpen(false)}
        title="Nhập artifact updater từ GitHub Release"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsGitHubImportOpen(false)}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleGitHubImport} isLoading={importingGitHub}>
              Nhập Release
            </Button>
          </>
        }
      >
        <form onSubmit={handleGitHubImport} className="space-y-4">
          <p className="text-xs leading-relaxed text-slate-400">
            Hệ thống tải trực tiếp Windows updater `.nsis.zip` và chữ ký `.sig` từ GitHub Release đã publish. Sau khi nhập, kiểm tra trạng thái rồi bấm Publish Current.
          </p>
          <Input
            label="Phiên bản GitHub Release"
            placeholder="VD: 1.2.0"
            value={githubImport.version}
            onChange={(e) => setGithubImport({ ...githubImport, version: e.target.value })}
            required
          />
          <Select
            label="Kênh phát hành"
            value={githubImport.channel}
            onChange={(e) => setGithubImport({ ...githubImport, channel: e.target.value as Channel })}
            options={[
              { value: 'stable', label: 'Stable (Chính thức)' },
              { value: 'beta', label: 'Beta (Thử nghiệm)' },
              { value: 'canary', label: 'Canary (Mới nhất)' },
            ]}
          />
          <Input
            label="Phiên bản tối thiểu yêu cầu (tùy chọn)"
            placeholder="VD: 0.1.10"
            value={githubImport.min_version}
            onChange={(e) => setGithubImport({ ...githubImport, min_version: e.target.value })}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Nội dung cập nhật (tùy chọn)</label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm text-slate-100 focus:outline-none focus:border-sky-400 h-24"
              placeholder="Để trống để dùng nội dung GitHub Release"
              value={githubImport.changelog}
              onChange={(e) => setGithubImport({ ...githubImport, changelog: e.target.value })}
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
