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
      setError('Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-lg shadow w-full max-w-sm space-y-4"
      >
        <h1 className="text-2xl font-bold">Sign in</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          className="w-full border rounded px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          type="submit"
        >
          Login
        </button>
        <p className="text-sm text-center">
          No account?{' '}
          <Link className="text-blue-600" to="/register">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
