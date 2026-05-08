import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

function ImportFunnelModal({ onSave, onClose }) {
  const [campaigns, setCampaigns] = useState([]);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    api.get('/redtrack/campaigns')
      .then(setCampaigns)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = campaigns.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  async function handleImport() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const funnel = await api.post('/funnels/import', { redtrack_campaign_id: selected.id });
      onSave(funnel);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Import from RedTrack</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            autoFocus
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="border border-gray-200 rounded-md overflow-hidden max-h-72 overflow-y-auto">
            {loading ? (
              <p className="text-center text-gray-400 text-sm py-8">Loading campaigns...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No campaigns found</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                  selected?.id === c.id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'hover:bg-gray-50 text-gray-800'
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
          {selected && (
            <p className="text-xs text-gray-500">
              Selected: <span className="font-medium text-gray-800">{selected.title}</span>
            </p>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!selected || saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Importing...' : 'Import Funnel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewFunnelModal({ campaigns, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', redtrack_campaign_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const funnel = await api.post('/funnels', {
        name: form.name,
        redtrack_campaign_id: form.redtrack_campaign_id || null,
      });
      onSave(funnel);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New Funnel</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Funnel Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              placeholder="e.g. Debt SMS Funnel"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">RedTrack Campaign</label>
            <select
              value={form.redtrack_campaign_id}
              onChange={e => setForm(f => ({ ...f, redtrack_campaign_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">None</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Funnel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FunnelsPage() {
  const navigate = useNavigate();
  const [funnels, setFunnels]     = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([
        api.get('/funnels'),
        api.get('/redtrack/campaigns').catch(() => []),
      ]);
      setFunnels(f);
      setCampaigns(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id, name) {
    if (!confirm(`Delete funnel "${name}"? All linked domains will be unlinked.`)) return;
    await api.delete(`/funnels/${id}`);
    load();
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Funnels</h1>
          <p className="text-sm text-gray-500 mt-1">{funnels.length} funnel{funnels.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Import from RedTrack
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Funnel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : funnels.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No funnels yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 text-indigo-600 text-sm hover:underline"
          >
            Create your first funnel
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {funnels.map(f => {
            const campaign = campaigns.find(c => c.id === f.redtrack_campaign_id);
            const isActive = parseInt(f.is_active) > 0;
            return (
              <div
                key={f.id}
                className="bg-white rounded-lg border border-gray-200 px-5 py-4 flex items-center gap-4 hover:border-indigo-300 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{f.name}</p>
                  {campaign && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">RedTrack: {campaign.title}</p>
                  )}
                </div>
                <div className="flex items-center gap-5 text-xs text-gray-500 shrink-0">
                  <span>
                    <span className="font-medium text-gray-700">{f.domain_count ?? 0}</span> domain{f.domain_count != 1 ? 's' : ''}
                  </span>
                  <span>
                    <span className="font-medium text-gray-700">{f.standby_count ?? 0}</span> backup{f.standby_count != 1 ? 's' : ''}
                  </span>
                  <span>
                    <span className="font-medium text-gray-700">{f.offer_count ?? 0}</span> offer{f.offer_count != 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/funnels/${f.id}`)}
                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition-colors font-medium"
                  >
                    Manage
                  </button>
                  <button
                    onClick={() => handleDelete(f.id, f.name)}
                    className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <NewFunnelModal
          campaigns={campaigns}
          onSave={funnel => { setShowModal(false); navigate(`/funnels/${funnel.id}`); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {showImport && (
        <ImportFunnelModal
          onSave={funnel => { setShowImport(false); navigate(`/funnels/${funnel.id}`); }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
