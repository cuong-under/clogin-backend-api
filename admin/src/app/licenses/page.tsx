'use client';

import React, { useEffect, useState } from 'react';
import { Key, Copy, Plus, Filter, Trash2, Ban, CheckCircle, RefreshCw, Smartphone, CalendarPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { License, LicensePlan, PaginatedResponse } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDateShort, copyToClipboard, truncateText } from '@/lib/utils';

export default function LicensesPage() {
  const toast = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    plan_id: '',
    max_devices: 5,
    days_valid: 30,
    count: 1,
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  // Detail Modal
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);

  // Extend License Modal
  const [extendLicenseItem, setExtendLicenseItem] = useState<License | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [extending, setExtending] = useState(false);

  // Confirm Delete / Suspend
  const [confirmState, setConfirmState] = useState<{
    type: 'delete' | 'suspend' | 'bulk_delete' | 'bulk_suspend';
    isOpen: boolean;
    id?: string;
  }>({ type: 'delete', isOpen: false });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPlans = async () => {
    try {
      const res = await api.get<{ data: LicensePlan[] }>('/v1/admin/licenses/plans');
      setPlans(res.data || []);
      if (res.data && res.data.length > 0 && !createForm.plan_id) {
        setCreateForm((prev) => ({ ...prev, plan_id: res.data[0].id }));
      }
    } catch (err) {
      console.error('Lỗi khi tải plans:', err);
    }
  };

  const fetchLicenses = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        status: statusFilter !== 'all' ? statusFilter : '',
        plan_id: planFilter !== 'all' ? planFilter : '',
      });
      const res = await api.get<PaginatedResponse<License>>(`/v1/admin/licenses?${query.toString()}`);
      setLicenses(res.data || []);
      setTotalPages(res.total_pages || 1);
      setTotalItems(res.total || 0);
    } catch (err) {
      toast.error('Không thể tải danh sách bản quyền');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    fetchLicenses();
  }, [page, search, statusFilter, planFilter]);

  const handleCopy = async (key: string) => {
    const success = await copyToClipboard(key);
    if (success) toast.success('Đã sao chép License Key');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/v1/admin/licenses', createForm);
      toast.success(`Đã tạo thành công ${createForm.count} license key`);
      setIsCreateOpen(false);
      fetchLicenses();
    } catch (err: any) {
      toast.error(err.message || 'Tạo license thất bại');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmAction = async () => {
    setActionLoading(true);
    try {
      if (confirmState.type === 'delete' && confirmState.id) {
        await api.delete(`/v1/admin/licenses/${confirmState.id}`);
        toast.success('Đã xóa License');
      } else if (confirmState.type === 'suspend' && confirmState.id) {
        await api.post(`/v1/admin/licenses/${confirmState.id}/suspend`);
        toast.success('Đã đình chỉ License');
      } else if (confirmState.type === 'bulk_delete') {
        await api.post('/v1/admin/licenses/bulk-delete', { ids: selectedIds });
        toast.success(`Đã xóa ${selectedIds.length} License`);
        setSelectedIds([]);
      } else if (confirmState.type === 'bulk_suspend') {
        await api.post('/v1/admin/licenses/bulk-suspend', { ids: selectedIds });
        toast.success(`Đã đình chỉ ${selectedIds.length} License`);
        setSelectedIds([]);
      }
      setConfirmState({ type: 'delete', isOpen: false });
      if (selectedLicense) setSelectedLicense(null);
      fetchLicenses();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetDevices = async (licenseId: string) => {
    try {
      await api.post(`/v1/admin/licenses/${licenseId}/reset-devices`);
      toast.success('Đã reset toàn bộ thiết bị');
      if (selectedLicense) {
        setSelectedLicense({
          ...selectedLicense,
          devices: [],
          active_devices_count: 0,
        });
      }
      fetchLicenses();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi reset thiết bị');
    }
  };

  const handleRemoveDevice = async (licenseId: string, targetId: string) => {
    try {
      await api.delete(`/v1/admin/licenses/${licenseId}/devices/${encodeURIComponent(targetId)}`);
      toast.success('Đã ngắt kết nối thiết bị');
      if (selectedLicense) {
        const updatedDevices = selectedLicense.devices?.filter(
          (d) => d.id !== targetId && d.hwid !== targetId && d.device_id !== targetId
        );
        setSelectedLicense({
          ...selectedLicense,
          devices: updatedDevices,
          active_devices_count: Math.max(0, (updatedDevices?.length ?? 0)),
        });
      }
      fetchLicenses();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi xóa thiết bị');
    }
  };

  const getProjectedExpiry = (currentExpiry: string | null | undefined, addDays: number) => {
    const base = currentExpiry && new Date(currentExpiry) > new Date() ? new Date(currentExpiry) : new Date();
    const target = new Date(base.getTime() + (addDays || 0) * 86400000);
    return formatDateShort(target.toISOString());
  };

  const handleExtendLicense = async () => {
    if (!extendLicenseItem) return;
    setExtending(true);
    try {
      const days = Number(extendDays) || 30;
      const updated = await api.post<any>(`/v1/admin/licenses/${extendLicenseItem.id}/extend`, { days });
      toast.success(`Đã gia hạn thành công ${days} ngày cho License Key`);
      if (selectedLicense && selectedLicense.id === extendLicenseItem.id) {
        setSelectedLicense({
          ...selectedLicense,
          valid_until: updated.expires_at || selectedLicense.valid_until,
                    status: updated.status || "active",
        });
      }
      setExtendLicenseItem(null);
      fetchLicenses();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi gia hạn License");
    } finally {
      setExtending(false);
    }
  };

    const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Hoạt động</Badge>;
      case 'expired':
        return <Badge variant="danger">Hết hạn</Badge>;
      case 'suspended':
        return <Badge variant="warning">Đã khóa</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const columns: Column<License>[] = [
    {
      header: 'License Key',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-sky-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-700">
            {item.key}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(item.key);
            }}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1"
            title="Copy Key"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
    {
      header: 'Gói Cước',
      cell: (item) => <Badge variant="info">{item.plan_name || 'Standard'}</Badge>,
    },
    {
      header: 'Chủ sở hữu',
      cell: (item) => <span className="text-xs text-slate-300">{item.owner_email || 'Chưa gán'}</span>,
    },
    {
      header: 'Thiết bị',
      hideOnMobile: true,
      cell: (item) => (
        <span className="text-xs font-mono">
          {item.active_devices_count}/{item.max_devices}
        </span>
      ),
    },
    {
      header: 'Trạng thái',
      hideOnMobile: true,
      cell: (item) => getStatusBadge(item.status),
    },
    {
      header: 'Hạn dùng',
      hideOnMobile: true,
      cell: (item) => <span className="text-xs text-slate-400">{formatDateShort(item.valid_until)}</span>,
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedLicense(item)}
            className="text-xs py-1 px-2"
          >
            Chi tiết
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmState({ type: 'delete', isOpen: true, id: item.id })}
            className="text-rose-400 hover:bg-rose-500/10 py-1 px-2"
          >
            Xóa
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Key className="w-5 h-5 text-sky-400" /> Quản lý License Keys
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Tạo mới, đình chỉ, kích hoạt và theo dõi các mã bản quyền</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<Plus className="w-4 h-4" />}>
            Tạo License mới
          </Button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo mã License key, email..."
          className="w-full sm:w-80"
        />

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Tất cả trạng thái' },
              { value: 'active', label: 'Hoạt động' },
              { value: 'expired', label: 'Hết hạn' },
              { value: 'suspended', label: 'Đã đình chỉ' },
            ]}
            className="flex-1 sm:flex-none sm:w-40 min-w-[120px]"
          />

          <Select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Tất cả gói cước' },
              ...plans.map((p) => ({ value: p.id, label: p.name })),
            ]}
            className="flex-1 sm:flex-none sm:w-40 min-w-[120px]"
          />
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <span className="text-xs font-semibold text-sky-300">Đã chọn {selectedIds.length} License</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmState({ type: 'bulk_suspend', isOpen: true })}
              icon={<Ban className="w-3.5 h-3.5" />}
            >
              Đình chỉ hàng loạt
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmState({ type: 'bulk_delete', isOpen: true })}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Xóa hàng loạt
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Table
        columns={columns}
        data={licenses}
        loading={loading}
        selectable
        selectedIds={selectedIds}
        onSelectAll={(checked) => setSelectedIds(checked ? licenses.map((l) => l.id) : [])}
        onSelectOne={(id, checked) =>
          setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((item) => item !== id)))
        }
        onRowClick={(item) => setSelectedLicense(item)}
      />

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />

      {/* Create Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Tạo mới License Key"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreate} isLoading={creating}>
              Xác nhận tạo
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Chọn gói cước (Plan)"
            value={createForm.plan_id}
            onChange={(e) => setCreateForm({ ...createForm, plan_id: e.target.value })}
            options={plans.map((p) => ({ value: p.id, label: `${p.name} (${p.max_devices} thiết bị)` }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Số thiết bị tối đa"
              type="number"
              value={createForm.max_devices}
              onChange={(e) => setCreateForm({ ...createForm, max_devices: parseInt(e.target.value) || 1 })}
              required
            />
            <Input
              label="Số ngày hiệu lực"
              type="number"
              value={createForm.days_valid}
              onChange={(e) => setCreateForm({ ...createForm, days_valid: parseInt(e.target.value) || 1 })}
              required
            />
          </div>

          <Input
            label="Số lượng License muốn tạo (Bulk)"
            type="number"
            value={createForm.count}
            onChange={(e) => setCreateForm({ ...createForm, count: parseInt(e.target.value) || 1 })}
            min={1}
            max={100}
            required
          />

          <Input
            label="Ghi chú (tùy chọn)"
            placeholder="Ví dụ: Cấp cho khách hàng đại lý X"
            value={createForm.notes}
            onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
          />
        </form>
      </Modal>

      {/* License Detail Modal */}
      {selectedLicense && (
        <Modal
          isOpen={!!selectedLicense}
          onClose={() => setSelectedLicense(null)}
          title="Chi tiết mã License Key"
          maxWidth="2xl"
          footer={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmState({ type: 'delete', isOpen: true, id: selectedLicense.id })}
              >
                Xóa License
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmState({ type: 'suspend', isOpen: true, id: selectedLicense.id })}
                >
                  {selectedLicense.status === 'suspended' ? 'Mở khóa' : 'Đình chỉ'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSelectedLicense(null)}>
                  Đóng
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">License Key</span>
                <span className="font-mono text-base font-bold text-sky-400">{selectedLicense.key}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleCopy(selectedLicense.key)} icon={<Copy className="w-3.5 h-3.5" />}>
                Sao chép
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Trạng thái:</span>
                <div className="mt-1">{getStatusBadge(selectedLicense.status)}</div>
              </div>
              <div>
                <span className="text-slate-400 block">Gói cước:</span>
                <span className="font-semibold text-slate-200 mt-1 block">{selectedLicense.plan_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Số thiết bị:</span>
                <span className="font-semibold text-slate-200 mt-1 block">
                  {selectedLicense.active_devices_count} / {selectedLicense.max_devices}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Hạn sử dụng:</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-semibold text-slate-200">{formatDateShort(selectedLicense.valid_until)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setExtendDays(30);
                      setExtendLicenseItem(selectedLicense);
                    }}
                    className="text-[11px] font-medium text-sky-400 hover:text-sky-300 underline"
                  >
                    Gia hạn
                  </button>
                </div>
              </div>
              <div>
                <span className="text-slate-400 block">Chủ sở hữu:</span>
                <span className="font-semibold text-slate-200 mt-1 block">{selectedLicense.owner_email || 'Chưa gán'}</span>
              </div>
            </div>

            {/* Devices List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-400" /> Danh sách thiết bị đã kích hoạt
                </h4>
                {selectedLicense.devices && selectedLicense.devices.length > 0 && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleResetDevices(selectedLicense.id)}
                    className="text-xs py-1 px-2"
                  >
                    Reset toàn bộ thiết bị
                  </Button>
                )}
              </div>
              {selectedLicense.devices && selectedLicense.devices.length > 0 ? (
                <div className="divide-y divide-slate-700/60 border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50">
                  {selectedLicense.devices.map((dev) => (
                    <div key={dev.id} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200">{dev.device_name}</span>{' '}
                        <span className="text-slate-500 font-mono">({dev.os} - IP: {dev.ip})</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveDevice(selectedLicense.id, dev.id || dev.hwid || dev.device_id)}
                        className="text-rose-400 hover:bg-rose-500/10 py-0.5 px-2 text-xs"
                      >
                        Ngắt kết nối
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Chưa có thiết bị nào kích hoạt với mã này.</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Extend License Modal */}
<Modal
  isOpen={!!extendLicenseItem}
  onClose={() => setExtendLicenseItem(null)}
  title="Gia hạn thời hạn License Key"
  footer={
    <>
      <Button variant="outline" size="sm" onClick={() => setExtendLicenseItem(null)}>
        Hủy
      </Button>
      <Button variant="primary" size="sm" onClick={handleExtendLicense} isLoading={extending}>
        Xác nhận gia hạn
      </Button>
    </>
  }
>
  {extendLicenseItem && (
    <div className="space-y-4">
      <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs space-y-1.5">
        <div>
          <span className="text-slate-400">License Key: </span>
          <span className="font-mono text-sky-400 font-semibold">{extendLicenseItem.key}</span>
        </div>
        <div>
          <span className="text-slate-400">Gói cước: </span>
          <span className="text-slate-200 font-semibold">{extendLicenseItem.plan_name || "Standard"}</span>
        </div>
        <div>
          <span className="text-slate-400">Hạn sử dụng hiện tại: </span>
          <span className="text-slate-200 font-semibold">{formatDateShort(extendLicenseItem.valid_until)}</span>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-300 font-medium block mb-2">Chọn nhanh thời gian gia hạn</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "+30 ngày", days: 30 },
            { label: "+90 ngày", days: 90 },
            { label: "+180 ngày", days: 180 },
            { label: "+365 ngày", days: 365 },
          ].map((item) => (
            <button
              key={item.days}
              type="button"
              onClick={() => setExtendDays(item.days)}
              className={
                "py-2 text-xs font-medium rounded-lg border transition-all " +
                (extendDays === item.days
                  ? "bg-sky-600 border-sky-500 text-white shadow-sm"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-300 font-medium block mb-1.5">Hoặc nhập số ngày tùy chỉnh</label>
        <Input
          type="number"
          min={1}
          value={extendDays}
          onChange={(e) => setExtendDays(Math.max(1, parseInt(e.target.value) || 1))}
          placeholder="Nhập số ngày cần gia hạn..."
        />
      </div>

      <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-lg text-xs text-sky-200 flex items-center justify-between">
        <span>Hạn dùng mới dự kiến:</span>
        <span className="font-semibold text-white font-mono">
          {getProjectedExpiry(extendLicenseItem.valid_until, extendDays)}
        </span>
      </div>
    </div>
  )}
</Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ ...confirmState, isOpen: false })}
        onConfirm={handleConfirmAction}
        isLoading={actionLoading}
        title="Xác nhận thao tác"
        message="Bạn có chắc chắn muốn thực hiện hành động này? Dữ liệu bị thay đổi có thể ảnh hưởng đến người dùng đang truy cập."
      />
    </div>
  );
}
