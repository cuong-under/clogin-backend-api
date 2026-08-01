'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut, UserCheck, ChevronRight, Menu } from 'lucide-react';
import { getStoredAdmin, logoutAdmin } from '@/lib/auth';
import { AdminUser } from '@/lib/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export const Header: React.FC<{ onMenuClick: () => void }> = ({ onMenuClick }) => {
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
    <header className="h-16 bg-[#0a202a]/90 backdrop-blur-xl border-b border-[#194354] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 gap-3">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="p-2 rounded-lg text-[#6b9eb3] hover:text-white hover:bg-[#112b38] lg:hidden shrink-0"
        aria-label="Mở menu điều hướng"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-medium text-[#6b9eb3] min-w-0 flex-1">
        <Link href="/dashboard" className="hover:text-[#00f0ff] transition-colors shrink-0">
          Clogin Admin
        </Link>
        {pathSegments.map((segment, idx) => {
          const href = `/${pathSegments.slice(0, idx + 1).join('/')}`;
          const isLast = idx === pathSegments.length - 1;
          const label = routeNames[segment] || segment;

          return (
            <React.Fragment key={href}>
              <ChevronRight className="w-3.5 h-3.5 text-[#487385] shrink-0" />
              {isLast ? (
                <span className="text-white font-bold tracking-wide truncate">{label}</span>
              ) : (
                <Link href={href} className="hover:text-[#00f0ff] transition-colors truncate shrink-0">
                  {label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Right User Bar */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {admin ? (
          <div className="flex items-center gap-3 bg-[#112b38] px-3.5 py-1.5 rounded-lg border border-[#194354] shadow-sm">
            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#00f0ff] to-[#0088ff] text-[#05161e] flex items-center justify-center font-extrabold text-xs">
              {admin.name?.[0] || admin.email?.[0] || 'A'}
            </div>
            <div className="flex-col text-left hidden sm:flex">
              <span className="text-xs font-bold text-white">{admin.name || admin.email}</span>
              <span className="text-[10px] text-[#6b9eb3]">{admin.email}</span>
            </div>
            <Badge variant={getRoleVariant(admin.role)} className="ml-1 uppercase text-[10px] border-[#00f0ff]/30 text-[#00f0ff] bg-[#00f0ff]/10 hidden sm:inline-flex">
              {admin.role || 'admin'}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#6b9eb3]">
            <UserCheck className="w-4 h-4 text-[#00f0ff]" />
            <span className="hidden sm:inline">Session Active</span>
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
          <span className="hidden sm:inline">Đăng xuất</span>
        </Button>
      </div>
    </header>
  );
};
