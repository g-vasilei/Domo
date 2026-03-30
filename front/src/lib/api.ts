import axios from 'axios';

import { useAuthStore } from '../store/auth.store';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { refreshToken, setTokens, clear } = useAuthStore.getState();
      if (!refreshToken) {
        clear();
        return Promise.reject(error);
      }
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/auth/refresh', { refreshToken })
            .then(({ data }) => {
              setTokens(data.accessToken, data.refreshToken);
              return data.accessToken;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newAccessToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(original);
      } catch {
        clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
