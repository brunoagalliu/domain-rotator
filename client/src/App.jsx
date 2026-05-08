import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DomainsPage from './pages/DomainsPage';
import LandersPage from './pages/LandersPage';
import HistoryPage from './pages/HistoryPage';
import { getToken, clearToken, api } from './lib/api';

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function MonitorBadge() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const load = () => api.get('/monitor/status').then(setStatus).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  const isLive = status.running && status.configured;
  const dotColor = isLive ? 'bg-green-400' : status.configured ? 'bg-yellow-400' : 'bg-gray-300';
  const label    = isLive ? 'Monitor live' : status.configured ? 'Monitor starting' : 'Monitor off';
  const lastPoll = status.lastPoll
    ? new Date(status.lastPoll).toLocaleTimeString()
    : null;

  return (
    <div className="mt-4 px-3 py-2 rounded-md bg-gray-50 border border-gray-100">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
        <span className="text-xs text-gray-600 font-medium">{label}</span>
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
          <Route path="/" element={<Navigate to="/domains" replace />} />
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
