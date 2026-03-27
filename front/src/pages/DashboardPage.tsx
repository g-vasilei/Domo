import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import {
  Cpu,
  GripVertical,
  Home,
  LayoutDashboard,
  Plus,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldOff,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useState } from 'react';

import ArmControls from '../components/ArmControls';
import DeviceCard from '../components/DeviceCard';
import { api } from '../lib/api';
import { useAlarmStore } from '../store/alarm.store';

// ── Widget persistence ──────────────────────────────────────────────────────

const STORAGE_KEY = 'dashboard_widgets_v2';

function loadWidgetIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveWidgetIds(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

// ── Stat card ───────────────────────────────────────────────────────────────

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

// ── Alarm meta ──────────────────────────────────────────────────────────────

const ALARM_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  DISARMED: { label: 'Disarmed', icon: ShieldOff, color: 'text-slate-400', bg: 'bg-slate-100 dark:bg-white/5' },
  ARMED_HOME: { label: 'Armed — Home', icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  ARMED_AWAY: { label: 'Armed — Away', icon: Shield, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  EXIT_DELAY: { label: 'Exit Delay…', icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  ENTRY_DELAY: { label: 'Entry Delay…', icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  TRIGGERED: { label: 'TRIGGERED', icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
};

// ── Sortable widget wrapper ─────────────────────────────────────────────────

function SortableWidget({ id, device, onRemove }: { id: string; device: any; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative group/widget ${isDragging ? 'opacity-50 z-50' : ''}`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 p-1 rounded cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 opacity-0 group-hover/widget:opacity-100 transition-opacity"
      >
        <GripVertical size={14} />
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 z-10 p-1 rounded-full bg-red-50 dark:bg-red-500/10 text-red-400 hover:text-red-600 opacity-0 group-hover/widget:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>

      <DeviceCard device={device} />
    </div>
  );
}

// ── Device picker modal ─────────────────────────────────────────────────────

function DevicePickerModal({
  devices,
  selectedIds,
  onToggle,
  onClose,
}: {
  devices: any[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = devices.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#1A222C] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Add widgets</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-slate-100 dark:border-white/10">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices…"
            autoFocus
            className="w-full text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-brand"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.map((d) => {
            const isAdded = selectedIds.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() => onToggle(d.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
              >
                <span
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isAdded
                      ? 'bg-brand border-brand'
                      : 'border-slate-300 dark:border-white/20'
                  }`}
                >
                  {isAdded && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-white fill-current">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">{d.name}</span>
                  <span className="block text-xs text-slate-400">{d.online ? 'Online' : 'Offline'}</span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No devices found</p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-white/10">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [widgetIds, setWidgetIds] = useState<string[]>(loadWidgetIds);
  const [editing, setEditing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const { data: devices = [], isLoading, error } = useQuery({
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

  const online = (devices as any[]).filter((d) => d.online).length;
  const offline = (devices as any[]).filter((d) => !d.online).length;
  const roomCount = (rooms as any[]).filter((r: any) => r.id !== 'unassigned').length;
  const errorMessage = (error as any)?.response?.data?.message ?? 'An unexpected error occurred.';

  // Keep only IDs that still exist in the device list
  const validIds = widgetIds.filter((id) => (devices as any[]).some((d) => d.id === id));
  const widgetDevices = validIds.map((id) => (devices as any[]).find((d) => d.id === id)).filter(Boolean);

  function persist(ids: string[]) {
    setWidgetIds(ids);
    saveWidgetIds(ids);
  }

  function toggleDevice(id: string) {
    const next = widgetIds.includes(id)
      ? widgetIds.filter((x) => x !== id)
      : [...widgetIds, id];
    persist(next);
  }

  function removeWidget(id: string) {
    persist(widgetIds.filter((x) => x !== id));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = validIds.indexOf(active.id as string);
    const newIndex = validIds.indexOf(over.id as string);
    persist(arrayMove(validIds, oldIndex, newIndex));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Overview of your smart home</p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
            editing
              ? 'bg-brand text-white border-brand'
              : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-brand hover:text-brand'
          }`}
        >
          <Settings2 size={13} />
          {editing ? 'Done' : 'Customize'}
        </button>
      </div>

      {/* Alarm banner */}
      <div className={`flex items-center justify-between flex-wrap gap-4 rounded-sm border px-6 py-4 ${meta.bg} border-transparent`}>
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${meta.bg}`}>
            <AlarmIcon size={22} className={meta.color} />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">Alarm System</p>
            <p className={`text-lg font-bold ${meta.color}`}>{meta.label}</p>
          </div>
        </div>
        <ArmControls currentState={alarmState} hasPinSet={hasPinSet} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Cpu} label="Total Devices" value={(devices as any[]).length} color="bg-brand/10 text-brand" />
        <StatCard icon={Wifi} label="Online" value={online} color="bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10" />
        <StatCard icon={WifiOff} label="Offline" value={offline} color="bg-red-50 text-red-400 dark:bg-red-500/10" />
        <StatCard icon={Home} label="Rooms" value={roomCount} color="bg-violet-50 text-violet-500 dark:bg-violet-500/10" />
      </div>

      {/* Error */}
      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <WifiOff size={28} className="text-red-400 mb-3" />
          <p className="text-sm text-red-400">{errorMessage}</p>
        </div>
      )}

      {/* Widgets section */}
      {!error && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              My Widgets
              {widgetDevices.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">{widgetDevices.length} device{widgetDevices.length !== 1 ? 's' : ''}</span>
              )}
            </h2>
            {editing && (
              <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <Plus size={12} /> Add device
              </button>
            )}
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl h-[140px] animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && widgetDevices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
                <LayoutDashboard size={20} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">No widgets yet</p>
              <p className="text-xs text-slate-400 mb-4">Add your favourite devices for quick access</p>
              <button
                onClick={() => { setEditing(true); setShowPicker(true); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 transition-colors"
              >
                <Plus size={12} /> Add device
              </button>
            </div>
          )}

          {!isLoading && widgetDevices.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={validIds} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {widgetDevices.map((device) =>
                    editing ? (
                      <SortableWidget
                        key={device.id}
                        id={device.id}
                        device={device}
                        onRemove={() => removeWidget(device.id)}
                      />
                    ) : (
                      <DeviceCard key={device.id} device={device} />
                    ),
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {showPicker && (
        <DevicePickerModal
          devices={devices as any[]}
          selectedIds={widgetIds}
          onToggle={toggleDevice}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
