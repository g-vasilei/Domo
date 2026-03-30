import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BatteryLow,
  Bell,
  Home,
  LogOut,
  Menu,
  Moon,
  Radio,
  Settings,
  Shield,
  ShieldAlert,
  ShieldOff,
  Sun,
  User,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { AlarmState } from '../store/alarm.store';
import { useAuthStore } from '../store/auth.store';
import { AppNotification, NotifKind, useNotificationsStore } from '../store/notifications.store';
import { useThemeStore } from '../store/theme.store';

interface Props {
  onMenuClick: () => void;
}

const ALARM_ICON: Partial<Record<AlarmState, any>> = {
  TRIGGERED: ShieldAlert,
  ARMED_HOME: Home,
  ARMED_AWAY: Shield,
  DISARMED: ShieldOff,
  ENTRY_DELAY: ShieldAlert,
};

const ALARM_COLOR: Partial<Record<AlarmState, string>> = {
  TRIGGERED: 'text-red-500',
  ARMED_HOME: 'text-emerald-500',
  ARMED_AWAY: 'text-blue-500',
  DISARMED: 'text-slate-400',
  ENTRY_DELAY: 'text-amber-500',
};

const KIND_ICON: Record<NotifKind, any> = {
  alarm: Shield,
  device: Radio,
  battery: BatteryLow,
  automation: Workflow,
};

const KIND_COLOR: Record<NotifKind, string> = {
  alarm: 'text-blue-500',
  device: 'text-slate-500',
  battery: 'text-amber-500',
  automation: 'text-brand',
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString();
}

function NotificationItem({ n }: { n: AppNotification }) {
  const Icon =
    n.kind === 'alarm' && n.state ? (ALARM_ICON[n.state] ?? KIND_ICON[n.kind]) : KIND_ICON[n.kind];
  const color =
    n.kind === 'alarm' && n.state
      ? (ALARM_COLOR[n.state] ?? KIND_COLOR[n.kind])
      : KIND_COLOR[n.kind];
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 ${!n.read ? 'bg-brand/5' : ''} hover:bg-slate-50 dark:hover:bg-white/5 transition-colors`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${!n.read ? 'bg-brand/10' : 'bg-slate-100 dark:bg-white/5'}`}
      >
        <Icon size={13} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">
          {n.title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
      </div>
      <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
        {timeAgo(n.at)}
      </span>
    </div>
  );
}

function NotificationCenter() {
  const { items, unread, markAllRead, clear } = useNotificationsStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle() {
    setOpen((o) => {
      if (!o && unread > 0) markAllRead();
      return !o;
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-brand rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#1A222C] rounded-md border border-slate-200 dark:border-white/10 shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/10">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Notifications
            </p>
            {items.length > 0 && (
              <button
                onClick={clear}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
            {items.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={20} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400">No notifications yet</p>
                <p className="text-xs text-slate-400 mt-0.5">Alarm events will appear here</p>
              </div>
            ) : (
              items.map((n) => <NotificationItem key={n.id} n={n} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header({ onMenuClick }: Props) {
  const { dark, toggle } = useThemeStore();
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const clearNotifications = useNotificationsStore((s) => s.clear);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 60_000,
  });

  return (
    <header className="sticky top-0 z-10 bg-white dark:bg-[#1A222C] border-b border-slate-200 dark:border-white/10 h-[70px] flex items-center px-4 md:px-6 gap-4">
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 transition-colors"
          title="Toggle dark mode"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <NotificationCenter />

        <div className="relative">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-xs font-semibold">
              {me?.email?.[0]?.toUpperCase() ?? <User size={14} />}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-none">
                {me?.email?.split('@')[0] ?? '...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{me?.role ?? ''}</p>
            </div>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-[#1A222C] rounded-md border border-slate-200 dark:border-white/10 shadow-lg py-1 z-50">
              <button
                onClick={() => {
                  navigate('/settings');
                  setDropdownOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <Settings size={15} />
                Settings
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-white/10" />
              <button
                onClick={() => {
                  queryClient.clear();
                  clearNotifications();
                  clear();
                  setDropdownOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
