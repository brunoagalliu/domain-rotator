import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

function CreateFunnelModal({ onSave, onClose }) {
  const [title, setTitle]       = useState('');
  const [landings, setLandings] = useState([]);
  const [offers, setOffers]     = useState([]);
  const [rtLandings, setRtLandings] = useState([]);
  const [rtOffers, setRtOffers]     = useState([]);
  const [loadingRt, setLoadingRt]   = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/redtrack/landings').catch(() => []),
      api.get('/redtrack/offers').catch(() => []),
    ]).then(([l, o]) => { setRtLandings(l); setRtOffers(o); })
      .finally(() => setLoadingRt(false));
  }, []);

  function addLanding(id) {
    if (!id || landings.find(l => l.id === id)) return;
    const rt = rtLandings.find(l => l.id === id);
    setLandings(prev => [...prev, { id, name: rt?.title || id, weight: 100 }]);
  }

  function addOffer(id) {
    if (!id || offers.find(o => o.id === id)) return;
    const rt = rtOffers.find(o => o.id === id);
    setOffers(prev => [...prev, { id, name: rt?.title || id, weight: 100 }]);
  }

  function updateWeight(list, setList, id, w) {
    setList(prev => prev.map(i => i.id === id ? { ...i, weight: Number(w) } : i));
  }

  function remove(list, setList, id) {
    setList(prev => prev.filter(i => i.id !== id));
  }

  async function handleCreate() {
    if (!title.trim()) return setError('Title is required.');
    if (offers.length === 0) return setError('At least one offer is required.');
    setSaving(true);
    setError('');
    try {
      const stream = await api.post('/redtrack/streams', {
        title: title.trim(),
        landings: landings.map(({ id, weight }) => ({ id, weight })),
        offers:   offers.map(({ id, weight }) => ({ id, weight })),
      });
      const funnel = await api.post('/funnels/by-stream', {
        redtrack_stream_id: stream.id,
        title: stream.title,
      });
      onSave(funnel);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const availableLandings = rtLandings.filter(l => !landings.find(x => x.id === l.id));
  const availableOffers   = rtOffers.filter(o => !offers.find(x => x.id === o.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">New Funnel Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Antivirus SMS Funnel"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {loadingRt ? <p className="text-sm text-gray-400">Loading RedTrack data...</p> : (
            <>
              {/* Landers */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Landers <span className="text-gray-400 font-normal">(optional)</span></label>
                {landings.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {landings.map(l => (
                      <div key={l.id} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
                        <span className="flex-1 text-xs text-gray-700 truncate">{l.name}</span>
                        <input
                          type="number" min="1" value={l.weight}
                          onChange={e => updateWeight(landings, setLandings, l.id, e.target.value)}
                          className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button onClick={() => remove(landings, setLandings, l.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <select
                  onChange={e => { addLanding(e.target.value); e.target.value = ''; }}
                  defaultValue=""
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">+ Add lander...</option>
                  {availableLandings.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>

              {/* Offers */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Offers * <span className="text-gray-400 font-normal">(at least one)</span></label>
                {offers.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {offers.map(o => (
                      <div key={o.id} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
                        <span className="flex-1 text-xs text-gray-700 truncate">{o.name}</span>
                        <input
                          type="number" min="1" value={o.weight}
                          onChange={e => updateWeight(offers, setOffers, o.id, e.target.value)}
                          className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button onClick={() => remove(offers, setOffers, o.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <select
                  onChange={e => { addOffer(e.target.value); e.target.value = ''; }}
                  defaultValue=""
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">+ Add offer...</option>
                  {availableOffers.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
            </>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving || loadingRt}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating...' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FunnelsPage() {
  const navigate = useNavigate();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [managing, setManaging]   = useState(null);
  const [showCreate, setShowCreate] = useState(false);

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
        <div className="flex gap-2">
          <button onClick={load}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors">
            Refresh
          </button>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors">
            + New Template
          </button>
        </div>
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

      {showCreate && (
        <CreateFunnelModal
          onSave={funnel => { setShowCreate(false); navigate(`/funnels/${funnel.id}`); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
