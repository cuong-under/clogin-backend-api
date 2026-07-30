'use client';

import React, { useEffect, useState } from 'react';
import { Key, Users, FolderGit2, Smartphone, RefreshCw, Activity, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardStats, AuditEntry } from '@/lib/types';
import { MetricCard } from '@/components/ui/MetricCard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LineChart } from '@/components/charts/LineChart';
import { BarChart } from '@/components/charts/BarChart';
import { formatTimeAgo, formatDate } from '@/lib/utils';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysRange, setDaysRange] = useState<'7d' | '30d'>('7d');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await api.get<DashboardStats>(`/v1/admin/dashboard/stats?range=${daysRange}`);
      setStats(data);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [daysRange]);

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Tổng quan hệ thống</h1>
          <p className="text-xs text-slate-400 mt-0.5">Theo dõi hoạt động, bản quyền và người dùng theo thời gian thực</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setDaysRange('7d')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                daysRange === '7d' ? 'bg-sky-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7 ngày
            </button>
            <button
              onClick={() => setDaysRange('30d')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                daysRange === '30d' ? 'bg-sky-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              30 ngày
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            isLoading={loading}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Tổng License"
          value={stats?.total_licenses ?? 0}
          change="+12% so với tháng trước"
          changeType="increase"
          icon={<Key className="w-5 h-5" />}
          loading={loading}
        />
        <MetricCard
          title="Người dùng Active"
          value={stats?.active_users ?? 0}
          change="+8% tuần này"
          changeType="increase"
          icon={<Users className="w-5 h-5" />}
          loading={loading}
        />
        <MetricCard
          title="Cloud Profiles"
          value={stats?.cloud_profiles ?? 0}
          change="+24% tháng này"
          changeType="increase"
          icon={<FolderGit2 className="w-5 h-5" />}
          loading={loading}
        />
        <MetricCard
          title="Thiết bị Active"
          value={stats?.active_devices ?? 0}
          change="Ổn định"
          changeType="neutral"
          icon={<Smartphone className="w-5 h-5" />}
          loading={loading}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={`Lượt đăng nhập hệ thống (${daysRange})`}>
          {stats?.logins_by_day && stats.logins_by_day.length > 0 ? (
            <LineChart data={stats.logins_by_day} dataKey="count" xKey="date" color="#38bdf8" />
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">Chưa có dữ liệu biểu đồ</div>
          )}
        </Card>

        <Card title={`Người dùng mới đăng ký (${daysRange})`}>
          {stats?.new_users_by_day && stats.new_users_by_day.length > 0 ? (
            <BarChart data={stats.new_users_by_day} dataKey="count" xKey="date" color="#10b981" />
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">Chưa có dữ liệu biểu đồ</div>
          )}
        </Card>
      </div>

      {/* Recent Activity Feed */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-sky-400" />
            <span className="text-base font-semibold text-slate-100">Hoạt động gần đây (Audit Log)</span>
          </div>
        }
        extra={
          <Link
            href="/audit"
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Xem tất cả <ArrowUpRight className="w-4 h-4" />
          </Link>
        }
      >
        <div className="divide-y divide-slate-700/60">
          {stats?.recent_activity && stats.recent_activity.length > 0 ? (
            stats.recent_activity.slice(0, 10).map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <Badge variant={item.action_type === 'SECURITY' ? 'danger' : 'info'}>
                    {item.action_type || 'SYSTEM'}
                  </Badge>
                  <div>
                    <span className="font-semibold text-slate-200">{item.user_email}</span>{' '}
                    <span className="text-slate-400">{item.action_name}</span>{' '}
                    {item.target && <span className="text-sky-400 font-mono">({item.target})</span>}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-slate-500 font-mono">
                  <span>{item.ip}</span>
                  <span>{formatDate(item.timestamp)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-slate-500 text-sm">Chưa có nhật ký hoạt động gần đây</div>
          )}
        </div>
      </Card>
    </div>
  );
}
