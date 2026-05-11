import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import FunnelsPage from './pages/FunnelsPage';
import FunnelDetailPage from './pages/FunnelDetailPage';
import DomainsPage from './pages/DomainsPage';
import LandersPage from './pages/LandersPage';
import HistoryPage from './pages/HistoryPage';
import { getToken, clearToken, api } from './lib/api';

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function MonitorBadge() {
  const [status, setStatus] = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const load = () => api.get('/monitor/status').then(setStatus).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  const active = status.running && status.configured && !status.paused;
  const dotColor = active ? 'bg-green-400' : status.configured ? 'bg-yellow-400' : 'bg-gray-300';
  const label = active ? 'Monitor live' : status.paused ? 'Monitor paused' : status.configured ? 'Monitor starting' : 'Monitor off';
  const lastPoll = status.lastPoll ? new Date(status.lastPoll).toLocaleTimeString() : null;

  const handleToggle = async () => {
    if (!status.configured || toggling) return;
    setToggling(true);
    try {
      const next = await api.post('/monitor/toggle');
      setStatus(next);
    } catch (e) {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="mt-4 px-3 py-2 rounded-md bg-gray-50 border border-gray-100">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
          <span className="text-xs text-gray-600 font-medium truncate">{label}</span>
        </div>
        {status.configured && (
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={status.paused ? 'Resume auto-rotation' : 'Pause auto-rotation'}
            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              !status.paused ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform duration-200 ${
                !status.paused ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </button>
        )}
      </div>
      {lastPoll && (
        <p className="text-xs text-gray-400 mt-0.5 pl-4">Last poll {lastPoll}</p>
      )}
      {status.lastDetection && (
        <p className="text-xs text-orange-500 mt-0.5 pl-4 truncate" title={status.lastDetection.domain}>
          Flagged: {status.lastDetection.domain}
        </p>
      )}
      {status.lastError && (
        <p className="text-xs text-red-500 mt-0.5 pl-4 truncate" title={status.lastError}>
          Error: {status.lastError}
        </p>
      )}
    </div>
  );
}

function Sidebar() {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-200 min-h-screen px-4 py-6 flex flex-col">
      <div className="mb-8">
        <span className="text-lg font-bold text-indigo-600">Domain</span>
        <span className="text-lg font-light text-gray-500"> Rotator</span>
      </div>
      <nav className="space-y-1 flex-1">
        <NavLink to="/funnels" className={linkClass}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Funnels
        </NavLink>
        <NavLink to="/domains" className={linkClass}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
          </svg>
          Domains
        </NavLink>
        <NavLink to="/landers" className={linkClass}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Landers
        </NavLink>
        <NavLink to="/history" className={linkClass}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          History
        </NavLink>
      </nav>
      <MonitorBadge />
      <button
        onClick={() => { clearToken(); window.location.href = '/login'; }}
        className="flex items-center gap-2 px-3 py-2 mt-3 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign out
      </button>
    </aside>
  );
}

function AppLayout() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to="/funnels" replace />} />
          <Route path="/funnels" element={<FunnelsPage />} />
          <Route path="/funnels/:id" element={<FunnelDetailPage />} />
          <Route path="/domains" element={<DomainsPage />} />
          <Route path="/landers" element={<LandersPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<RequireAuth><AppLayout /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  );
}
