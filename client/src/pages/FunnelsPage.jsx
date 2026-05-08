import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function FunnelsPage() {
  const navigate = useNavigate();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [managing, setManaging] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/redtrack/streams');
      setStreams(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleManage(stream) {
    setManaging(stream.id);
    try {
      const funnel = await api.post('/funnels/by-stream', { redtrack_stream_id: stream.id, title: stream.title });
      navigate(`/funnels/${funnel.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setManaging(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Funnel Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Your RedTrack funnel templates</p>
        </div>
        <button
          onClick={load}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading funnel templates...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : streams.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No funnel templates found in RedTrack.</div>
      ) : (
        <div className="grid gap-3">
          {streams.map(s => (
            <div
              key={s.id}
              className="bg-white rounded-lg border border-gray-200 px-5 py-4 flex items-center gap-4 hover:border-indigo-200 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{s.title}</p>
              </div>
              <div className="flex items-center gap-5 text-xs text-gray-500 shrink-0">
                <span>
                  <span className="font-medium text-gray-700">{s.landings?.length ?? 0}</span> lander{s.landings?.length !== 1 ? 's' : ''}
                </span>
                <span>
                  <span className="font-medium text-gray-700">{s.offers?.length ?? 0}</span> offer{s.offers?.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => handleManage(s)}
                disabled={managing === s.id}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium shrink-0"
              >
                {managing === s.id ? 'Opening...' : 'Manage'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
