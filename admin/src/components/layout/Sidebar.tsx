'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Key,
  Users,
  FolderGit2,
  DownloadCloud,
  ShieldCheck,
  Megaphone,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShardLogo } from '../ui/ShardLogo';

interface NavItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  children?: { label: string; href: string }[];
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Licenses: true,
    Users: true,
    Settings: true,
  });

  const toggleGroup = (groupLabel: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupLabel]: !prev[groupLabel] }));
  };

  const navGroups: { section?: string; items: NavItem[] }[] = [
    {
      items: [
        {
          label: 'Dashboard',
          href: '/dashboard',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
      ],
    },
    {
      section: 'TỔNG QUAN & BẢN QUYỀN',
      items: [
        {
          label: 'Licenses',
          icon: <Key className="w-4 h-4" />,
          children: [
            { label: 'License Keys', href: '/licenses' },
            { label: 'Gói Bản Quyền (Plans)', href: '/licenses/plans' },
            { label: 'Mã Giảm Giá (Coupons)', href: '/licenses/coupons' },
          ],
        },
      ],
    },
    {
      section: 'NGƯỜI DÙNG & DỮ LIỆU',
      items: [
        {
          label: 'Quản Lý User',
          icon: <Users className="w-4 h-4" />,
          children: [
            { label: 'Chủ Sở Hữu (Owners)', href: '/users' },
            { label: 'Nhân Viên (Workers)', href: '/users/workers' },
          ],
        },
        {
          label: 'Cloud Profiles',
          href: '/profiles',
          icon: <FolderGit2 className="w-4 h-4" />,
        },
      ],
    },
    {
      section: 'HỆ THỐNG & QUẢN TRỊ',
      items: [
        {
          label: 'Phiên Bản App (Releases)',
          href: '/releases',
          icon: <DownloadCloud className="w-4 h-4" />,
        },
        {
          label: 'Audit & Security',
          href: '/audit',
          icon: <ShieldCheck className="w-4 h-4" />,
        },
        {
          label: 'Thông Báo App',
          href: '/communication',
          icon: <Megaphone className="w-4 h-4" />,
        },
        {
          label: 'Cài Đặt Hệ Thống',
          icon: <Settings className="w-4 h-4" />,
          children: [
            { label: 'System Config', href: '/settings' },
            { label: 'Feature Flags', href: '/settings/feature-flags' },
            { label: 'Tài Khoản Admin', href: '/settings/admins' },
          ],
        },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-[#0a202a] border-r border-[#194354] flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-[#194354] bg-[#07151c]">
        <ShardLogo size={30} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-base tracking-wider brand-gradient-text">CLOGIN</span>
            <span className="text-xs font-semibold text-[#00f0ff] px-1.5 py-0.5 rounded bg-[#00f0ff]/10 border border-[#00f0ff]/30">
              PORTAL
            </span>
          </div>
          <p className="text-[11px] text-[#6b9eb3] font-medium">Antidetect Studio Admin</p>
        </div>
      </div>

      {/* Nav list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {group.section && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-[#487385] mb-2">
                {group.section}
              </p>
            )}
            {group.items.map((item, itemIdx) => {
              if (item.children) {
                const isOpen = openGroups[item.label];
                const isGroupActive = item.children.some((child) => pathname === child.href);

                return (
                  <div key={itemIdx} className="space-y-1">
                    <button
                      onClick={() => toggleGroup(item.label)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer',
                        isGroupActive
                          ? 'text-[#00f0ff] bg-[#00f0ff]/10 border-l-2 border-[#00f0ff]'
                          : 'text-[#b0d5e3] hover:text-white hover:bg-[#112b38]'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={cn(isGroupActive ? 'text-[#00f0ff]' : 'text-[#6b9eb3]')}>
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#6b9eb3]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#6b9eb3]" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="pl-6 space-y-1 border-l border-[#194354] ml-4 py-1">
                        {item.children.map((child, childIdx) => {
                          const isActive = pathname === child.href;
                          return (
                            <Link
                              key={childIdx}
                              href={child.href}
                              className={cn(
                                'block px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                                isActive
                                  ? 'text-[#00f0ff] font-bold bg-[#00f0ff]/15 border-l-2 border-[#00f0ff]'
                                  : 'text-[#6b9eb3] hover:text-[#b0d5e3] hover:bg-[#112b38]/60'
                              )}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const isActive = pathname === item.href;
              return (
                <Link
                  key={itemIdx}
                  href={item.href!}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all',
                    isActive
                      ? 'bg-gradient-to-r from-[#00f0ff] to-[#0088ff] text-[#05161e] font-bold shadow-md shadow-[#00f0ff]/20'
                      : 'text-[#b0d5e3] hover:text-white hover:bg-[#112b38]'
                  )}
                >
                  <span className={cn(isActive ? 'text-[#05161e]' : 'text-[#6b9eb3]')}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-3.5 border-t border-[#194354] bg-[#07151c] text-[11px] text-[#6b9eb3] flex items-center justify-between">
        <span>Clogin Studio Admin v2.4</span>
        <span className="flex items-center gap-1.5 text-[#00ffb7] font-semibold">
          <span className="w-2 h-2 rounded-full bg-[#00ffb7] animate-pulse shadow-sm shadow-[#00ffb7]" /> Live
        </span>
      </div>
    </aside>
  );
};
