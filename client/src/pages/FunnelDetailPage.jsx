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

// ── Add Domain form ───────────────────────────────────────────────────────────
function AddDomainForm({ funnelId, onSave, onCancel }) {
  const [form, setForm] = useState({
    domain: '', doc_root: '', role: 'backup', priority: 0, status: 'standby',
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
    setSaving(true); setError('');
    try {
      await api.post('/domains', { ...form, funnel_id: funnelId, priority: Number(form.priority) });
      onSave();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-indigo-200 rounded-lg p-4 bg-indigo-50 space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Domain *</label>
          <input value={form.domain} onChange={e => set('domain', e.target.value)} onBlur={handleDomainBlur}
            required placeholder="example.com"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
          <select value={form.role} onChange={e => set('role', e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="primary">Primary</option>
            <option value="backup">Backup</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">cPanel Doc Root *</label>
          <input value={form.doc_root} onChange={e => set('doc_root', e.target.value)} required
            placeholder="public_html/example.com"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="standby">Standby</option>
            <option value="active">Active</option>
          </select>
        </div>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-600 hover:bg-white rounded border border-gray-300 transition-colors">Cancel</button>
        <button type="submit" disabled={saving}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {saving ? 'Adding...' : 'Add Domain'}
        </button>
      </div>
    </form>
  );
}

// ── Add Lander to Domain form ─────────────────────────────────────────────────
function AddLanderForm({ domainId, localLanders, onSave, onCancel }) {
  const [form, setForm] = useState({ lander_id: '', subdirectory: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.lander_id) return setError('Select a lander.');
    setSaving(true); setError('');
    try {
      await api.post(`/domains/${domainId}/landers`, {
        lander_id: Number(form.lander_id),
        subdirectory: form.subdirectory.trim().replace(/^\//, ''),
      });
      onSave();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-1">Lander *</label>
        <select value={form.lander_id} onChange={e => setForm(f => ({ ...f, lander_id: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select lander...</option>
          {localLanders.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="w-32">
        <label className="block text-xs font-medium text-gray-600 mb-1">Path <span className="text-gray-400">(optional)</span></label>
        <input value={form.subdirectory} onChange={e => setForm(f => ({ ...f, subdirectory: e.target.value }))}
          placeholder="lp2"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      {error && <p className="text-red-600 text-xs self-center">{error}</p>}
      <button type="button" onClick={onCancel}
        className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded transition-colors">Cancel</button>
      <button type="submit" disabled={saving}
        className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {saving ? '...' : 'Add'}
      </button>
    </form>
  );
}

// ── Domain row with nested landers ────────────────────────────────────────────
function DomainRow({ domain, localLanders, onDelete, onRefresh }) {
  const [landers, setLanders]             = useState([]);
  const [showAddLander, setShowAddLander] = useState(false);
  const [actionState, setActionState]     = useState({});

  const loadLanders = useCallback(async () => {
    const rows = await api.get(`/domains/${domain.id}/landers`).catch(() => []);
    setLanders(rows);
  }, [domain.id]);

  useEffect(() => { loadLanders(); }, [loadLanders]);

  async function handleDeploy(dl) {
    setActionState(s => ({ ...s, [dl.id]: 'deploying' }));
    try {
      await api.post(`/domains/${domain.id}/landers/${dl.id}/deploy`);
      alert(`Deployed to ${domain.domain}${dl.subdirectory ? '/' + dl.subdirectory : ''}`);
    } catch (err) { alert(`Deploy failed: ${err.message}`); }
    finally { setActionState(s => ({ ...s, [dl.id]: null })); }
  }

  async function handlePublish(dl) {
    setActionState(s => ({ ...s, [dl.id]: 'publishing' }));
    try {
      const res = await api.post(`/domains/${domain.id}/landers/${dl.id}/publish`);
      alert(`Published to RedTrack!\nID: ${res.redtrack_lander.id}\nURL: ${res.redtrack_lander.url}`);
      loadLanders();
      onRefresh();
    } catch (err) { alert(`Publish failed: ${err.message}`); }
    finally { setActionState(s => ({ ...s, [dl.id]: null })); }
  }

  async function handleRemoveLander(dl) {
    if (!confirm(`Remove lander "${dl.lander_name}" from this domain?`)) return;
    await api.delete(`/domains/${domain.id}/landers/${dl.id}`);
    loadLanders();
  }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 bg-white">
        <span className="font-mono text-xs text-gray-800 flex-1 min-w-0 truncate">{domain.domain}</span>
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[domain.role]}`}>{domain.role}</span>
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[domain.status]}`}>{domain.status}</span>
        <button onClick={() => onDelete(domain.id, domain.domain)}
          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
          Remove
        </button>
      </div>

      <div className="bg-gray-50 border-t border-gray-100 px-3 py-2 space-y-1.5">
        {landers.map(dl => (
          <div key={dl.id} className="flex items-center gap-2 text-xs">
            <span className="flex-1 text-gray-700 truncate">
              <span className="font-medium">{dl.lander_name}</span>
              {dl.subdirectory
                ? <span className="text-gray-400 font-mono ml-1">/{dl.subdirectory}</span>
                : <span className="text-gray-400 font-mono ml-1">/</span>
              }
              {dl.redtrack_lander_id && <span className="ml-2 text-green-600 font-medium">✓ RT#{dl.redtrack_lander_id}</span>}
            </span>
            <button onClick={() => handleDeploy(dl)} disabled={!!actionState[dl.id]}
              className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors">
              {actionState[dl.id] === 'deploying' ? 'Deploying...' : 'Deploy'}
            </button>
            <button onClick={() => handlePublish(dl)} disabled={!!actionState[dl.id]}
              className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50 transition-colors">
              {actionState[dl.id] === 'publishing' ? 'Publishing...' : 'Publish to RT'}
            </button>
            <button onClick={() => handleRemoveLander(dl)}
              className="px-2 py-0.5 bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors">✕</button>
          </div>
        ))}

        {showAddLander ? (
          <AddLanderForm
            domainId={domain.id}
            localLanders={localLanders}
            onSave={() => { setShowAddLander(false); loadLanders(); }}
            onCancel={() => setShowAddLander(false)}
          />
        ) : (
          <button onClick={() => setShowAddLander(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
            + Add lander
          </button>
        )}
      </div>
    </div>
  );
}

// ── Landings card (mirrors RT's Landings section) ─────────────────────────────
function LandingsCard({ landings, domains, rotating, onRotate }) {
  // Map redtrack_lander_id → domain for quick lookup
  const rtToDomain = {};
  for (const d of domains) {
    if (d.redtrack_lander_id) rtToDomain[String(d.redtrack_lander_id)] = d;
  }

  if (landings.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Landings</h2>
        <p className="text-xs text-gray-400 italic">No landings in this funnel template yet.</p>
        <p className="text-xs text-gray-400 mt-1">Publish a domain lander to RedTrack to link it here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Landings</h2>
      <div className="space-y-2">
        {landings.map((l, i) => {
          const linked = rtToDomain[String(l.id)];
          const isActive = linked?.status === 'active';
          return (
            <div key={l.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${isActive ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
              <span className="text-xs font-bold text-gray-400 pt-0.5 w-4 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{l.name || `Landing ${l.id}`}</p>
                {linked ? (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[linked.status]}`}>
                      {linked.status}
                    </span>
                    <span className="text-xs font-mono text-gray-500">{linked.domain}</span>
                    {isActive && (
                      <button
                        onClick={() => onRotate(linked.domain)}
                        disabled={rotating}
                        className="text-xs px-2 py-0.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors font-medium"
                      >
                        {rotating ? 'Rotating...' : 'Rotate Now'}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1 italic">Not linked to a domain</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">weight</p>
                <p className="text-sm font-semibold text-gray-700">{l.weight ?? 100}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Offers card ───────────────────────────────────────────────────────────────
function OffersCard({ offers }) {
  if (offers.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Offers</h2>
        <p className="text-xs text-gray-400 italic">No offers in this funnel template.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Offers</h2>
      <div className="space-y-2">
        {offers.map((o, i) => (
          <div key={`${o.id}-${i}`} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
            <span className="text-xs font-bold text-gray-400 w-4 shrink-0">{i + 1}</span>
            <p className="text-sm font-medium text-gray-800 flex-1 truncate">{o.name || `Offer ${o.id}`}</p>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400">weight</p>
              <p className="text-sm font-semibold text-gray-700">{o.weight ?? 100}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FunnelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [funnel, setFunnel]             = useState(null);
  const [stream, setStream]             = useState(null);
  const [localLanders, setLocalLanders] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [rotating, setRotating]         = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, ll] = await Promise.all([
        api.get(`/funnels/${id}`),
        api.get('/landers').catch(() => []),
      ]);
      setFunnel(f);
      setLocalLanders(ll);
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

  async function handleRotateNow(domain) {
    if (!confirm(`Rotate away from "${domain}"?\n\nThis will ban the current domain and activate the next standby domain, updating the RedTrack funnel template.`)) return;
    setRotating(true);
    try {
      const res = await api.post('/rotate/trigger', { domain, reason: 'manual' });
      alert(`Rotated successfully!\n${res.fromDomain} → ${res.toDomain}`);
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

  const activeDomains  = funnel.domains.filter(d => d.status === 'active').length;
  const standbyDomains = funnel.domains.filter(d => d.status === 'standby').length;
  const bannedDomains  = funnel.domains.filter(d => d.status === 'banned').length;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/funnels')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{funnel.name}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            {funnel.redtrack_stream_id && (
              <span className="text-xs text-gray-400">RT stream: {funnel.redtrack_stream_id}</span>
            )}
            <div className="flex gap-3 text-xs">
              {activeDomains > 0  && <span className="text-green-600 font-medium">{activeDomains} active</span>}
              {standbyDomains > 0 && <span className="text-yellow-600 font-medium">{standbyDomains} standby</span>}
              {bannedDomains > 0  && <span className="text-red-500 font-medium">{bannedDomains} banned</span>}
            </div>
          </div>
        </div>
        {funnel.redtrack_stream_id && (
          <button onClick={load} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 transition-colors">
            Refresh from RT
          </button>
        )}
      </div>

      {/* Landings + Offers side by side (like RT screenshot) */}
      {funnel.redtrack_stream_id && (
        <div className="grid grid-cols-2 gap-4">
          <LandingsCard
            landings={streamLandings}
            domains={funnel.domains}
            rotating={rotating}
            onRotate={handleRotateNow}
          />
          <OffersCard offers={streamOffers} />
        </div>
      )}

      {/* No stream linked */}
      {!funnel.redtrack_stream_id && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          This funnel is not linked to a RedTrack funnel template. Manage it from the Funnels list page.
        </div>
      )}

      {/* Domains */}
      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Domains</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Publish a lander to RedTrack to link it to the funnel template above.
            </p>
          </div>
          {!showAddDomain && (
            <button onClick={() => setShowAddDomain(true)}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors">
              + Add Domain
            </button>
          )}
        </div>

        {funnel.domains.length === 0 && !showAddDomain ? (
          <p className="text-sm text-gray-400 text-center py-4">No domains yet. Add one to get started.</p>
        ) : (
          <div className="space-y-2">
            {funnel.domains.map(d => (
              <DomainRow
                key={d.id}
                domain={d}
                localLanders={localLanders}
                onDelete={deleteDomain}
                onRefresh={load}
              />
            ))}
          </div>
        )}

        {showAddDomain && (
          <AddDomainForm
            funnelId={Number(id)}
            onSave={() => { setShowAddDomain(false); load(); }}
            onCancel={() => setShowAddDomain(false)}
          />
        )}
      </section>
    </div>
  );
}
