import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Mail, Check, ChevronDown, ChevronUp, Clock, X } from 'lucide-react';
import { api } from '../lib/api';

interface Permission {
  canViewDevices: boolean;
  canControlDevices: boolean;
  canCreateSchedules: boolean;
  canManageMembers: boolean;
  canArmAlarm: boolean;
  canSetAlarmPin: boolean;
  allowedDeviceIds: string[];
}

interface Member {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  permissions: Permission | null;
}

interface Invitation {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

const PERMISSIONS: { key: keyof Permission; label: string; description: string }[] = [
  { key: 'canViewDevices',     label: 'View devices',    description: 'See the device list and status' },
  { key: 'canControlDevices',  label: 'Control devices', description: 'Send commands to devices' },
  { key: 'canArmAlarm',        label: 'Arm / Disarm',    description: 'Operate the alarm system' },
  { key: 'canSetAlarmPin',     label: 'Set alarm PIN',   description: 'Create or change their own PIN' },
  { key: 'canCreateSchedules', label: 'Schedules',       description: 'Create automation schedules' },
  { key: 'canManageMembers',   label: 'Manage members',  description: 'Invite and remove members' },
];

function PermissionToggle({
  value,
  onChange,
  label,
  description,
}: { value: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-sm text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-brand' : 'bg-slate-200 dark:bg-white/10'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );
}

function MemberCard({ member, onDelete }: { member: Member; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const updatePerm = useMutation({
    mutationFn: (patch: Partial<Permission>) =>
      api.put(`/users/members/${member.id}/permissions`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  });

  const perms = member.permissions;

  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm">
      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 text-brand font-semibold text-sm">
          {member.email[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{member.email}</p>
          <p className="text-xs text-slate-400">
            Member · Joined {new Date(member.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((o) => !o)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Permissions */}
      {expanded && perms && (
        <div className="px-4 pb-4 border-t border-slate-200 dark:border-white/10 pt-3">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Permissions</p>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {PERMISSIONS.map(({ key, label, description }) => (
              <PermissionToggle
                key={key}
                label={label}
                description={description}
                value={!!(perms as any)[key]}
                onChange={(v) => updatePerm.mutate({ [key]: v })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MembersPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ['members'],
    queryFn: () => api.get('/users/members').then((r) => r.data),
  });

  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['invitations'],
    queryFn: () => api.get('/users/invitations').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const invite = useMutation({
    mutationFn: (e: string) => api.post('/users/members/invite', { email: e }),
    onSuccess: () => {
      setInviteSent(true);
      setEmail('');
      setInviteError('');
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setTimeout(() => setInviteSent(false), 3000);
    },
    onError: (e: any) => setInviteError(e?.response?.data?.message ?? 'Failed to send invitation'),
  });

  const deleteMember = useMutation({
    mutationFn: (id: string) => api.delete(`/users/members/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  });

  const revokeInvitation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/invitations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Members</h1>

      {/* Invite */}
      <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-widest">Invite Member</h2>
          <p className="text-xs text-slate-400 mt-1">They'll receive an email to set up their account.</p>
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setInviteError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && email && invite.mutate(email)}
            className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand"
          />
          <button
            onClick={() => email && invite.mutate(email)}
            disabled={!email || invite.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-40 hover:bg-brand/90 transition-colors"
          >
            {inviteSent ? <><Check size={14} /> Sent</> : <><UserPlus size={14} /> Invite</>}
          </button>
        </div>

        {inviteError && <p className="text-red-500 text-xs">{inviteError}</p>}

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
            <p className="text-xs text-slate-400 uppercase tracking-widest">Pending invitations</p>
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Mail size={13} className="flex-shrink-0" />
                <span className="flex-1 truncate">{inv.email}</span>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={11} />
                  expires {new Date(inv.expiresAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => revokeInvitation.mutate(inv.id)}
                  disabled={revokeInvitation.isPending}
                  className="p-0.5 text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                  title="Revoke invitation"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Member list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
            Active Members
          </h2>
          <span className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</span>
        </div>

        {members.length === 0 ? (
          <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-8 text-center text-slate-400">
            <UserPlus size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No members yet. Invite someone above.</p>
          </div>
        ) : (
          members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              onDelete={() => deleteMember.mutate(m.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
