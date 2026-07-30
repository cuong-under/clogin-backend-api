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
    dashboard: 'Dashboard',
    licenses: 'Licenses',
    plans: 'License Plans',
    coupons: 'Coupons',
    users: 'Owners',
    workers: 'Workers',
    profiles: 'Cloud Profiles',
    releases: 'Releases',
    audit: 'Audit & Security',
    communication: 'Announcements',
    settings: 'System Config',
    'feature-flags': 'Feature Flags',
    admins: 'Admin Users',
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
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <Link href="/dashboard" className="hover:text-slate-200 transition-colors">
          Home
        </Link>
        {pathSegments.map((segment, idx) => {
          const href = `/${pathSegments.slice(0, idx + 1).join('/')}`;
          const isLast = idx === pathSegments.length - 1;
          const label = routeNames[segment] || segment;

          return (
            <React.Fragment key={href}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              {isLast ? (
                <span className="text-slate-100 font-semibold">{label}</span>
              ) : (
                <Link href={href} className="hover:text-slate-200 transition-colors">
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
          <div className="flex items-center gap-3 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/60">
            <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
              {admin.name?.[0] || admin.email?.[0] || 'A'}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-100">{admin.name || admin.email}</span>
              <span className="text-[10px] text-slate-400">{admin.email}</span>
            </div>
            <Badge variant={getRoleVariant(admin.role)} className="ml-1 uppercase text-[10px]">
              {admin.role || 'admin'}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <UserCheck className="w-4 h-4 text-sky-400" />
            <span>Session Active</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => logoutAdmin()}
          title="Đăng xuất"
          icon={<LogOut className="w-4 h-4 text-rose-400" />}
          className="hover:bg-rose-500/10 hover:text-rose-400"
        >
          Thoát
        </Button>
      </div>
    </header>
  );
};
