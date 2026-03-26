import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, EyeOff, Zap } from 'lucide-react';
import { useState } from 'react';
import { useNavigate,useSearchParams } from 'react-router-dom';

import { useAuthStore } from '../store/auth.store';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const setTokens = useAuthStore((s) => s.setTokens);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');

  const accept = useMutation({
    mutationFn: () =>
      axios.post('/api/invitations/accept', { token, password }).then((r) => r.data),
    onSuccess: async (data) => {
      // Auto-login after account creation
      try {
        const res = await axios.post('/api/auth/login', {
          email: data.email,
          password,
        });
        setTokens(res.data.accessToken, res.data.refreshToken);
        navigate('/', { replace: true });
      } catch {
        navigate('/login', { replace: true });
      }
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to accept invitation'),
  });

  const valid = token && password.length >= 8 && password === confirm;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError('');
    accept.mutate();
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#111827]">
        <p className="text-slate-500">Invalid invitation link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#111827] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">SmartHome</span>
        </div>

        <div className="bg-white dark:bg-[#1A222C] rounded-sm border border-slate-200 dark:border-white/10 p-8">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
            Accept Invitation
          </h1>
          <p className="text-sm text-slate-400 mb-6">
            Set a password to complete your account setup.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-widest">Password</label>
              <div className="relative">
                <input
                  type={visible ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 pr-10 focus:outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-widest">
                Confirm Password
              </label>
              <input
                type={visible ? 'text' : 'password'}
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand"
              />
              {confirm && password !== confirm && (
                <p className="text-xs text-red-500">Passwords don't match</p>
              )}
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={!valid || accept.isPending}
              className="w-full py-2.5 bg-brand text-white rounded-md text-sm font-semibold disabled:opacity-40 hover:bg-brand/90 transition-colors mt-2"
            >
              {accept.isPending ? 'Setting up…' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
