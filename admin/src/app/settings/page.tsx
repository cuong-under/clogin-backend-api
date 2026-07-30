'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Save, ShieldAlert, Key, Zap, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { SystemConfig } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function SystemConfigPage() {
  const toast = useToast();
  const [config, setConfig] = useState<SystemConfig>({
    jwt_expiry: '7d',
    rate_limit_login: 10,
    rate_limit_api: 100,
    maintenance_mode: false,
    maintenance_message: 'Hệ thống đang bảo trì định kỳ. Vui lòng quay lại sau.',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await api.get<SystemConfig>('/v1/admin/settings/config');
      if (res) setConfig((prev) => ({ ...prev, ...res }));
    } catch (err) {
      toast.error('Không thể tải cấu hình hệ thống');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/v1/admin/settings/config', config);
      toast.success('Đã lưu cấu hình hệ thống');
    } catch (err: any) {
      toast.error(err.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-400" /> Cấu Hình Hệ Thống (System Config)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Quản lý JWT, Giới hạn Rate limit và Chế độ bảo trì toàn hệ thống</p>
        </div>

        <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving} icon={<Save className="w-4 h-4" />}>
          Lưu cấu hình
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: JWT Settings */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-sky-400" />
              <span className="font-semibold text-slate-100">JWT Auth Settings</span>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="JWT Expiry Time (Thời hạn phiên token)"
              value={config.jwt_expiry || '7d'}
              onChange={(e) => setConfig({ ...config, jwt_expiry: e.target.value })}
              placeholder="VD: 7d, 24h"
              required
            />
          </div>
        </Card>

        {/* Section 2: Rate Limits */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-slate-100">Rate Limiting (Tần suất yêu cầu)</span>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Rate Limit Đăng nhập (requests / phút)"
              type="number"
              value={config.rate_limit_login || 10}
              onChange={(e) => setConfig({ ...config, rate_limit_login: parseInt(e.target.value) || 10 })}
              required
            />
            <Input
              label="Rate Limit API chung (requests / phút)"
              type="number"
              value={config.rate_limit_api || 100}
              onChange={(e) => setConfig({ ...config, rate_limit_api: parseInt(e.target.value) || 100 })}
              required
            />
          </div>
        </Card>

        {/* Section 3: Maintenance Mode */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-rose-400" />
              <span className="font-semibold text-slate-100">Chế Độ Bảo Trì (Maintenance Mode)</span>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900 border border-slate-700">
              <div>
                <span className="font-semibold text-slate-200 text-sm block">Kích hoạt Chế độ Bảo trì</span>
                <span className="text-xs text-slate-400">
                  Tất cả yêu cầu từ ứng dụng Desktop sẽ bị từ chối với thông báo bên dưới.
                </span>
              </div>
              <input
                type="checkbox"
                checked={config.maintenance_mode || false}
                onChange={(e) => setConfig({ ...config, maintenance_mode: e.target.checked })}
                className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-sky-400 focus:ring-sky-400 cursor-pointer"
              />
            </div>

            <Input
              label="Thông báo bảo trì hiển thị cho người dùng"
              value={config.maintenance_message || ''}
              onChange={(e) => setConfig({ ...config, maintenance_message: e.target.value })}
              required
            />
          </div>
        </Card>
      </form>
    </div>
  );
}
