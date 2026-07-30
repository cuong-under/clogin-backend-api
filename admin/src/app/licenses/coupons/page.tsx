'use client';

import React, { useEffect, useState } from 'react';
import { Tag, Plus, RefreshCw, Trash2, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { Coupon, LicensePlan } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDateShort, copyToClipboard } from '@/lib/utils';

export default function CouponsPage() {
  const toast = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discount_percent: 10,
    plan_id: '',
    max_uses: 100,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Coupon[] }>('/v1/admin/licenses/coupons');
      setCoupons(res.data || []);
    } catch (err) {
      toast.error('Không thể tải danh sách Coupon');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    fetchCoupons();
  }, []);

  const generateRandomCode = () => {
    const code = 'CLOGIN' + Math.random().toString(36).substring(2, 8).toUpperCase();
    setForm((prev) => ({ ...prev, code }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/v1/admin/licenses/coupons', form);
      toast.success('Đã tạo Mã Giảm Giá mới');
      setIsOpen(false);
      fetchCoupons();
    } catch (err: any) {
      toast.error(err.message || 'Tạo coupon thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/licenses/coupons/${deleteId}`);
      toast.success('Đã xóa Coupon');
      setDeleteId(null);
      fetchCoupons();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi xóa coupon');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (code: string) => {
    const ok = await copyToClipboard(code);
    if (ok) toast.success('Đã sao chép mã Coupon');
  };

  const columns: Column<Coupon>[] = [
    {
      header: 'Mã Coupon',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
            {item.code}
          </span>
          <button onClick={() => handleCopy(item.code)} className="text-slate-400 hover:text-slate-200 p-1">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
    {
      header: 'Giảm giá',
      cell: (item) => <Badge variant="warning">{item.discount_percent}%</Badge>,
    },
    {
      header: 'Áp dụng cho gói',
      cell: (item) => <span className="text-xs text-slate-300">{item.plan_name || 'Tất cả các gói'}</span>,
    },
    {
      header: 'Lượt dùng',
      cell: (item) => (
        <span className="text-xs font-mono">
          {item.used_count}/{item.max_uses}
        </span>
      ),
    },
    {
      header: 'Trạng thái',
      cell: (item) =>
        item.active ? <Badge variant="success">Hoạt động</Badge> : <Badge variant="danger">Đã khóa</Badge>,
    },
    {
      header: 'Hạn dùng',
      cell: (item) => <span className="text-xs text-slate-400">{formatDateShort(item.expires_at)}</span>,
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteId(item.id)}
          className="text-rose-400 hover:bg-rose-500/10"
          icon={<Trash2 className="w-3.5 h-3.5" />}
        >
          Xóa
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-400" /> Quản lý Mã Giảm Giá (Coupons)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Tạo các chương trình khuyến mãi và ưu đãi cho người dùng</p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            generateRandomCode();
            setIsOpen(true);
          }}
          icon={<Plus className="w-4 h-4" />}
        >
          Tạo Coupon mới
        </Button>
      </div>

      <Table columns={columns} data={coupons} loading={loading} />

      {/* Create Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Tạo Mã Giảm Giá mới"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreate} isLoading={submitting}>
              Tạo Coupon
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Mã Coupon"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            rightElement={
              <button
                type="button"
                onClick={generateRandomCode}
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold"
              >
                <RefreshCw className="w-3 h-3" /> Auto
              </button>
            }
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tỷ lệ giảm giá (%)"
              type="number"
              min={1}
              max={100}
              value={form.discount_percent}
              onChange={(e) => setForm({ ...form, discount_percent: parseInt(e.target.value) || 0 })}
              required
            />
            <Input
              label="Số lượt dùng tối đa"
              type="number"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: parseInt(e.target.value) || 1 })}
              required
            />
          </div>

          <Select
            label="Gói cước áp dụng"
            value={form.plan_id}
            onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
            options={[
              { value: '', label: 'Tất cả gói cước' },
              ...plans.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />

          <Input
            label="Hạn sử dụng"
            type="date"
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            required
          />
        </form>
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Xóa Coupon"
        message="Bạn có chắc chắn muốn xóa mã giảm giá này?"
      />
    </div>
  );
}
