import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Power, Trash2, Workflow } from 'lucide-react';
import { useState } from 'react';

import RuleModal from '../components/RuleModal';
import { api } from '../lib/api';

function formatCondition(c: any): string {
  if (c.type === 'device_state') {
    const op = c.operator === 'neq' ? '≠' : c.operator === 'gt' ? '>' : c.operator === 'lt' ? '<' : '=';
    return `${c.deviceName ?? c.deviceId} · ${c.statusCode} ${op} ${JSON.stringify(c.value)}`;
  }
  if (c.type === 'time') {
    const opLabel = c.operator === 'gt' ? 'after' : c.operator === 'lt' ? 'before' : 'at';
    return `Time ${opLabel} ${c.timeValue}`;
  }
  if (c.type === 'sun') {
    const opLabel = c.operator === 'gt' ? 'after' : c.operator === 'lt' ? 'before' : 'at';
    const sign = (c.sunOffsetMin ?? 0) >= 0 ? '+' : '';
    const off = c.sunOffsetMin ? ` ${sign}${c.sunOffsetMin}min` : '';
    return `${opLabel} ${c.sunEvent === 'sunrise' ? 'Sunrise' : 'Sunset'}${off}`;
  }
  return c.type;
}

function formatAction(a: any): string {
  if (a.type === 'countdown') return `${a.deviceName ?? a.deviceId} — on for ${a.minutes}min`;
  if (a.type === 'notification') return `Notify — ${a.value || 'automation triggered'}`;
  return `${a.deviceName ?? a.deviceId} · ${a.statusCode} = ${JSON.stringify(a.value)}`;
}

export default function AutomationsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: () => api.get('/automations').then((r) => r.data),
  });

  const { data: location } = useQuery({
    queryKey: ['automations', 'location'],
    queryFn: () => api.get('/automations/location').then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/automations/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/automations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });

  const hasLocation = location?.latitude != null && location?.longitude != null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Automations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Rules that run automatically based on device state, time, or sun events
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 transition-colors"
        >
          <Plus size={14} />
          Add Rule
        </button>
      </div>

      {/* Location hint */}
      {!hasLocation && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
          <MapPin size={16} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Set your location in{' '}
            <button onClick={() => setEditing('location')} className="underline font-medium">
              Location Settings
            </button>{' '}
            to use sunrise/sunset conditions.
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && rules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
            <Workflow size={24} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
            No automations yet
          </h3>
          <p className="text-sm text-slate-400 max-w-xs">
            Create rules to automatically control your devices based on conditions.
          </p>
        </div>
      )}

      {/* Rules list */}
      {!isLoading && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule: any) => (
            <div
              key={rule.id}
              className={`bg-white dark:bg-[#1A222C] border rounded-lg p-4 transition-opacity ${
                rule.enabled
                  ? 'border-slate-200 dark:border-white/10'
                  : 'border-slate-100 dark:border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? 'bg-green-500' : 'bg-slate-300'}`}
                    />
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {rule.name}
                    </h3>
                  </div>

                  {/* Conditions */}
                  {rule.conditions.length > 0 && (
                    <div className="mb-1.5">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                        When
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.conditions.map((c: any, i: number) => (
                          <span key={c.id} className="flex items-center gap-1">
                            <span className="text-xs bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                              {formatCondition(c)}
                            </span>
                            {i < rule.conditions.length - 1 && (
                              <span className="text-[10px] font-bold text-brand">
                                {c.nextOperator}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {rule.actions.length > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                        Then
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.actions.map((a: any) => (
                          <span
                            key={a.id}
                            className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded"
                          >
                            {formatAction(a)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleMutation.mutate(rule.id)}
                    className={`p-1.5 rounded-md transition-colors ${
                      rule.enabled
                        ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-500/10'
                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                    title={rule.enabled ? 'Disable' : 'Enable'}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => setEditing(rule)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-xs font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(rule.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Location settings panel */}
      {editing === 'location' && (
        <LocationModal onClose={() => setEditing(null)} current={location} />
      )}

      {/* Rule modal */}
      {(creating || (editing && editing !== 'location')) && (
        <RuleModal
          rule={editing && editing !== 'location' ? editing : undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function LocationModal({ onClose, current }: { onClose: () => void; current: any }) {
  const qc = useQueryClient();
  const [tz, setTz] = useState(current?.timezone ?? '');
  const [lat, setLat] = useState(current?.latitude?.toString() ?? '');
  const [lng, setLng] = useState(current?.longitude?.toString() ?? '');

  const mutation = useMutation({
    mutationFn: (data: any) => api.patch('/automations/location', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations', 'location'] });
      onClose();
    },
  });

  const handleGeo = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A222C] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Location Settings
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Timezone (IANA)</label>
            <input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="Europe/Athens"
              className="w-full text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-slate-800 dark:text-slate-100 outline-none focus:border-brand"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Latitude</label>
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="37.9838"
                className="w-full text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-slate-800 dark:text-slate-100 outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Longitude</label>
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="23.7275"
                className="w-full text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-slate-800 dark:text-slate-100 outline-none focus:border-brand"
              />
            </div>
          </div>
          <button
            onClick={handleGeo}
            className="flex items-center gap-2 text-xs text-brand hover:underline"
          >
            <MapPin size={12} /> Use my current location
          </button>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              mutation.mutate({
                timezone: tz || undefined,
                latitude: lat ? parseFloat(lat) : undefined,
                longitude: lng ? parseFloat(lng) : undefined,
              })
            }
            className="flex-1 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
