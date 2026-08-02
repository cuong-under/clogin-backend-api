'use client';

import React, { useEffect, useState } from 'react';
import {
  GitPullRequest,
  RefreshCw,
  GitCommit,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Settings,
  ExternalLink,
  Play,
  Key,
  GitFork,
  Clock,
  Layers
} from 'lucide-react';
import { api } from '@/lib/api';
import { UpstreamStatus, UpstreamConfig, UpstreamCommit } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatTimeAgo } from '@/lib/utils';

export default function UpstreamSyncPage() {
  const toast = useToast();
  const [status, setStatus] = useState<UpstreamStatus | null>(null);
  const [commits, setCommits] = useState<UpstreamCommit[]>([]);
  const [config, setConfig] = useState<UpstreamConfig>({
    github_token: '',
    upstream_repo: 'ProxyShard/ShardBrowser',
    origin_repo: 'cuong-under/CloginStudio',
    target_branch: 'main',
    release_branch: 'refactor/code-organization'
  });

  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const fetchStatusAndCommits = async () => {
    setLoading(true);
    try {
      const [statusRes, commitsRes, configRes] = await Promise.all([
        api.get<UpstreamStatus>('/v1/admin/upstream/status').catch(() => null),
        api.get<{ data: UpstreamCommit[] }>('/v1/admin/upstream/commits').catch(() => ({ data: [] })),
        api.get<{ data: UpstreamConfig }>('/v1/admin/upstream/config').catch(() => null)
      ]);

      if (statusRes) setStatus(statusRes);
      if (commitsRes?.data) setCommits(commitsRes.data);
      if (configRes?.data) setConfig(configRes.data);
    } catch (err: any) {
      toast.error(err.message || 'Không thể tải dữ liệu Upstream');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndCommits();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    try {
      await api.put('/v1/admin/upstream/config', config);
      toast.success('Đã lưu cấu hình GitHub thành công!');
      setShowConfigModal(false);
      fetchStatusAndCommits();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi lưu cấu hình');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleCreateSyncPR = async () => {
    setActionLoading(true);
    try {
      const res = await api.post<{ pr_url?: string; pr_number?: number; message?: string }>('/v1/admin/upstream/create-pr');
      if (res.pr_number) {
        toast.success(`Đã tạo Sync Pull Request #${res.pr_number} thành công!`);
        if (res.pr_url) {
          window.open(res.pr_url, '_blank');
        }
      } else {
        toast.success(res.message || 'Đã đồng bộ trực tiếp từ Upstream thành công!');
        fetchStatusAndCommits();
      }
    } catch (err: any) {
      toast.error(err.message || 'Không thể tạo Pull Request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerRelease = async () => {
    if (!confirm('Bạn có chắc chắn muốn kích hoạt GitHub Actions build bản release mới không?')) return;
    setActionLoading(true);
    try {
      const res = await api.post<{ message: string }>('/v1/admin/upstream/trigger-release');
      toast.success(res.message || 'Đã gửi tín hiệu build release đến GitHub Actions!');
    } catch (err: any) {
      toast.error(err.message || 'Lỗi kích hoạt release build');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) return <Badge variant="default">Unknown</Badge>;
    switch (status.status) {
      case 'UP_TO_DATE':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Đã đồng bộ (Up-to-date)
          </Badge>
        );
      case 'BEHIND':
        return (
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Phía sau {status.behind_by} Commits
          </Badge>
        );
      case 'UNAUTHORIZED':
        return (
          <Badge variant="danger" className="gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Chưa có Token / Sai Token
          </Badge>
        );
      default:
        return <Badge variant="info">{status.status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-100">Đồng bộ Code Upstream</h1>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Theo dõi, so sánh và kéo cập nhật mới nhất từ repository nguồn gốc ({config.upstream_repo}) về CloginStudio.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfigModal(true)}
            icon={<Settings className="w-4 h-4" />}
          >
            Cấu hình GitHub
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatusAndCommits}
            isLoading={loading}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Làm mới
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateSyncPR}
            isLoading={actionLoading}
            icon={<GitPullRequest className="w-4 h-4" />}
          >
            Tạo Sync PR
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleTriggerRelease}
            isLoading={actionLoading}
            icon={<Play className="w-4 h-4" />}
          >
            Build Release Mới
          </Button>
        </div>
      </div>

      {/* Metric Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Kho nguồn (Upstream)</span>
            <GitFork className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <p className="text-sm font-semibold text-slate-200 truncate">{config.upstream_repo}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Branch: {config.target_branch}</p>
          </div>
        </Card>

        <Card className="p-4 border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Kho dự án (Origin)</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <p className="text-sm font-semibold text-slate-200 truncate">{config.origin_repo}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Branch: {config.target_branch}</p>
          </div>
        </Card>

        <Card className="p-4 border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Độ lệch Commit</span>
            <GitCommit className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{status?.behind_by ?? 0}</span>
            <span className="text-xs text-slate-400">commits phía sau</span>
          </div>
        </Card>

        <Card className="p-4 border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Lần kiểm tra cuối</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2">
            <p className="text-sm font-semibold text-slate-200">
              {status?.last_checked ? formatTimeAgo(status.last_checked) : 'Vừa xong'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {status?.last_checked ? formatDate(status.last_checked) : '-'}
            </p>
          </div>
        </Card>
      </div>

      {/* Warning Alert if Behind */}
      {status?.behind_by ? status.behind_by > 0 && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-300">Kho nguồn Upstream có bản cập nhật mới</h4>
            <p className="text-xs text-amber-200/80 mt-1">
              Đang có {status.behind_by} commit mới trên repo gốc `{config.upstream_repo}`. Bạn nên bấm nút **"Tạo Sync PR"** để gộp các bản vá bảo mật và cải tiến antidetect mới nhất vào CloginStudio.
            </p>
          </div>
        </div>
      ) : null}

      {/* Commit History List */}
      <Card className="p-5 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-200">Lịch Sử Commits Từ Upstream</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Danh sách các bản commit gần nhất từ repository gốc {config.upstream_repo}
            </p>
          </div>
          <a
            href={`https://github.com/${config.upstream_repo}/commits/${config.target_branch}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
          >
            Xem trên GitHub <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Đang tải lịch sử commit...</div>
        ) : commits.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">Chưa có lịch sử commit hoặc chưa cấu hình Token</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-3">SHA</th>
                  <th className="py-2.5 px-3">Nội dung Commit (Message)</th>
                  <th className="py-2.5 px-3">Tác giả</th>
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {commits.map((c) => (
                  <tr key={c.sha} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded text-[11px]">
                        {c.sha}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-md">
                      <p className="text-slate-200 font-medium truncate">{c.message}</p>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      <div className="flex items-center gap-2">
                        {c.avatar_url && (
                          <img src={c.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                        )}
                        <span>{c.author}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                      {c.date ? formatDate(c.date) : '-'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <a
                        href={c.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Configuration */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Cấu hình GitHub API & Upstream"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="space-y-1">
            <Input
              label="GitHub Personal Access Token (PAT)"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={config.github_token}
              onChange={(e) => setConfig({ ...config, github_token: e.target.value })}
            />
            <p className="text-[11px] text-slate-400">Token Fine-Grained có quyền repo & workflow để tương tác với GitHub API.</p>
          </div>

          <Input
            label="Repository Upstream (Kho Nguồn Gốc)"
            placeholder="ProxyShard/ShardBrowser"
            value={config.upstream_repo}
            onChange={(e) => setConfig({ ...config, upstream_repo: e.target.value })}
          />

          <Input
            label="Repository Origin (Kho Dự Án Của Bạn)"
            placeholder="cuong-under/CloginStudio"
            value={config.origin_repo}
            onChange={(e) => setConfig({ ...config, origin_repo: e.target.value })}
          />

          <Input
            label="Target Branch (Nhánh Đồng Bộ)"
            placeholder="main"
            value={config.target_branch}
            onChange={(e) => setConfig({ ...config, target_branch: e.target.value })}
          />

          <Input
            label="Release Branch (Nhánh Phát Hành)"
            placeholder="refactor/code-organization"
            value={config.release_branch}
            onChange={(e) => setConfig({ ...config, release_branch: e.target.value })}
          />
          <p className="text-[11px] text-slate-400">Admin Portal sẽ tạo commit version và tag release trên nhánh này khi bấm Build trong Releases.</p>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" type="button" onClick={() => setShowConfigModal(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" isLoading={configLoading}>
              Lưu Cấu Hình
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
