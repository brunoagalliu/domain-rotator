import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const STATUS_COLORS = {
  active:  'bg-green-100 text-green-800',
  standby: 'bg-yellow-100 text-yellow-800',
  banned:  'bg-red-100 text-red-800',
};

const ROLE_COLORS = {
  primary: 'bg-indigo-100 text-indigo-800',
  backup:  'bg-gray-100 text-gray-600',
};

function AddDomainForm({ funnelId, landings, onSave, onCancel }) {
  const [form, setForm] = useState({
    domain: '', doc_root: '', role: 'backup',
    redtrack_lander_id: '', priority: 0, status: 'standby',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function handleDomainBlur(e) {
    const d = e.target.value.toLowerCase().trim();
    set('domain', d);
    if (!form.doc_root && d) set('doc_root', `public_html/${d}`);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/domains', {
        ...form,
        funnel_id: funnelId,
        priority: Number(form.priority),
        redtrack_lander_id: form.redtrack_lander_id || null,
      });
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-indigo-200 rounded-lg p-4 bg-indigo-50 space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Domain *</label>
          <input
            value={form.domain}
            onChange={e => set('domain', e.target.value)}
            onBlur={handleDomainBlur}
            required
            placeholder="example.com"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
          <select
            value={form.role}
            onChange={e => set('role', e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="primary">Primary</option>
            <option value="backup">Backup</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">cPanel Doc Root *</label>
        <input
          value={form.doc_root}
          onChange={e => set('doc_root', e.target.value)}
          required
          placeholder="public_html/example.com"
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">RedTrack Lander</label>
          <select
            value={form.redtrack_lander_id}
            onChange={e => set('redtrack_lander_id', e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">None</option>
            {landings.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="standby">Standby</option>
            <option value="active">Active</option>
          </select>
        </div>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-600 hover:bg-white rounded border border-gray-300 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {saving ? 'Adding...' : 'Add Domain'}
        </button>
      </div>
    </form>
  );
}

export default function FunnelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [funnel, setFunnel]   = useState(null);
  const [stream, setStream]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [rotating, setRotating]           = useState(false);
  const [deploying, setDeploying]         = useState(null);

  const load = useCallback(async () => {
    try {
      const f = await api.get(`/funnels/${id}`);
      setFunnel(f);
      if (f.redtrack_stream_id) {
        const s = await api.get(`/redtrack/streams/${f.redtrack_stream_id}`).catch(() => null);
        setStream(s);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function deleteDomain(domainId, domain) {
    if (!confirm(`Remove "${domain}" from this funnel?`)) return;
    await api.delete(`/domains/${domainId}`);
    load();
  }

  async function handleDeploy(id, domain) {
    if (!confirm(`Deploy lander to "${domain}" via cPanel?`)) return;
    setDeploying(id);
    try {
      await api.post(`/domains/${id}/deploy`);
      alert(`Lander deployed to ${domain} successfully.`);
    } catch (err) {
      alert(`Deploy failed: ${err.message}`);
    } finally {
      setDeploying(null);
    }
  }

  async function handleRotateNow(domain) {
    if (!confirm(`Manually rotate away from "${domain}"?`)) return;
    setRotating(true);
    try {
      const res = await api.post('/rotate/trigger', { domain, reason: 'manual' });
      alert(`Rotated: ${res.fromDomain} → ${res.toDomain}`);
      load();
    } catch (err) {
      alert(`Rotation failed: ${err.message}`);
    } finally {
      setRotating(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!funnel)  return <div className="p-6 text-gray-400">Funnel not found.</div>;

  const streamLandings = stream?.landings || [];
  const streamOffers   = stream?.offers   || [];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/funnels')}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{funnel.name}</h1>
          {stream && <p className="text-xs text-gray-400 mt-0.5">RedTrack Funnel Template</p>}
        </div>
      </div>

      {/* RedTrack Landers (read-only) */}
      {streamLandings.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Landers in Template</h2>
          <div className="space-y-2">
            {streamLandings.map(l => (
              <div key={l.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
                <span className="text-sm text-gray-800">{l.name}</span>
                <span className="text-xs text-gray-400">weight {l.weight}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* RedTrack Offers (read-only) */}
      {streamOffers.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Offers in Template</h2>
          <div className="space-y-2">
            {streamOffers.map((o, i) => (
              <div key={`${o.id}-${i}`} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
                <span className="text-sm text-gray-800">{o.name}</span>
                <span className="text-xs text-gray-400">weight {o.weight}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Domains */}
      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Domains</h2>
            <p className="text-xs text-gray-400 mt-0.5">1 primary + backups. Backups rotate in when primary is flagged.</p>
          </div>
          {!showAddDomain && (
            <button
              onClick={() => setShowAddDomain(true)}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              + Add Domain
            </button>
          )}
        </div>

        {funnel.domains.length === 0 && !showAddDomain ? (
          <p className="text-sm text-gray-400 text-center py-4">No domains yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Domain</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Role</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Lander</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {funnel.domains.map(d => {
                const lander = streamLandings.find(l => l.id === d.redtrack_lander_id);
                return (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{d.domain}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[d.role]}`}>
                        {d.role}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[d.status]}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 max-w-xs truncate">
                      {lander ? lander.name : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeploy(d.id, d.domain)}
                          disabled={deploying === d.id}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
                        >
                          {deploying === d.id ? 'Deploying...' : 'Deploy'}
                        </button>
                        {d.status === 'active' && (
                          <button
                            onClick={() => handleRotateNow(d.domain)}
                            disabled={rotating}
                            className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:opacity-50 transition-colors"
                          >
                            Rotate Now
                          </button>
                        )}
                        <button
                          onClick={() => deleteDomain(d.id, d.domain)}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {showAddDomain && (
          <AddDomainForm
            funnelId={Number(id)}
            landings={streamLandings}
            onSave={() => { setShowAddDomain(false); load(); }}
            onCancel={() => setShowAddDomain(false)}
          />
        )}
      </section>
    </div>
  );
}
