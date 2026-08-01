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
      toast.error('KhÃ´ng thá»ƒ táº£i danh sÃ¡ch thÃ´ng bÃ¡o');
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
        toast.success('ÄÃ£ cáº­p nháº­t thÃ´ng bÃ¡o');
      } else {
        await api.post('/v1/admin/announcements', form);
        toast.success('ÄÃ£ phÃ¡t thÃ´ng bÃ¡o má»›i');
      }
      setIsOpen(false);
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'Thao tÃ¡c tháº¥t báº¡i');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: Announcement) => {
    try {
      await api.put(`/v1/admin/announcements/${item.id}`, { active: !item.active });
      toast.success(`ÄÃ£ ${!item.active ? 'báº­t' : 'táº¯t'} thÃ´ng bÃ¡o`);
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'Lá»—i cáº­p nháº­t');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/admin/announcements/${deleteId}`);
      toast.success('ÄÃ£ xÃ³a thÃ´ng bÃ¡o');
      setDeleteId(null);
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'XÃ³a tháº¥t báº¡i');
    } finally {
      setDeleting(false);
    }
  };

  const getTypeBadge = (type: AnnouncementType) => {
    switch (type) {
      case 'info':
        return <Badge variant="info">ThÃ´ng tin</Badge>;
      case 'warning':
        return <Badge variant="warning">Cáº£nh bÃ¡o</Badge>;
      case 'critical':
        return <Badge variant="danger">Quan trá»ng</Badge>;
      default:
        return <Badge variant="default">{type}</Badge>;
    }
  };

  const columns: Column<Announcement>[] = [
    {
      header: 'TiÃªu Ä‘á» thÃ´ng bÃ¡o',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.title}</span>
          <span className="text-xs text-slate-400 block max-w-xs truncate">{item.body}</span>
        </div>
      ),
    },
    {
      header: 'Loáº¡i',
      cell: (item) => getTypeBadge(item.type),
    },
    {
      header: 'Äá»‘i tÆ°á»£ng nháº­n',
      cell: (item) => (
        <span className="text-xs uppercase font-semibold text-sky-400">
          {item.target === 'all' ? 'Táº¥t cáº£' : item.target}
        </span>
      ),
    },
    {
      header: 'Thá»i gian phÃ¡t',
      cell: (item) => (
        <span className="text-xs text-slate-400">
          {formatDateShort(item.start_date)} - {formatDateShort(item.end_date)}
        </span>
      ),
    },
    {
      header: 'Tráº¡ng thÃ¡i',
      cell: (item) => (
        <button onClick={() => handleToggleActive(item)} className="cursor-pointer">
          {item.active ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="w-3 h-3" /> Äang hiá»ƒn thá»‹
            </Badge>
          ) : (
            <Badge variant="danger" className="gap-1">
              <XCircle className="w-3 h-3" /> Táº¯t
            </Badge>
          )}
        </button>
      ),
    },
    {
      header: 'HÃ nh Ä‘á»™ng',
      cell: (item) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(item)} icon={<Edit2 className="w-3.5 h-3.5" />}>
            Sá»­a
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(item.id)}
            className="text-rose-400 hover:bg-rose-500/10"
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            XÃ³a
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
            <Megaphone className="w-5 h-5 text-sky-400" /> Quáº£n lÃ½ ThÃ´ng BÃ¡o (Communication)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Gá»­i thÃ´ng bÃ¡o broadcast tá»›i á»©ng dá»¥ng Desktop cá»§a ngÆ°á»i dÃ¹ng</p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Táº¡o ThÃ´ng bÃ¡o má»›i
        </Button>
      </div>

      <Table columns={columns} data={announcements} loading={loading} />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingItem ? 'Chá»‰nh sá»­a ThÃ´ng bÃ¡o' : 'Táº¡o ThÃ´ng bÃ¡o Broadcast má»›i'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Há»§y
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={submitting}>
              PhÃ¡t thÃ´ng bÃ¡o
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="TiÃªu Ä‘á» thÃ´ng bÃ¡o"
            placeholder="VD: Báº£o trÃ¬ há»‡ thá»‘ng Cloud Storage"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Má»©c Ä‘á»™ thÃ´ng bÃ¡o"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AnnouncementType })}
              options={[
                { value: 'info', label: 'ThÃ´ng tin (Xanh)' },
                { value: 'warning', label: 'Cáº£nh bÃ¡o (VÃ ng)' },
                { value: 'critical', label: 'Quan trá»ng (Äá»)' },
              ]}
            />

            <Select
              label="Äá»‘i tÆ°á»£ng hiá»ƒn thá»‹"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value as any })}
              options={[
                { value: 'all', label: 'Táº¥t cáº£ á»©ng dá»¥ng' },
                { value: 'owners', label: 'Chá»‰ Owners' },
                { value: 'workers', label: 'Chá»‰ Workers' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="NgÃ y báº¯t Ä‘áº§u"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              required
            />
            <Input
              label="NgÃ y káº¿t thÃºc"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Ná»™i dung chi tiáº¿t</label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm text-slate-100 focus:outline-none focus:border-sky-400 h-28"
              placeholder="Nháº­p ná»™i dung thÃ´ng bÃ¡o..."
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
        title="XÃ³a ThÃ´ng bÃ¡o"
        message="Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a thÃ´ng bÃ¡o nÃ y?"
      />
    </div>
  );
}
