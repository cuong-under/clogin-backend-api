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
      toast.error('KhÃ´ng thá»ƒ táº£i danh sÃ¡ch Coupon');
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
      toast.success('ÄÃ£ táº¡o MÃ£ Giáº£m GiÃ¡ má»›i');
      setIsOpen(false);
      fetchCoupons();
    } catch (err: any) {
      toast.error(err.message || 'Táº¡o coupon tháº¥t báº¡i');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/licenses/coupons/${deleteId}`);
      toast.success('ÄÃ£ xÃ³a Coupon');
      setDeleteId(null);
      fetchCoupons();
    } catch (err: any) {
      toast.error(err.message || 'Lá»—i khi xÃ³a coupon');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (code: string) => {
    const ok = await copyToClipboard(code);
    if (ok) toast.success('ÄÃ£ sao chÃ©p mÃ£ Coupon');
  };

  const columns: Column<Coupon>[] = [
    {
      header: 'MÃ£ Coupon',
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
      header: 'Giáº£m giÃ¡',
      cell: (item) => <Badge variant="warning">{item.discount_percent}%</Badge>,
    },
    {
      header: 'Ãp dá»¥ng cho gÃ³i',
      cell: (item) => <span className="text-xs text-slate-300">{item.plan_name || 'Táº¥t cáº£ cÃ¡c gÃ³i'}</span>,
    },
    {
      header: 'LÆ°á»£t dÃ¹ng',
      cell: (item) => (
        <span className="text-xs font-mono">
          {item.used_count}/{item.max_uses}
        </span>
      ),
    },
    {
      header: 'Tráº¡ng thÃ¡i',
      cell: (item) =>
        item.active ? <Badge variant="success">Hoáº¡t Ä‘á»™ng</Badge> : <Badge variant="danger">ÄÃ£ khÃ³a</Badge>,
    },
    {
      header: 'Háº¡n dÃ¹ng',
      cell: (item) => <span className="text-xs text-slate-400">{formatDateShort(item.expires_at)}</span>,
    },
    {
      header: 'HÃ nh Ä‘á»™ng',
      cell: (item) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteId(item.id)}
          className="text-rose-400 hover:bg-rose-500/10"
          icon={<Trash2 className="w-3.5 h-3.5" />}
        >
          XÃ³a
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-400" /> Quáº£n lÃ½ MÃ£ Giáº£m GiÃ¡ (Coupons)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Táº¡o cÃ¡c chÆ°Æ¡ng trÃ¬nh khuyáº¿n mÃ£i vÃ  Æ°u Ä‘Ã£i cho ngÆ°á»i dÃ¹ng</p>
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
          Táº¡o Coupon má»›i
        </Button>
      </div>

      <Table columns={columns} data={coupons} loading={loading} />

      {/* Create Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Táº¡o MÃ£ Giáº£m GiÃ¡ má»›i"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Há»§y
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreate} isLoading={submitting}>
              Táº¡o Coupon
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="MÃ£ Coupon"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Tá»· lá»‡ giáº£m giÃ¡ (%)"
              type="number"
              min={1}
              max={100}
              value={form.discount_percent}
              onChange={(e) => setForm({ ...form, discount_percent: parseInt(e.target.value) || 0 })}
              required
            />
            <Input
              label="Sá»‘ lÆ°á»£t dÃ¹ng tá»‘i Ä‘a"
              type="number"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: parseInt(e.target.value) || 1 })}
              required
            />
          </div>

          <Select
            label="GÃ³i cÆ°á»›c Ã¡p dá»¥ng"
            value={form.plan_id}
            onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
            options={[
              { value: '', label: 'Táº¥t cáº£ gÃ³i cÆ°á»›c' },
              ...plans.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />

          <Input
            label="Háº¡n sá»­ dá»¥ng"
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
        title="XÃ³a Coupon"
        message="Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a mÃ£ giáº£m giÃ¡ nÃ y?"
      />
    </div>
  );
}
