'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Lock, Ban, Plus, Trash2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { AuditEntry, LoginHistoryEntry, SecurityBlockedIP, SuspiciousActivity, PaginatedResponse } from '@/lib/types';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Pagination } from '@/components/ui/Pagination';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

export default function AuditPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'audit' | 'login_history' | 'security'>('audit');

  // Tab 1: Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditTypeFilter, setAuditTypeFilter] = useState('all');

  // Tab 2: Login History
  const [logins, setLogins] = useState<LoginHistoryEntry[]>([]);
  const [loginLoading, setLoginLoading] = useState(true);
  const [loginPage, setLoginPage] = useState(1);
  const [loginTotalPages, setLoginTotalPages] = useState(1);
  const [loginSearch, setLoginSearch] = useState('');

  // Tab 3: Security
  const [blockedIPs, setBlockedIPs] = useState<SecurityBlockedIP[]>([]);
  const [suspicious, setSuspicious] = useState<SuspiciousActivity[]>([]);
  const [securityLoading, setSecurityLoading] = useState(true);

  // Add Blocked IP Modal
  const [isAddIPOpen, setIsAddIPOpen] = useState(false);
  const [ipForm, setIpForm] = useState({ ip: '', reason: '' });
  const [addingIP, setAddingIP] = useState(false);
  const [unblockId, setUnblockId] = useState<string | null>(null);

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const query = new URLSearchParams({
        page: auditPage.toString(),
        limit: '10',
        type: auditTypeFilter !== 'all' ? auditTypeFilter : '',
      });
      const res = await api.get<PaginatedResponse<AuditEntry>>(`/v1/admin/audit/logs?${query.toString()}`);
      setAuditLogs(res.data || []);
      setAuditTotalPages(res.total_pages || 1);
    } catch (err) {
      toast.error('Không thể tải Audit Logs');
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchLoginHistory = async () => {
    setLoginLoading(true);
    try {
      const query = new URLSearchParams({
        page: loginPage.toString(),
        limit: '10',
        search: loginSearch,
      });
      const res = await api.get<PaginatedResponse<LoginHistoryEntry>>(`/v1/admin/audit/logins?${query.toString()}`);
      setLogins(res.data || []);
      setLoginTotalPages(res.total_pages || 1);
    } catch (err) {
      toast.error('Không thể tải lịch sử đăng nhập');
    } finally {
      setLoginLoading(false);
    }
  };

  const fetchSecurityData = async () => {
    setSecurityLoading(true);
    try {
      const [ipRes, susRes] = await Promise.all([
        api.get<{ data: SecurityBlockedIP[] }>('/v1/admin/security/blocked-ips'),
        api.get<{ data: SuspiciousActivity[] }>('/v1/admin/security/suspicious'),
      ]);
      setBlockedIPs(ipRes.data || []);
      setSuspicious(susRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSecurityLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'login_history') fetchLoginHistory();
    if (activeTab === 'security') fetchSecurityData();
  }, [activeTab, auditPage, auditTypeFilter, loginPage, loginSearch]);

  const handleAddBlockedIP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingIP(true);
    try {
      await api.post('/v1/admin/security/blocked-ips', ipForm);
      toast.success(`Đã chặn địa chỉ IP: ${ipForm.ip}`);
      setIsAddIPOpen(false);
      setIpForm({ ip: '', reason: '' });
      fetchSecurityData();
    } catch (err: any) {
      toast.error(err.message || 'Chặn IP thất bại');
    } finally {
      setAddingIP(false);
    }
  };

  const handleUnblockIP = async () => {
    if (!unblockId) return;
    try {
      await api.delete(`/v1/admin/security/blocked-ips/${unblockId}`);
      toast.success('Đã gỡ bỏ IP khỏi danh sách chặn');
      setUnblockId(null);
      fetchSecurityData();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi gỡ bỏ IP');
    }
  };

  // Columns Tab 1
  const auditColumns: Column<AuditEntry>[] = [
    {
      header: 'Thời gian',
      cell: (item) => <span className="text-xs text-slate-400 font-mono">{formatDate(item.timestamp)}</span>,
    },
    {
      header: 'Người thực hiện',
      cell: (item) => (
        <div>
          <span className="font-semibold text-slate-200 block text-xs">{item.user_email}</span>
          <span className="text-[10px] text-slate-400 uppercase">{item.user_type}</span>
        </div>
      ),
    },
    {
      header: 'Loại',
      cell: (item) => <Badge variant="info">{item.action_type}</Badge>,
    },
    {
      header: 'Hành động',
      cell: (item) => <span className="text-xs font-semibold text-sky-400">{item.action_name}</span>,
    },
    {
      header: 'Đối tượng (Target)',
      cell: (item) => <span className="text-xs font-mono text-slate-300">{item.target || '-'}</span>,
    },
    {
      header: 'IP Address',
      cell: (item) => <span className="text-xs font-mono text-slate-400">{item.ip}</span>,
    },
  ];

  // Columns Tab 2
  const loginColumns: Column<LoginHistoryEntry>[] = [
    {
      header: 'Thời gian',
      cell: (item) => <span className="text-xs text-slate-400 font-mono">{formatDate(item.timestamp)}</span>,
    },
    {
      header: 'Email',
      cell: (item) => <span className="text-xs font-semibold text-slate-200">{item.email}</span>,
    },
    {
      header: 'Địa chỉ IP',
      cell: (item) => <span className="text-xs font-mono text-slate-300">{item.ip}</span>,
    },
    {
      header: 'Quốc gia',
      cell: (item) => <span className="text-xs text-slate-400">{item.country || 'N/A'}</span>,
    },
    {
      header: 'Kết quả',
      cell: (item) =>
        item.success ? <Badge variant="success">Thành công</Badge> : <Badge variant="danger">Thất bại</Badge>,
    },
    {
      header: 'User Agent',
      cell: (item) => (
        <span className="text-[11px] text-slate-400 block max-w-xs truncate" title={item.user_agent}>
          {item.user_agent}
        </span>
      ),
    },
  ];

  // Columns Blocked IPs
  const ipColumns: Column<SecurityBlockedIP>[] = [
    {
      header: 'Địa chỉ IP',
      cell: (item) => <span className="font-mono text-xs font-bold text-rose-400">{item.ip}</span>,
    },
    {
      header: 'Lý do chặn',
      cell: (item) => <span className="text-xs text-slate-300">{item.reason}</span>,
    },
    {
      header: 'Thời gian chặn',
      cell: (item) => <span className="text-xs text-slate-400">{formatDate(item.blocked_at)}</span>,
    },
    {
      header: 'Hành động',
      cell: (item) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setUnblockId(item.id)}
          className="text-emerald-400 hover:bg-emerald-500/10"
        >
          Gỡ chặn
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-400" /> Audit Log & Bảo Mật Hệ Thống
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Giám sát nhật ký hoạt động, lịch sử truy cập và quản lý an ninh</p>
        </div>
      </div>

      <Tabs
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as any)}
        tabs={[
          { id: 'audit', label: 'Audit Log (Nhật ký)' },
          { id: 'login_history', label: 'Lịch sử Đăng nhập' },
          { id: 'security', label: 'Bảo mật & IP Blocklist' },
        ]}
      />

      {/* Tab 1: Audit Log */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
            <Select
              value={auditTypeFilter}
              onChange={(e) => setAuditTypeFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Tất cả loại hành động' },
                { value: 'AUTH', label: 'Xác thực (AUTH)' },
                { value: 'LICENSE', label: 'Bản quyền (LICENSE)' },
                { value: 'USER', label: 'Người dùng (USER)' },
                { value: 'SECURITY', label: 'Bảo mật (SECURITY)' },
              ]}
              className="w-full sm:w-60"
            />
          </div>

          <Table columns={auditColumns} data={auditLogs} loading={auditLoading} />
          <Pagination page={auditPage} totalPages={auditTotalPages} onPageChange={setAuditPage} />
        </div>
      )}

      {/* Tab 2: Login History */}
      {activeTab === 'login_history' && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
            <SearchBar value={loginSearch} onChange={setLoginSearch} placeholder="Tìm theo email, IP..." className="w-full sm:w-80" />
          </div>

          <Table columns={loginColumns} data={logins} loading={loginLoading} />
          <Pagination page={loginPage} totalPages={loginTotalPages} onPageChange={setLoginPage} />
        </div>
      )}

      {/* Tab 3: Security & IP Blocklist */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Suspicious Activities Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Cảnh báo hoạt động bất thường
            </h3>

            {suspicious.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suspicious.map((item) => (
                  <Card key={item.id} className="border-rose-500/30 bg-rose-500/5">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge variant={item.severity === 'high' ? 'danger' : 'warning'} className="uppercase">
                          {item.severity}
                        </Badge>
                        <h4 className="font-semibold text-slate-100 text-sm mt-2">{item.type}</h4>
                        <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                      </div>
                      <span className="font-mono text-xs text-rose-400">{item.ip}</span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center text-xs text-slate-500">
                Không phát hiện hoạt động nghi vấn nào trong 24 giờ qua.
              </Card>
            )}
          </div>

          {/* Blocked IP Table */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Ban className="w-4 h-4 text-amber-400" /> Danh sách địa chỉ IP bị chặn (IP Blocklist)
              </h3>
              <Button variant="danger" size="sm" onClick={() => setIsAddIPOpen(true)} icon={<Plus className="w-4 h-4" />}>
                Chặn IP mới
              </Button>
            </div>

            <Table columns={ipColumns} data={blockedIPs} loading={securityLoading} />
          </div>
        </div>
      )}

      {/* Modal Add IP Block */}
      <Modal
        isOpen={isAddIPOpen}
        onClose={() => setIsAddIPOpen(false)}
        title="Thêm địa chỉ IP vào danh sách chặn"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsAddIPOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" size="sm" onClick={handleAddBlockedIP} isLoading={addingIP}>
              Xác nhận Chặn
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddBlockedIP} className="space-y-4">
          <Input
            label="Địa chỉ IP"
            placeholder="VD: 192.168.1.100"
            value={ipForm.ip}
            onChange={(e) => setIpForm({ ...ipForm, ip: e.target.value })}
            required
          />
          <Input
            label="Lý do chặn"
            placeholder="VD: Spam login liên tục"
            value={ipForm.reason}
            onChange={(e) => setIpForm({ ...ipForm, reason: e.target.value })}
            required
          />
        </form>
      </Modal>

      {/* Unblock Confirm */}
      <ConfirmDialog
        isOpen={!!unblockId}
        onClose={() => setUnblockId(null)}
        onConfirm={handleUnblockIP}
        title="Gỡ chặn IP"
        message="Bạn có chắc chắn muốn bỏ IP này khỏi danh sách chặn?"
      />
    </div>
  );
}
