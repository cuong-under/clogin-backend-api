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
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
      section: 'Quản lý bản quyền',
      items: [
        {
          label: 'Licenses',
          icon: <Key className="w-4 h-4" />,
          children: [
            { label: 'License Keys', href: '/licenses' },
            { label: 'Plans', href: '/licenses/plans' },
            { label: 'Coupons', href: '/licenses/coupons' },
          ],
        },
      ],
    },
    {
      section: 'Người dùng & Hồ sơ',
      items: [
        {
          label: 'Users',
          icon: <Users className="w-4 h-4" />,
          children: [
            { label: 'Owners', href: '/users' },
            { label: 'Workers', href: '/users/workers' },
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
      section: 'Hệ thống & Truyền thông',
      items: [
        {
          label: 'Releases',
          href: '/releases',
          icon: <DownloadCloud className="w-4 h-4" />,
        },
        {
          label: 'Audit & Security',
          href: '/audit',
          icon: <ShieldCheck className="w-4 h-4" />,
        },
        {
          label: 'Communication',
          href: '/communication',
          icon: <Megaphone className="w-4 h-4" />,
        },
        {
          label: 'Settings',
          icon: <Settings className="w-4 h-4" />,
          children: [
            { label: 'System Config', href: '/settings' },
            { label: 'Feature Flags', href: '/settings/feature-flags' },
            { label: 'Admin Users', href: '/settings/admins' },
          ],
        },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-sky-400 flex items-center justify-center font-bold text-slate-950 text-base shadow-sm shadow-sky-400/20">
          C
        </div>
        <div>
          <h1 className="font-bold text-slate-100 text-sm tracking-wide">Clogin Studio</h1>
          <p className="text-[10px] text-sky-400 font-semibold tracking-wider uppercase">Admin Portal</p>
        </div>
      </div>

      {/* Nav list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {group.section && (
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
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
                        'w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer',
                        isGroupActive
                          ? 'text-sky-400 bg-sky-500/10'
                          : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="pl-8 space-y-1 border-l border-slate-800 ml-5 py-1">
                        {item.children.map((child, childIdx) => {
                          const isActive = pathname === child.href;
                          return (
                            <Link
                              key={childIdx}
                              href={child.href}
                              className={cn(
                                'block px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                                isActive
                                  ? 'text-sky-400 font-semibold bg-sky-500/10'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
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
                    'flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-sky-400 text-slate-950 font-semibold shadow-sm shadow-sky-400/20'
                      : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-500 flex items-center justify-between">
        <span>v1.0.0-admin</span>
        <span className="flex items-center gap-1 text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live
        </span>
      </div>
    </aside>
  );
};
