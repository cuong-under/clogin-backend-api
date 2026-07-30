'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut, UserCheck, ChevronRight } from 'lucide-react';
import { getStoredAdmin, logoutAdmin } from '@/lib/auth';
import { AdminUser } from '@/lib/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminUser | null>(null);

  useEffect(() => {
    setAdmin(getStoredAdmin());
  }, []);

  const routeNames: Record<string, string> = {
    dashboard: 'Dashboard Overview',
    licenses: 'Quản Lý License Keys',
    plans: 'Gói Bản Quyền (Plans)',
    coupons: 'Mã Giảm Giá (Coupons)',
    users: 'Chủ Sở Hữu (Owners)',
    workers: 'Nhân Viên (Workers)',
    profiles: 'Cloud Profiles',
    releases: 'Phiên Bản App (Releases)',
    audit: 'Audit Log & Bảo Mật',
    communication: 'Thông Báo App',
    settings: 'Cấu Hình Hệ Thống',
    'feature-flags': 'Feature Flags',
    admins: 'Tài Khoản Admin',
  };

  const pathSegments = pathname.split('/').filter(Boolean);

  const getRoleVariant = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return 'purple';
      case 'support':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <header className="h-16 bg-[#0a202a]/90 backdrop-blur-xl border-b border-[#194354] px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-medium text-[#6b9eb3]">
        <Link href="/dashboard" className="hover:text-[#00f0ff] transition-colors">
          Clogin Admin
        </Link>
        {pathSegments.map((segment, idx) => {
          const href = `/${pathSegments.slice(0, idx + 1).join('/')}`;
          const isLast = idx === pathSegments.length - 1;
          const label = routeNames[segment] || segment;

          return (
            <React.Fragment key={href}>
              <ChevronRight className="w-3.5 h-3.5 text-[#487385]" />
              {isLast ? (
                <span className="text-white font-bold tracking-wide">{label}</span>
              ) : (
                <Link href={href} className="hover:text-[#00f0ff] transition-colors">
                  {label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Right User Bar */}
      <div className="flex items-center gap-4">
        {admin ? (
          <div className="flex items-center gap-3 bg-[#112b38] px-3.5 py-1.5 rounded-lg border border-[#194354] shadow-sm">
            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#00f0ff] to-[#0088ff] text-[#05161e] flex items-center justify-center font-extrabold text-xs">
              {admin.name?.[0] || admin.email?.[0] || 'A'}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-white">{admin.name || admin.email}</span>
              <span className="text-[10px] text-[#6b9eb3]">{admin.email}</span>
            </div>
            <Badge variant={getRoleVariant(admin.role)} className="ml-1 uppercase text-[10px] border-[#00f0ff]/30 text-[#00f0ff] bg-[#00f0ff]/10">
              {admin.role || 'admin'}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#6b9eb3]">
            <UserCheck className="w-4 h-4 text-[#00f0ff]" />
            <span>Session Active</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => logoutAdmin()}
          title="Đăng xuất"
          icon={<LogOut className="w-4 h-4 text-[#ff2a6d]" />}
          className="hover:bg-[#ff2a6d]/15 hover:text-[#ff2a6d] border-[#194354] bg-[#112b38]"
        >
          Đăng xuất
        </Button>
      </div>
    </header>
  );
};
