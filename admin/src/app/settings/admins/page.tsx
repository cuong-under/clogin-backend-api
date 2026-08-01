'use client';

import React, { useEffect, useState } from 'react';
import { Shield, Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { getStoredAdmin } from '@/lib/auth';
import { AdminUser, Role } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

export default function AdminUsersPage() {
  const toast = useToast();
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Create/Edit
  const [isOpen, setIsOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'support' as Role,
    active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setCurrentAdmin(getStoredAdmin());
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: AdminUser[] }>('/v1/admin/settings/admins');
      setAdmins(res.data || []);
    } catch (err) {
      toast.error('Không thể tải danh sách Admin');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleOpenCreate = () => {
    setEditingAdmin(null);
    setForm({ email: '', password: '', name: '', role: 'support', active: true });
    setIsOpen(true);
  };

  const handleOpenEdit = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setForm({
      email: admin.email,
      password: '',
      name: admin.name,
      role: admin.role,
      active: admin.active,
    });
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingAdmin) {
        // Protection: Check last super_admin role change
        const superAdminsCount = admins.filter((a) => a.role === 'super_admin' && a.active).length;
        if (editingAdmin.role === 'super_admin' && form.role !== 'super_admin' && superAdminsCount <= 1) {
          toast.error('Không thể hạ quyền Super Admin cuối cùng của hệ thống!');
          setSubmitting(false);
          return;
        }

        const updatePayload: Record<string, any> = {
          name: form.name,
          role: form.role,
          active: form.active,
        };
        if (form.password && form.password.trim() !== '') {
          updatePayload.password = form.password;
        }

        await api.put(`/v1/admin/settings/admins/${editingAdmin.id}`, updatePayload);
        toast.success('Đã cập nhật tài khoản Admin');
      } else {
        await api.post('/v1/admin/settings/admins', form);
        toast.success('Đã tạo tài khoản Admin mới');
      }
      setIsOpen(false);
      fetchAdmins();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    // Protection check
    if (currentAdmin && currentAdmin.id === deleteId) {
      toast.error('Bạn không thể tự xóa tài khoản của chính mình!');
      setDeleteId(null);
      return;
    }

    const targetAdmin = admins.find((a) => a.id === deleteId);
    const superAdminsCount = admins.filter((a) => a.role === 'super_admin' && a.active).length;
    if (targetAdmin?.role === 'super_admin' && superAdminsCount <= 1) {
      toast.error('Không thể xóa tài khoản Super Admin duy nhất!');
      setDeleteId(null);
      return;
    }

    setDeleting(true);
    try {
      await api.delete(`/v1/admin/settings/admins/${deleteId}`);
      toast.success('Đã xóa tài khoản Admin');
      setDeleteId(null);
      fetchAdmins();
    } catch (err: any) {
      toast.error(err.message || 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'super_admin':
        return <Badge variant="purple">Super Admin</Badge>;
      case 'support':
        return <Badge variant="info">Support</Badge>;
      case 'viewer':
        return <Badge variant="default">Viewer</Badge>;
      default:
        return <Badge variant="default">{role}</Badge>;
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      header: 'Tên & Email Admin',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-100 block text-sm">{item.name || item.email}</span>
          <span className="text-xs text-slate-400">{item.email}</span>
        </div>
      ),
    },
    {
      header: 'Vai trò (Role)',
      cell: (item) => getRoleBadge(item.role),
    },
    {
      header: 'Trạng thái',
      cell: (item) =>
        item.active ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> Hoạt động
          </Badge>
        ) : (
          <Badge variant="danger" className="gap-1">
            <XCircle className="w-3 h-3" /> Đã khóa
          </Badge>
        ),
    },
    {
      header: 'Đăng nhập cuối',
      hideOnMobile: true,
      cell: (item) => <span className="text-xs text-slate-400">{formatDate(item.last_login)}</span>,
    },
    {
      header: 'Hành động',
      cell: (item) => {
        const isSelf = currentAdmin?.id === item.id;
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(item)} icon={<Edit2 className="w-3.5 h-3.5" />}>
              Sửa
            </Button>
            {!isSelf && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteId(item.id)}
                className="text-rose-400 hover:bg-rose-500/10"
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Xóa
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-sky-400" /> Quản lý Tài Khoản Admin
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Phân quyền ban quản trị hệ thống Clogin Studio Admin Portal</p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Tạo Admin mới
        </Button>
      </div>

      <Table columns={columns} data={admins} loading={loading} />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingAdmin ? 'Chỉnh sửa Quản trị viên' : 'Tạo Quản trị viên mới'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={submitting}>
              Lưu thông tin
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Họ và tên"
            placeholder="VD: Nguyễn Văn A"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <Input
            label="Email quản trị"
            type="email"
            placeholder="admin@clogin.nghemmo.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={!!editingAdmin}
            required
          />

          <Input
            label={editingAdmin ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu khởi tạo'}
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!editingAdmin}
          />

          <Select
            label="Phân quyền (Role)"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            options={[
              { value: 'super_admin', label: 'Super Admin (Toàn quyền A-Z)' },
              { value: 'support', label: 'Support (Hỗ trợ khách hàng, không quản lý Admin)' },
              { value: 'viewer', label: 'Viewer (Chỉ xem dữ liệu, không được chỉnh sửa)' },
            ]}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Xóa Admin"
        message="Bạn có chắc chắn muốn xóa tài khoản Admin này?"
      />
    </div>
  );
}
