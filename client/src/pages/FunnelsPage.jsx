import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

function SearchSelect({ value, options, placeholder, onChange }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const ref                 = useRef(null);
  const inputRef            = useRef(null);

  const selected  = options.find(o => o.id === value);
  const filtered  = options.filter(o =>
    (o.title || '').toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(opt) {
    onChange(opt);
    setOpen(false);
    setQuery('');
  }

  function handleClear(e) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      {/* Trigger */}
      <div
        onClick={handleOpen}
        className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer bg-white transition-colors ${
          open ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <span className={`flex-1 truncate ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? selected.title : placeholder}
        </span>
        {selected && (
          <button onClick={handleClear} className="text-gray-300 hover:text-gray-500 shrink-0 leading-none">
            ×
          </button>
        )}
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <div
              onClick={() => handleSelect(null)}
              className="px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer"
            >
              None
            </div>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400 italic">No results</p>
            ) : filtered.map(opt => (
              <div
                key={opt.id}
                onClick={() => handleSelect(opt)}
                className={`px-3 py-2 text-sm cursor-pointer truncate transition-colors ${
                  opt.id === value
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const FUNNEL_TYPES = [
  { value: 'single_landing', label: 'Single landing' },
  { value: 'multi_landing',  label: 'Multi landing' },
];

function ItemRow({ index, item, rtOptions, onChange, onRemove }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-500 w-5 shrink-0">{index + 1}</span>
        <SearchSelect
          value={item.id}
          options={rtOptions}
          placeholder="Select..."
          onChange={opt => onChange({ ...item, id: opt?.id || '', name: opt?.title || '' })}
        />
        <div className="flex items-center gap-1 shrink-0">
          <label className="text-xs text-gray-400">Weight</label>
          <input
            type="number" min="1" value={item.weight}
            onChange={e => onChange({ ...item, weight: Number(e.target.value) })}
            className="w-16 border border-gray-300 rounded-md px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CreateFunnelModal({ onSave, onClose }) {
  const [title,      setTitle]      = useState('');
  const [type,       setType]       = useState('single_landing');
  const [landings,   setLandings]   = useState([{ id: '', name: '', weight: 100 }]);
  const [offers,     setOffers]     = useState([{ id: '', name: '', weight: 100 }]);
  const [rtLandings, setRtLandings] = useState([]);
  const [rtOffers,   setRtOffers]   = useState([]);
  const [loadingRt,  setLoadingRt]  = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/redtrack/landings').catch(() => []),
      api.get('/redtrack/offers').catch(() => []),
    ]).then(([l, o]) => { setRtLandings(Array.isArray(l) ? l : []); setRtOffers(Array.isArray(o) ? o : []); })
      .finally(() => setLoadingRt(false));
  }, []);

  function addRow(list, setList) {
    setList(prev => [...prev, { id: '', name: '', weight: 100 }]);
  }

  function updateRow(list, setList, idx, updated) {
    setList(prev => prev.map((item, i) => i === idx ? updated : item));
  }

  function removeRow(list, setList, idx) {
    setList(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!title.trim()) return setError('Title is required.');
    const validOffers = offers.filter(o => o.id);
    if (validOffers.length === 0) return setError('At least one offer is required.');
    setSaving(true);
    setError('');
    try {
      const stream = await api.post('/redtrack/streams', {
        title: title.trim(),
        type,
        landings: landings.filter(l => l.id).map(({ id, weight }) => ({ id, weight })),
        offers:   validOffers.map(({ id, weight }) => ({ id, weight })),
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Funnel</h2>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving || loadingRt}
              className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={onClose}
              className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Top section */}
          <div className="px-6 py-5 border-b border-gray-100 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">New Funnel</h3>

            <div>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title *"
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1">Type offer source name or use as placeholder for your custom offers</p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Funnel template type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {FUNNEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Landings + Offers columns */}
          {loadingRt ? (
            <div className="px-6 py-8 text-sm text-gray-400 text-center">Loading RedTrack data...</div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-gray-200">
              {/* Landings column */}
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-800">Landings</h3>
                  <button
                    onClick={() => addRow(landings, setLandings)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded hover:bg-green-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    ADD
                  </button>
                </div>
                <div className="space-y-2">
                  {landings.map((l, i) => (
                    <ItemRow
                      key={i}
                      index={i}
                      item={l}
                      rtOptions={rtLandings}
                      onChange={updated => updateRow(landings, setLandings, i, updated)}
                      onRemove={() => removeRow(landings, setLandings, i)}
                    />
                  ))}
                  {landings.length === 0 && (
                    <p className="text-xs text-gray-400 italic text-center py-4">No landings added yet</p>
                  )}
                </div>
              </div>

              {/* Offers column */}
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-800">Offers</h3>
                  <button
                    onClick={() => addRow(offers, setOffers)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded hover:bg-green-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    ADD
                  </button>
                </div>
                <div className="space-y-2">
                  {offers.map((o, i) => (
                    <ItemRow
                      key={i}
                      index={i}
                      item={o}
                      rtOptions={rtOffers}
                      onChange={updated => updateRow(offers, setOffers, i, updated)}
                      onRemove={() => removeRow(offers, setOffers, i)}
                    />
                  ))}
                  {offers.length === 0 && (
                    <p className="text-xs text-gray-400 italic text-center py-4">No offers added yet</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {!error && <span />}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving || loadingRt}
              className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={onClose}
              className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
              Close
            </button>
          </div>
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
