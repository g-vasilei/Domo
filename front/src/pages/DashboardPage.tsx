import { useQuery } from '@tanstack/react-query';
import { Cpu, Wifi, WifiOff, Home, Shield, ShieldOff, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useAlarmStore } from '../store/alarm.store';
import ArmControls from '../components/ArmControls';

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

const ALARM_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  DISARMED: {
    label: 'Disarmed',
    icon: ShieldOff,
    color: 'text-slate-400',
    bg: 'bg-slate-100 dark:bg-white/5',
  },
  ARMED_HOME: {
    label: 'Armed — Home',
    icon: Shield,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
  },
  ARMED_AWAY: {
    label: 'Armed — Away',
    icon: Shield,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
  },
  EXIT_DELAY: {
    label: 'Exit Delay…',
    icon: ShieldAlert,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
  },
  ENTRY_DELAY: {
    label: 'Entry Delay…',
    icon: ShieldAlert,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
  },
  TRIGGERED: {
    label: 'TRIGGERED',
    icon: ShieldAlert,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-500/10',
  },
};

export default function DashboardPage() {
  const {
    data: devices = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get('/devices/rooms').then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: alarmData } = useQuery({
    queryKey: ['alarm'],
    queryFn: () => api.get('/alarm').then((r) => r.data),
    staleTime: 30_000,
  });
  const alarmSettings = useAlarmStore((s) => s.settings);
  const alarmState = alarmSettings?.state ?? 'DISARMED';
  const hasPinSet = !!alarmData?.pinHash;
  const meta = ALARM_META[alarmState] ?? ALARM_META.DISARMED;
  const AlarmIcon = meta.icon;

  const online = devices.filter((d: any) => d.online).length;
  const offline = devices.filter((d: any) => !d.online).length;
  const roomCount = (rooms as any[]).filter((r: any) => r.id !== 'unassigned').length;
  const errorMessage = (error as any)?.response?.data?.message ?? 'An unexpected error occurred.';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Overview of your smart home
        </p>
      </div>

      {/* Alarm state banner + controls */}
      <div
        className={`flex items-center justify-between flex-wrap gap-4 rounded-sm border px-6 py-4 ${meta.bg} border-transparent`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${meta.bg}`}>
            <AlarmIcon size={22} className={meta.color} />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Alarm System
            </p>
            <p className={`text-lg font-bold ${meta.color}`}>{meta.label}</p>
          </div>
        </div>
        <ArmControls currentState={alarmState} hasPinSet={hasPinSet} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Cpu}
          label="Total Devices"
          value={devices.length}
          color="bg-brand/10 text-brand"
        />
        <StatCard
          icon={Wifi}
          label="Online"
          value={online}
          color="bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10"
        />
        <StatCard
          icon={WifiOff}
          label="Offline"
          value={offline}
          color="bg-red-50 text-red-400 dark:bg-red-500/10"
        />
        <StatCard
          icon={Home}
          label="Rooms"
          value={roomCount}
          color="bg-violet-50 text-violet-500 dark:bg-violet-500/10"
        />
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-5 h-[80px] animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <WifiOff size={28} className="text-red-400 mb-3" />
          <p className="text-sm text-red-400">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !error && devices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Cpu size={28} className="text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">
            No devices found. Add devices via the Smart Life app.
          </p>
        </div>
      )}
    </div>
  );
}
