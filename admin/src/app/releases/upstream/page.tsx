'use client';

import React, { useEffect, useState, useRef } from 'react';
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
  GitFork,
  Clock,
  Layers,
  Loader2,
  XCircle,
  Check
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
  const [commitTab, setCommitTab] = useState<'pending' | 'all'>('pending');
  const [config, setConfig] = useState<UpstreamConfig>({
    github_token: '',
    upstream_repo: 'ProxyShard/ShardBrowser',
    origin_repo: 'cuong-under/CloginStudio',
    target_branch: 'main',
    release_branch: 'main'
  });

  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseForm, setReleaseForm] = useState({
    version: '0.1.11',
    changelog: 'Cập nhật từ Upstream: Chromium 152 runtime, ShardHelper, Human Mouse & Type spoofing, bookmarks và các bản vá lỗi.'
  });

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatusAndCommits = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    try {
      const [statusRes, commitsRes, configRes] = await Promise.all([
        api.get<UpstreamStatus>('/v1/admin/upstream/status').catch(() => null),
        api.get<{ data: UpstreamCommit[] }>('/v1/admin/upstream/commits').catch(() => ({ data: [] })),
        api.get<{ data: UpstreamConfig }>('/v1/admin/upstream/config').catch(() => null)
      ]);

      if (statusRes) {
        setStatus(statusRes);
        // Nếu có workflow đang chạy (in_progress / queued), duy trì auto-poll mỗi 5 giây
        const isWorkflowRunning =
          statusRes.latest_workflow_run?.status === 'in_progress' ||
          statusRes.latest_workflow_run?.status === 'queued';

        if (isWorkflowRunning) {
          if (!pollTimerRef.current) {
            pollTimerRef.current = setTimeout(() => {
              pollTimerRef.current = null;
              fetchStatusAndCommits(true);
            }, 5000);
          }
        } else if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
      const commitList = commitsRes?.data || [];
      if (Array.isArray(commitList)) {
        setCommits(commitList);
      }
      if (configRes?.data) setConfig(configRes.data);
    } catch (err: any) {
      if (!isPolling) {
        toast.error(err.message || 'Không thể tải dữ liệu Upstream');
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndCommits();
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
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
    if (status?.status === 'UP_TO_DATE' && status?.behind_by === 0 && !status?.active_pr) {
      toast.info('Mã nguồn CloginStudio đã đồng bộ hoàn toàn với Upstream, không có commit mới nào cần tạo Pull Request!');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post<{
        pr_url?: string;
        pr_number?: number;
        message?: string;
        action_url?: string;
        via_workflow?: boolean;
        already_up_to_date?: boolean;
      }>('/v1/admin/upstream/create-pr');

      if (res.already_up_to_date) {
        toast.info(res.message || 'Mã nguồn đã đồng bộ hoàn toàn với Upstream!');
      } else if (res.pr_number && res.pr_url) {
        toast.success(`Đã tạo Sync Pull Request #${res.pr_number} thành công!`);
        window.open(res.pr_url, '_blank');
      } else if (res.via_workflow) {
        toast.success(res.message || 'Đã kích hoạt GitHub Actions để tự động đồng bộ code!');
      } else {
        toast.success(res.message || 'Đã đồng bộ trực tiếp từ Upstream thành công!');
      }
      fetchStatusAndCommits();
    } catch (err: any) {
      toast.error(err.message || 'Không thể tạo Pull Request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerRelease = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActionLoading(true);
    try {
      const res = await api.post<{
        message?: string;
        tag?: string;
        source_branch?: string;
      }>('/v1/admin/upstream/trigger-release', {
        version: releaseForm.version,
        changelog: releaseForm.changelog,
        branch: config.release_branch || config.target_branch || 'main'
      });
      toast.success(res.message || 'Đã khởi tạo bản build release thành công!');
      setShowReleaseModal(false);
      fetchStatusAndCommits();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi kích hoạt release build');
    } finally {
      setActionLoading(false);
    }
  };

  const isWorkflowRunning =
    status?.latest_workflow_run?.status === 'in_progress' ||
    status?.latest_workflow_run?.status === 'queued';

  const isUpToDate =
    status?.status === 'UP_TO_DATE' ||
    (status?.behind_by === 0 && !status?.active_pr && !isWorkflowRunning);

  const pendingCommits = commits.filter((c) => c.is_merged === false);
  const displayedCommits = commitTab === 'pending' ? pendingCommits : commits;

  const getStatusBadge = () => {
    if (!status) return <Badge variant="default">Unknown</Badge>;
    if (isWorkflowRunning) {
      return (
        <Badge variant="info" className="gap-1 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang chạy Sync Action...
        </Badge>
      );
    }
    switch (status.status) {
      case 'UP_TO_DATE':
        return (
          <Badge variant="success" className="gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
            onClick={() => fetchStatusAndCommits()}
            isLoading={loading}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Làm mới
          </Button>

          <Button
            variant={isUpToDate ? "outline" : "primary"}
            size="sm"
            onClick={handleCreateSyncPR}
            isLoading={actionLoading || isWorkflowRunning}
            icon={<GitPullRequest className="w-4 h-4" />}
          >
            {isWorkflowRunning ? 'Đang chạy Sync...' : isUpToDate ? 'Tạo Sync PR' : 'Tạo Sync PR'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowReleaseModal(true)}
            isLoading={actionLoading}
            icon={<Play className="w-4 h-4" />}
          >
            Build Release Mới
          </Button>
        </div>
      </div>

      {/* Up-to-date Confirmation Banner */}
      {isUpToDate && !isWorkflowRunning && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-emerald-300">
              Mã nguồn CloginStudio đã đồng bộ trọn vẹn với Upstream
            </h4>
            <p className="text-xs text-emerald-200/80 mt-1">
              Nhánh <code className="text-emerald-300 font-mono font-semibold">{config.target_branch}</code> hiện tại đã tích hợp đầy đủ mọi commit từ kho nguồn gốc <code className="text-emerald-300 font-mono">{config.upstream_repo}</code> (bao gồm Chrome 152 runtime, shardhelper, human type/mouse spoofing và các bản sửa lỗi). Không còn bản vá nào tồn đọng.
            </p>
          </div>
        </div>
      )}

      {/* Active Pull Request Alert Card */}
      {status?.active_pr && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <GitPullRequest className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-emerald-300">
                  Có Pull Request đồng bộ đang mở: #{status.active_pr.number}
                </h4>
                <Badge variant="success" className="text-[10px]">Open PR</Badge>
              </div>
              <p className="text-xs text-emerald-200/80 mt-1 font-mono">
                {status.active_pr.title}
              </p>
              <p className="text-[11px] text-emerald-300/60 mt-0.5">
                Nhánh nguồn: <span className="font-mono">{status.active_pr.head || 'sync/upstream'}</span> &bull; Tạo {formatTimeAgo(status.active_pr.created_at)}
              </p>
            </div>
          </div>
          <a
            href={status.active_pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button size="sm" variant="outline" className="text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10 gap-1.5 text-xs">
              Xem & Merge Trên GitHub <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
        </div>
      )}

      {/* Running GitHub Actions Workflow Banner */}
      {isWorkflowRunning && (
        <div className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-sky-300">GitHub Actions đang chạy tác vụ đồng bộ</h4>
              <p className="text-xs text-sky-200/80 mt-0.5">
                Hệ thống đang merge code từ {config.upstream_repo}, tự động bảo vệ branding Clogin và chuẩn bị Pull Request...
              </p>
            </div>
          </div>
          {status?.latest_workflow_run?.html_url && (
            <a
              href={status.latest_workflow_run.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button size="sm" variant="outline" className="text-sky-300 border-sky-500/30 hover:bg-sky-500/10 gap-1.5 text-xs">
                Xem Runner Trực Tiếp <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
        </div>
      )}

      {/* Failed GitHub Action Workflow Alert */}
      {!isWorkflowRunning && status?.latest_workflow_run?.conclusion === 'failure' && !status?.active_pr && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">Lần chạy GitHub Action gần nhất thất bại</h4>
              <p className="text-xs text-rose-200/80 mt-0.5">
                Lần chạy lúc {formatDate(status.latest_workflow_run.created_at)} không thành công. Bạn có thể kiểm tra log runner để xem chi tiết hoặc bấm &quot;Tạo Sync PR&quot; để chạy lại bản vá mới.
              </p>
            </div>
          </div>
          {status.latest_workflow_run.html_url && (
            <a
              href={status.latest_workflow_run.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button size="sm" variant="outline" className="text-rose-300 border-rose-500/30 hover:bg-rose-500/10 gap-1.5 text-xs">
                Xem Chi Tiết Lỗi <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
        </div>
      )}

      {/* Metric Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Kho nguồn (Upstream)</span>
            <GitFork className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <p className="text-sm font-semibold text-slate-200 truncate">{config.upstream_repo}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Branch: main</p>
          </div>
        </Card>

        <Card className="p-4 border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Kho dự án (Origin)</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <p className="text-sm font-semibold text-slate-200 truncate">{config.origin_repo}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Target: {config.target_branch}</p>
          </div>
        </Card>

        <Card className="p-4 border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Độ lệch Commit</span>
            {isUpToDate ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <GitCommit className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            {isUpToDate ? (
              <>
                <span className="text-xl font-bold text-emerald-400">0</span>
                <span className="text-xs text-emerald-400/90 font-medium">commits (Đã đồng bộ)</span>
              </>
            ) : (
              <>
                <span className="text-xl font-bold text-amber-400">{status?.behind_by ?? 0}</span>
                <span className="text-xs text-slate-400">commits phía sau</span>
              </>
            )}
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
      {!isUpToDate && status?.behind_by ? status.behind_by > 0 && !status.active_pr && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-300">Kho nguồn Upstream có bản cập nhật mới</h4>
            <p className="text-xs text-amber-200/80 mt-1">
              Đang có <strong>{status.behind_by}</strong> commit mới trên repo gốc <code className="text-amber-300">{config.upstream_repo}</code>. Bấm nút <strong>&quot;Tạo Sync PR&quot;</strong> để tạo nhánh và mở Pull Request đồng bộ.
            </p>
          </div>
        </div>
      ) : null}

      {/* Commit History List */}
      <Card className="p-5 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-200">Lịch Sử Commits Từ Upstream</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Lịch sử 30 commit gần nhất từ repo gốc <code className="text-slate-300">{config.upstream_repo}</code>. Nhãn &quot;Đã gộp&quot; xác nhận commit đã có trong nhánh <code className="text-slate-300">{config.target_branch}</code>.
            </p>
          </div>
          <a
            href={`https://github.com/${config.upstream_repo}/commits/main`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium shrink-0"
          >
            Xem trên GitHub <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Tab Filter */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
          <button
            type="button"
            onClick={() => setCommitTab('pending')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              commitTab === 'pending'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span>Cần gộp (Chưa có trong {config.target_branch})</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                pendingCommits.length > 0
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {pendingCommits.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCommitTab('all')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              commitTab === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span>Tất cả commit Upstream</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">
              {commits.length}
            </span>
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Đang tải lịch sử commit...</div>
        ) : commits.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">Chưa có lịch sử commit hoặc chưa cấu hình Token</div>
        ) : commitTab === 'pending' && pendingCommits.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">Không có commit nào cần gộp</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Mọi commit mới nhất từ kho nguồn gốc <span className="font-mono text-slate-300">{config.upstream_repo}</span> đã được hợp nhất thành công vào nhánh <span className="font-mono text-emerald-400">{config.target_branch}</span> của CloginStudio.
            </p>
            <button
              type="button"
              onClick={() => setCommitTab('all')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-medium"
            >
              Xem toàn bộ 30 commit từ Upstream &rarr;
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-3">SHA</th>
                  <th className="py-2.5 px-3">Nội dung Commit (Message)</th>
                  <th className="py-2.5 px-3">Trạng thái gộp</th>
                  <th className="py-2.5 px-3">Tác giả</th>
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayedCommits.map((c) => (
                  <tr key={c.sha} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded text-[11px]">
                        {c.sha}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-md">
                      <p className="text-slate-200 font-medium truncate">{c.message}</p>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {c.is_merged ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Check className="w-3 h-3" /> Đã gộp (Merged)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" /> Chưa gộp (Pending)
                        </span>
                      )}
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

            {/* Modal Build Release Mới */}
      <Modal
        isOpen={showReleaseModal}
        onClose={() => setShowReleaseModal(false)}
        title="Tạo & Build Phiên Bản Release Mới"
      >
        <form onSubmit={handleTriggerRelease} className="space-y-4">
          <div className="space-y-1">
            <Input
              label="Phiên bản phát hành mới (Version SemVer)"
              placeholder="0.1.11"
              value={releaseForm.version}
              onChange={(e) => setReleaseForm({ ...releaseForm, version: e.target.value })}
              required
            />
            <p className="text-[11px] text-slate-400">
              Hệ thống sẽ tự động cập nhật số phiên bản này vào package.json, Cargo.toml, tauri.conf.json trên nhánh <strong>{config.target_branch || 'main'}</strong> và tạo git tag tương ứng.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">Ghi chú phát hành (Changelog)</label>
            <textarea
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-sky-500 min-h-[90px]"
              placeholder="Nhập nội dung các tính năng mới..."
              value={releaseForm.changelog}
              onChange={(e) => setReleaseForm({ ...releaseForm, changelog: e.target.value })}
              required
            />
          </div>

          <div className="p-3 rounded bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p><strong>Quy trình tự động:</strong></p>
            <p>&bull; 1. Tự tạo commit <code>chore(release): v{releaseForm.version}</code>.</p>
            <p>&bull; 2. Tạo git tag <code>v{releaseForm.version}</code> đẩy lên GitHub.</p>
            <p>&bull; 3. GitHub Actions biên dịch bộ cài Windows, ký minisign và đính kèm vào GitHub Release.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowReleaseModal(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" isLoading={actionLoading} icon={<Play className="w-3.5 h-3.5" />}>
              Bắt Đầu Build Release
            </Button>
          </div>
        </form>
      </Modal>

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
            placeholder="main"
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
