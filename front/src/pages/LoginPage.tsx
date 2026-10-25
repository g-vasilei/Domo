import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setTokens = useAuthStore((s) => s.setTokens);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setTokens(data.accessToken, data.refreshToken);
      navigate(from, { replace: true });
    } catch {
      setError('Μη έγκυρα στοιχεία σύνδεσης');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#111827] p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-[#1A222C] p-8 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm w-full max-w-sm space-y-4"
      >
        <h1 className="text-2xl font-bold">Σύνδεση</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          className="w-full h-12 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full h-12 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm"
          type="password"
          placeholder="Κωδικός πρόσβασης"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="w-full bg-brand text-white py-2 rounded-xl hover:bg-brand/90"
          type="submit"
        >
          Σύνδεση
        </button>
        <p className="text-sm text-center">
          Δεν έχετε λογαριασμό;{' '}
          <Link className="text-brand" to="/register">
            Εγγραφή
          </Link>
        </p>
      </form>
    </div>
  );
}
