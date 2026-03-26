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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/users/tuya-credentials', { accessId, accessSecret, region });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Connect Tuya</h1>
        <p className="text-sm text-gray-500">
          Enter your Tuya IoT Platform credentials to link your devices.{' '}
          <a href="https://iot.tuya.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Get credentials →
          </a>
        </p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input className="w-full border rounded px-3 py-2" placeholder="Access ID" value={accessId} onChange={(e) => setAccessId(e.target.value)} required />
        <input className="w-full border rounded px-3 py-2" placeholder="Access Secret" value={accessSecret} onChange={(e) => setAccessSecret(e.target.value)} required />
        <select className="w-full border rounded px-3 py-2" value={region} onChange={(e) => setRegion(e.target.value as any)}>
          <option value="eu">Europe</option>
          <option value="us">United States</option>
          <option value="cn">China</option>
        </select>
        <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50" type="submit" disabled={loading}>
          {loading ? 'Validating...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
