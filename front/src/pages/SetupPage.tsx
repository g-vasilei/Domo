import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api';

export default function SetupPage() {
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState<'eu' | 'us' | 'cn'>('eu');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/users/tuya-credentials', { accessId, accessSecret, region });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Μη έγκυρα στοιχεία σύνδεσης');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#111827] p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-[#1A222C] p-8 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm w-full max-w-sm space-y-4"
      >
        <h1 className="text-2xl font-bold">Σύνδεση Tuya</h1>
        <p className="text-sm text-slate-500">
          Εισαγάγετε τα στοιχεία της πλατφόρμας Tuya IoT για να συνδέσετε τις συσκευές σας.{' '}
          <a
            href="https://iot.tuya.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline"
          >
            Απόκτηση στοιχείων →
          </a>
        </p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          className="w-full h-12 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm"
          placeholder="Αναγνωριστικό πρόσβασης"
          value={accessId}
          onChange={(e) => setAccessId(e.target.value)}
          required
        />
        <input
          className="w-full h-12 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm"
          placeholder="Μυστικό πρόσβασης"
          value={accessSecret}
          onChange={(e) => setAccessSecret(e.target.value)}
          required
        />
        <select
          className="w-full h-12 border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm"
          value={region}
          onChange={(e) => setRegion(e.target.value as any)}
        >
          <option value="eu">Ευρώπη</option>
          <option value="us">Ηνωμένες Πολιτείες</option>
          <option value="cn">Κίνα</option>
        </select>
        <button
          className="w-full bg-brand text-white py-2 rounded-xl hover:bg-brand/90 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Έλεγχος…' : 'Σύνδεση'}
        </button>
      </form>
    </div>
  );
}
