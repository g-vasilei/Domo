import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { api } from './lib/api';
import { useDeviceSocket } from './lib/useDeviceSocket';
import { useTimerRunner } from './lib/useTimerRunner';
import AcceptInvitePage from './pages/AcceptInvitePage';
import AlarmPage from './pages/AlarmPage';
import AutomationsPage from './pages/AutomationsPage';
import DashboardPage from './pages/DashboardPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import DevicesPage from './pages/DevicesPage';
import LoginPage from './pages/LoginPage';
import MembersPage from './pages/MembersPage';
import PanelPage from './pages/PanelPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';
import { useAuthStore } from './store/auth.store';

function useMe() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });
}

function AuthedLayout() {
  const token = useAuthStore((s) => s.accessToken);
  const { data: me, isLoading } = useMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useDeviceSocket();
  useTimerRunner();

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>
    );
  if (!me?.tuyaCredentials && me?.role !== 'MEMBER') return <Navigate to="/setup" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-[#111827]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PanelLayout() {
  const token = useAuthStore((s) => s.accessToken);
  const location = useLocation();
  useDeviceSocket();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function SetupGuard() {
  const token = useAuthStore((s) => s.accessToken);
  const { data: me, isLoading } = useMe();
  const location = useLocation();

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>
    );
  if (me?.tuyaCredentials || me?.role === 'MEMBER') return <Navigate to="/" replace />;
  return <Outlet />;
}

function AlarmGuard() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  const canAccess = me?.role === 'OWNER' || me?.permissions?.canArmAlarm;
  if (!canAccess) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />

      <Route element={<SetupGuard />}>
        <Route path="/setup" element={<SetupPage />} />
      </Route>

      <Route element={<AuthedLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/devices/:id" element={<DeviceDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/automations" element={<AutomationsPage />} />

        <Route element={<AlarmGuard />}>
          <Route path="/alarm" element={<AlarmPage />} />
        </Route>
      </Route>

      <Route element={<PanelLayout />}>
        <Route path="/panel" element={<PanelPage />} />
      </Route>
    </Routes>
  );
}
