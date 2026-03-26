import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Cpu, GripVertical, Home, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import DeviceCard from '../components/DeviceCard';
import { api } from '../lib/api';

const STORAGE_KEY = 'devices_order';

function loadOrder(): { rooms: string[]; devices: Record<string, string[]> } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return { rooms: [], devices: {} };
  }
}

function saveOrder(order: { rooms: string[]; devices: Record<string, string[]> }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

function applyOrder(
  rooms: any[],
  order: { rooms: string[]; devices: Record<string, string[]> },
): any[] {
  const sorted = [...rooms];
  if (order.rooms?.length) {
    sorted.sort((a, b) => {
      const ai = order.rooms.indexOf(a.id);
      const bi = order.rooms.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }
  return sorted.map((room) => {
    const devOrder = order.devices?.[room.id];
    if (!devOrder?.length) return room;
    const devSorted = [...room.devices].sort((a, b) => {
      const ai = devOrder.indexOf(a.id);
      const bi = devOrder.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return { ...room, devices: devSorted };
  });
}

// Sortable device wrapper
function SortableDevice({ device, rearranging }: { device: any; rearranging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: device.id,
    disabled: !rearranging,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }}
      className="relative"
    >
      {rearranging && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 right-2 z-10 p-1 rounded cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <GripVertical size={14} />
        </div>
      )}
      <DeviceCard device={device} />
    </div>
  );
}

function RoomSection({
  room,
  rearranging,
  roomDragHandleProps,
}: {
  room: any;
  rearranging: boolean;
  roomDragHandleProps?: any;
}) {
  const online = room.devices.filter((d: any) => d.online).length;

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        {rearranging && (
          <div
            {...roomDragHandleProps}
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0"
          >
            <GripVertical size={16} />
          </div>
        )}
        <div className="w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Home size={14} className="text-brand" />
        </div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{room.name}</h2>
        <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
        <span className="text-xs text-slate-400">
          {online}/{room.devices.length} online
        </span>
      </div>

      <SortableContext items={room.devices.map((d: any) => d.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {room.devices.length === 0 ? (
            <div className="col-span-full py-8 text-center">
              <p className="text-sm text-slate-400">No devices in this room.</p>
            </div>
          ) : (
            room.devices.map((device: any) => (
              <SortableDevice key={device.id} device={device} rearranging={rearranging} />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableRoomSection({ room, rearranging }: { room: any; rearranging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `room__${room.id}`,
    disabled: !rearranging,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <RoomSection
        room={room}
        rearranging={rearranging}
        roomDragHandleProps={rearranging ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

export default function DevicesPage() {
  const {
    data: rawRooms = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get('/devices/rooms').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const [rearranging, setRearranging] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const [order, setOrder] = useState(loadOrder);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync fetched rooms into local state with saved order applied
  useEffect(() => {
    if (rawRooms.length) setRooms(applyOrder(rawRooms, order));
  }, [rawRooms]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = e;
      if (!over || active.id === over.id) return;

      const activeStr = String(active.id);
      const overStr = String(over.id);

      setRooms((prev) => {
        // Room drag (ids prefixed with "room__")
        if (activeStr.startsWith('room__') && overStr.startsWith('room__')) {
          const activeRoomId = activeStr.replace('room__', '');
          const overRoomId = overStr.replace('room__', '');
          const oldIdx = prev.findIndex((r) => r.id === activeRoomId);
          const newIdx = prev.findIndex((r) => r.id === overRoomId);
          const next = arrayMove(prev, oldIdx, newIdx);
          const newOrder = { ...order, rooms: next.map((r) => r.id) };
          setOrder(newOrder);
          saveOrder(newOrder);
          return next;
        }

        // Device drag — find which room contains the active device
        const roomIdx = prev.findIndex((r) => r.devices.some((d: any) => d.id === activeStr));
        if (roomIdx === -1) return prev;
        const room = prev[roomIdx];
        const oldDevIdx = room.devices.findIndex((d: any) => d.id === activeStr);
        const newDevIdx = room.devices.findIndex((d: any) => d.id === overStr);
        if (newDevIdx === -1) return prev;

        const newDevices = arrayMove(room.devices, oldDevIdx, newDevIdx);
        const next = prev.map((r, i) => (i === roomIdx ? { ...r, devices: newDevices } : r));
        const newOrder = {
          ...order,
          devices: { ...order.devices, [room.id]: newDevices.map((d: any) => d.id) },
        };
        setOrder(newOrder);
        saveOrder(newOrder);
        return next;
      });
    },
    [order],
  );

  const errorMessage = (error as any)?.response?.data?.message ?? 'Failed to load devices.';

  // Active dragged device (for overlay)
  const activeDraggingDevice =
    activeId && !activeId.startsWith('room__')
      ? rooms.flatMap((r) => r.devices).find((d: any) => d.id === activeId)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Devices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            All devices grouped by room
          </p>
        </div>
        {!isLoading && !error && rooms.length > 0 && (
          <button
            onClick={() => setRearranging((v) => !v)}
            className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors ${
              rearranging
                ? 'bg-brand text-white border-brand'
                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <ArrowLeftRight size={14} />
            {rearranging ? 'Done' : 'Rearrange'}
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-5 w-32 bg-slate-200 dark:bg-white/10 rounded animate-pulse mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(3)].map((_, j) => (
                  <div
                    key={j}
                    className="h-40 bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm animate-pulse"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
            <WifiOff size={24} className="text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Could not load devices
          </h3>
          <p className="text-sm text-red-400 max-w-sm">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !error && rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
            <Cpu size={24} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
            No devices found
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            Add devices via the Smart Life app and assign them to rooms.
          </p>
        </div>
      )}

      {!isLoading && !error && rooms.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rooms.map((r) => `room__${r.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {rooms.map((room) => (
                <SortableRoomSection key={room.id} room={room} rearranging={rearranging} />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeDraggingDevice && (
              <div className="opacity-90 rotate-1 scale-105 shadow-xl">
                <DeviceCard device={activeDraggingDevice} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
