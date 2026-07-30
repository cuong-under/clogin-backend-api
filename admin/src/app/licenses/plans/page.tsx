'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { LicensePlan } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

export default function LicensePlansPage() {
  const toast = useToast();
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal create/edit
  const [isOpen, setIsOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LicensePlan | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    max_devices: 5,
    max_workers: 2,
    max_profiles: 50,
    price: 0,
    duration_days: 30,
    active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: LicensePlan[] }>('/v1/admin/licenses/plans');
      setPlans(res.data || []);
    } catch (err) {
      toast.error('Không thể tải danh sách gói cước');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setForm({
      name: '',
      slug: '',
      max_devices: 5,
      max_workers: 2,
      max_profiles: 50,
      price: 0,
      duration_days: 30,
      active: true,
    });
    setIsOpen(true);
  };

  const handleOpenEdit = (plan: LicensePlan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      max_devices: plan.max_devices,
      max_workers: plan.max_workers,
      max_profiles: plan.max_profiles,
      price: plan.price,
      duration_days: plan.duration_days,
      active: plan.active,
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingPlan) {
        await api.put(`/v1/admin/licenses/plans/${editingPlan.id}`, form);
        toast.success('Đã cập nhật gói cước');
      } else {
        await api.post('/v1/admin/licenses/plans', form);
        toast.success('Đã tạo gói cước mới');
      }
      setIsOpen(false);
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/licenses/plans/${deleteId}`);
      toast.success('Đã xóa gói cước');
      setDeleteId(null);
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi xóa gói cước');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (plan: LicensePlan) => {
    try {
      await api.put(`/v1/admin/licenses/plans/${plan.id}`, { active: !plan.active });
      toast.success(`Đã ${!plan.active ? 'kích hoạt' : 'ẩn'} gói cước ${plan.name}`);
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message || 'Không thể cập nhật trạng thái');
    }
  };

  const columns: Column<LicensePlan>[] = [
    {
      header: 'Tên gói',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.name}</span>
          <span className="font-mono text-[11px] text-slate-400">{item.slug}</span>
        </div>
      ),
    },
    {
      header: 'Giới hạn (Dev/Worker/Profile)',
      cell: (item) => (
        <span className="text-xs font-mono">
          {item.max_devices} dev / {item.max_workers} worker / {item.max_profiles} profile
        </span>
      ),
    },
    {
      header: 'Giá cước',
      cell: (item) => (
        <span className="text-xs font-semibold text-emerald-400">
          {item.price > 0 ? `${item.price.toLocaleString('vi-VN')} VNĐ` : 'Miễn phí'}
        </span>
      ),
    },
    {
      header: 'Thời hạn',
      cell: (item) => <span className="text-xs text-slate-300">{item.duration_days} ngày</span>,
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <button onClick={() => handleToggleActive(item)} className="cursor-pointer">
          {item.active ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="w-3 h-3" /> Đang bán
            </Badge>
          ) : (
            <Badge variant="danger" className="gap-1">
              <XCircle className="w-3 h-3" /> Đã ẩn
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
          <h1 className="text-xl font-bold text-slate-100">Gói Cước Bản Quyền (Plans)</h1>
          <p className="text-xs text-slate-400 mt-0.5">Cấu hình các gói đăng ký dịch vụ Clogin Studio</p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Tạo Gói Cước mới
        </Button>
      </div>

      <Table columns={columns} data={plans} loading={loading} />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingPlan ? 'Chỉnh sửa Gói Cước' : 'Tạo Gói Cước mới'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={submitting}>
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tên Gói (Name)"
              placeholder="VD: Premium Team"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Mã Slug"
              placeholder="VD: premium-team"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Max Devices"
              type="number"
              value={form.max_devices}
              onChange={(e) => setForm({ ...form, max_devices: parseInt(e.target.value) || 1 })}
              required
            />
            <Input
              label="Max Workers"
              type="number"
              value={form.max_workers}
              onChange={(e) => setForm({ ...form, max_workers: parseInt(e.target.value) || 0 })}
              required
            />
            <Input
              label="Max Profiles"
              type="number"
              value={form.max_profiles}
              onChange={(e) => setForm({ ...form, max_profiles: parseInt(e.target.value) || 1 })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Giá cước (VNĐ)"
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })}
              required
            />
            <Input
              label="Thời hạn (Số ngày)"
              type="number"
              value={form.duration_days}
              onChange={(e) => setForm({ ...form, duration_days: parseInt(e.target.value) || 30 })}
              required
            />
          </div>
        </form>
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Xóa Gói Cước"
        message="Bạn có chắc chắn muốn xóa gói cước này? Thao tác không thể hoàn tác."
      />
    </div>
  );
}
