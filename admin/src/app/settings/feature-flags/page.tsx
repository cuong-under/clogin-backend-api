'use client';

import React, { useEffect, useState } from 'react';
import { ToggleLeft, Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { FeatureFlag, LicensePlan } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

export default function FeatureFlagsPage() {
  const toast = useToast();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isOpen, setIsOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [form, setForm] = useState({
    key: '',
    name: '',
    enabled: true,
    target_plans: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPlans = async () => {
    try {
      const res = await api.get<{ data: LicensePlan[] }>('/v1/admin/licenses/plans');
      setPlans(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: FeatureFlag[] }>('/v1/admin/settings/feature-flags');
      setFlags(res.data || []);
    } catch (err) {
      toast.error('Không thể tải Feature Flags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    fetchFlags();
  }, []);

  const handleOpenCreate = () => {
    setEditingFlag(null);
    setForm({ key: '', name: '', enabled: true, target_plans: [] });
    setIsOpen(true);
  };

  const handleOpenEdit = (flag: FeatureFlag) => {
    setEditingFlag(flag);
    setForm({
      key: flag.key,
      name: flag.name,
      enabled: flag.enabled,
      target_plans: flag.target_plans || [],
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingFlag) {
        await api.put(`/v1/admin/settings/feature-flags/${editingFlag.id}`, form);
        toast.success('Đã cập nhật Feature Flag');
      } else {
        await api.post('/v1/admin/settings/feature-flags', form);
        toast.success('Đã tạo Feature Flag mới');
      }
      setIsOpen(false);
      fetchFlags();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (flag: FeatureFlag) => {
    try {
      await api.put(`/v1/admin/settings/feature-flags/${flag.id}`, { enabled: !flag.enabled });
      toast.success(`Đã ${!flag.enabled ? 'bật' : 'tắt'} ${flag.name}`);
      fetchFlags();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi cập nhật');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/settings/feature-flags/${deleteId}`);
      toast.success('Đã xóa Feature Flag');
      setDeleteId(null);
      fetchFlags();
    } catch (err: any) {
      toast.error(err.message || 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<FeatureFlag>[] = [
    {
      header: 'Tên tính năng',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.name}</span>
          <span className="font-mono text-[11px] text-sky-400">{item.key}</span>
        </div>
      ),
    },
    {
      header: 'Áp dụng cho Plans',
      cell: (item) =>
        item.target_plans && item.target_plans.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.target_plans.map((p, idx) => (
              <Badge key={idx} variant="info">
                {p}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400">Tất cả gói</span>
        ),
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <button onClick={() => handleToggleEnabled(item)} className="cursor-pointer">
          {item.enabled ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="w-3 h-3" /> Đã bật
            </Badge>
          ) : (
            <Badge variant="danger" className="gap-1">
              <XCircle className="w-3 h-3" /> Đã tắt
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
            <ToggleLeft className="w-5 h-5 text-sky-400" /> Feature Flags (Cờ tính năng)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Bật/tắt các tính năng thử nghiệm hoặc phân quyền theo gói dịch vụ</p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Tạo Feature Flag
        </Button>
      </div>

      <Table columns={columns} data={flags} loading={loading} />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingFlag ? 'Chỉnh sửa Feature Flag' : 'Tạo Feature Flag mới'}
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
          <Input
            label="Mã Feature Key (viết thường, dùng gạch ngang)"
            placeholder="VD: enable-cloud-sync"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
            required
          />

          <Input
            label="Tên hiển thị tính năng"
            placeholder="VD: Đồng bộ hóa Cloud Storage"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Chọn gói áp dụng (để trống nếu áp dụng tất cả)</label>
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900 rounded-lg border border-slate-700 max-h-36 overflow-y-auto">
              {plans.map((plan) => {
                const checked = form.target_plans.includes(plan.slug);
                return (
                  <label key={plan.id} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({ ...form, target_plans: [...form.target_plans, plan.slug] });
                        } else {
                          setForm({ ...form, target_plans: form.target_plans.filter((s) => s !== plan.slug) });
                        }
                      }}
                      className="rounded border-slate-700 bg-slate-800 text-sky-400"
                    />
                    <span>{plan.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Xóa Feature Flag"
        message="Bạn có chắc chắn muốn xóa cờ tính năng này?"
      />
    </div>
  );
}
