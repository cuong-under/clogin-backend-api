'use client';

import React, { useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2, Edit2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Announcement, AnnouncementType } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDateShort } from '@/lib/utils';

export default function CommunicationPage() {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'info' as AnnouncementType,
    target: 'all' as 'all' | 'owners' | 'workers',
    active: true,
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Announcement[] }>('/v1/admin/announcements');
      setAnnouncements(res.data || []);
    } catch (err) {
      toast.error('Không thể tải danh sách thông báo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setForm({
      title: '',
      body: '',
      type: 'info',
      target: 'all',
      active: true,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    setIsOpen(true);
  };

  const handleOpenEdit = (item: Announcement) => {
    setEditingItem(item);
    setForm({
      title: item.title,
      body: item.body,
      type: item.type,
      target: item.target,
      active: item.active,
      start_date: item.start_date.split('T')[0],
      end_date: item.end_date.split('T')[0],
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingItem) {
        await api.put(`/v1/admin/announcements/${editingItem.id}`, form);
        toast.success('Đã cập nhật thông báo');
      } else {
        await api.post('/v1/admin/announcements', form);
        toast.success('Đã phát thông báo mới');
      }
      setIsOpen(false);
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: Announcement) => {
    try {
      await api.put(`/v1/admin/announcements/${item.id}`, { active: !item.active });
      toast.success(`Đã ${!item.active ? 'bật' : 'tắt'} thông báo`);
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi cập nhật');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/announcements/${deleteId}`);
      toast.success('Đã xóa thông báo');
      setDeleteId(null);
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const getTypeBadge = (type: AnnouncementType) => {
    switch (type) {
      case 'info':
        return <Badge variant="info">Thông tin</Badge>;
      case 'warning':
        return <Badge variant="warning">Cảnh báo</Badge>;
      case 'critical':
        return <Badge variant="danger">Quan trọng</Badge>;
      default:
        return <Badge variant="default">{type}</Badge>;
    }
  };

  const columns: Column<Announcement>[] = [
    {
      header: 'Tiêu đề thông báo',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.title}</span>
          <span className="text-xs text-slate-400 block max-w-xs truncate">{item.body}</span>
        </div>
      ),
    },
    {
      header: 'Loại',
      cell: (item) => getTypeBadge(item.type),
    },
    {
      header: 'Đối tượng nhận',
      hideOnMobile: true,
      cell: (item) => (
        <span className="text-xs uppercase font-semibold text-sky-400">
          {item.target === 'all' ? 'Tất cả' : item.target}
        </span>
      ),
    },
    {
      header: 'Thời gian phát',
      hideOnMobile: true,
      cell: (item) => (
        <span className="text-xs text-slate-400">
          {formatDateShort(item.start_date)} - {formatDateShort(item.end_date)}
        </span>
      ),
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <button onClick={() => handleToggleActive(item)} className="cursor-pointer">
          {item.active ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="w-3 h-3" /> Đang hiển thị
            </Badge>
          ) : (
            <Badge variant="danger" className="gap-1">
              <XCircle className="w-3 h-3" /> Tắt
            </Badge>
          )}
        </button>
      ),
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(item)} icon={<Edit2 className="w-3.5 h-3.5" />}>
            Sửa
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
            <Megaphone className="w-5 h-5 text-sky-400" /> Quản lý Thông Báo (Communication)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Gửi thông báo broadcast tới ứng dụng Desktop của người dùng</p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Tạo Thông báo mới
        </Button>
      </div>

      <Table columns={columns} data={announcements} loading={loading} />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingItem ? 'Chỉnh sửa Thông báo' : 'Tạo Thông báo Broadcast mới'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={submitting}>
              Phát thông báo
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Tiêu đề thông báo"
            placeholder="VD: Bảo trì hệ thống Cloud Storage"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Mức độ thông báo"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AnnouncementType })}
              options={[
                { value: 'info', label: 'Thông tin (Xanh)' },
                { value: 'warning', label: 'Cảnh báo (Vàng)' },
                { value: 'critical', label: 'Quan trọng (Đỏ)' },
              ]}
            />

            <Select
              label="Đối tượng hiển thị"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value as any })}
              options={[
                { value: 'all', label: 'Tất cả ứng dụng' },
                { value: 'owners', label: 'Chỉ Owners' },
                { value: 'workers', label: 'Chỉ Workers' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Ngày bắt đầu"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              required
            />
            <Input
              label="Ngày kết thúc"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Nội dung chi tiết</label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm text-slate-100 focus:outline-none focus:border-sky-400 h-28"
              placeholder="Nhập nội dung thông báo..."
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
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
        title="Xóa Thông báo"
        message="Bạn có chắc chắn muốn xóa thông báo này?"
      />
    </div>
  );
}
