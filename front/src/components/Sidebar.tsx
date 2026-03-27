import { useQuery } from '@tanstack/react-query';
import { Cpu, LayoutDashboard, Monitor, ShieldAlert, Users, Workflow, X, Zap } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { api } from '../lib/api';

declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 60_000,
  });

  const isOwner = me?.role === 'OWNER';
  const canSeeAlarm = isOwner || me?.permissions?.canArmAlarm;
  const canSeeAutomations = isOwner || me?.permissions?.canManageAutomations;

  const nav = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', show: true },
    { to: '/devices', icon: Cpu, label: 'Devices', show: true },
    { to: '/automations', icon: Workflow, label: 'Automations', show: canSeeAutomations },
    { to: '/alarm', icon: ShieldAlert, label: 'Alarm', show: canSeeAlarm },
    { to: '/members', icon: Users, label: 'Members', show: isOwner },
    { to: '/panel', icon: Monitor, label: 'Panel Mode', show: true },
  ].filter((item) => item.show);

  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={onClose} />}

      <aside
        className={`
          fixed top-0 left-0 z-30 h-screen w-[280px] bg-sidebar flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:z-auto
        `}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center">
              <img src="/logo/Domo.png" width={24} alt="Logo image" />
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">{__APP_NAME__}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white md:hidden">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-3">
            Main Menu
          </p>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand text-white'
                    : 'text-slate-400 hover:bg-sidebar-hover hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-5 border-t border-white/10">
          <p className="text-[11px] text-slate-500 text-center">
            {__APP_NAME__} v{__APP_VERSION__}
          </p>
        </div>
      </aside>
    </>
  );
}
