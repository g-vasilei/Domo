import { useQuery } from '@tanstack/react-query';
import { Home, RefreshCw, WifiOff } from 'lucide-react';

import DeviceCard from '../components/DeviceCard';
import { api } from '../lib/api';

function EmptyRoom() {
  return (
    <div className="col-span-full py-8 text-center">
      <p className="text-sm text-slate-400">No devices in this room.</p>
    </div>
  );
}

function RoomSection({ room }: { room: { id: string; name: string; devices: any[] } }) {
  const online = room.devices.filter((d) => d.online).length;

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Home size={14} className="text-brand" />
        </div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{room.name}</h2>
        <div className="flex-1 h-px bg-stroke dark:bg-white/10" />
        <span className="text-xs text-slate-400">
          {online}/{room.devices.length} online
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {room.devices.length === 0 ? (
          <EmptyRoom />
        ) : (
          room.devices.map((device) => <DeviceCard key={device.id} device={device} />)
        )}
      </div>
    </section>
  );
}

export default function RoomsPage() {
  const {
    data: rooms = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get('/devices/rooms').then((r) => r.data),
  });

  const errorMessage = (error as any)?.response?.data?.message ?? 'Failed to load rooms.';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Rooms</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Devices grouped by room
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
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
            Could not load rooms
          </h3>
          <p className="text-sm text-red-400 max-w-sm">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !error && rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
            <Home size={24} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
            No rooms found
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            Create rooms in the Smart Life app and assign devices to them.
          </p>
        </div>
      )}

      {!isLoading && !error && rooms.map((room: any) => <RoomSection key={room.id} room={room} />)}
    </div>
  );
}
