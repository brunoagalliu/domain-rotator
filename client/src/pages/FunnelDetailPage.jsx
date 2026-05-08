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

// ── Add Domain inline form ────────────────────────────────────────────────────
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
              <option key={l.id} value={l.id}>{l.title}</option>
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

// ── Add Offer inline form ─────────────────────────────────────────────────────
function AddOfferForm({ funnelId, rtOffers, onSave, onCancel }) {
  const [form, setForm] = useState({ redtrack_offer_id: '', weight: 100 });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.redtrack_offer_id) return setError('Select an offer.');
    setSaving(true);
    setError('');
    try {
      const selected = rtOffers.find(o => o.id === form.redtrack_offer_id);
      await api.post(`/funnels/${funnelId}/offers`, {
        redtrack_offer_id: form.redtrack_offer_id,
        offer_title: selected.title,
        weight: Number(form.weight),
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
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">RedTrack Offer *</label>
          <select
            value={form.redtrack_offer_id}
            onChange={e => setForm(f => ({ ...f, redtrack_offer_id: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">Select offer...</option>
            {rtOffers.map(o => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Weight</label>
          <input
            type="number" min="1" max="100"
            value={form.weight}
            onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
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
          {saving ? 'Adding...' : 'Add Offer'}
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FunnelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [funnel, setFunnel]       = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [landings, setLandings]   = useState([]);
  const [rtOffers, setRtOffers]   = useState([]);
  const [loading, setLoading]     = useState(true);

  const [nameEdit, setNameEdit]         = useState('');
  const [campaignEdit, setCampaignEdit] = useState('');
  const [savingInfo, setSavingInfo]     = useState(false);
  const [infoError, setInfoError]       = useState('');

  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddOffer, setShowAddOffer]   = useState(false);
  const [rotating, setRotating]           = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, c, l, o] = await Promise.all([
        api.get(`/funnels/${id}`),
        api.get('/redtrack/campaigns').catch(() => []),
        api.get('/redtrack/landings').catch(() => []),
        api.get('/redtrack/offers').catch(() => []),
      ]);
      setFunnel(f);
      setNameEdit(f.name);
      setCampaignEdit(f.redtrack_campaign_id || '');
      setCampaigns(c);
      setLandings(l);
      setRtOffers(o);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    setInfoError('');
    try {
      await api.patch(`/funnels/${id}`, {
        name: nameEdit,
        redtrack_campaign_id: campaignEdit || null,
      });
      load();
    } catch (err) {
      setInfoError(err.message);
    } finally {
      setSavingInfo(false);
    }
  }

  async function deleteDomain(domainId, domain) {
    if (!confirm(`Remove "${domain}" from this funnel?`)) return;
    await api.delete(`/domains/${domainId}`);
    load();
  }

  async function deleteOffer(offerId) {
    if (!confirm('Remove this offer?')) return;
    await api.delete(`/funnels/${id}/offers/${offerId}`);
    load();
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

  async function updateOfferWeight(offerId, weight) {
    await api.patch(`/funnels/${id}/offers/${offerId}`, { weight: Number(weight) });
    load();
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!funnel)  return <div className="p-6 text-gray-400">Funnel not found.</div>;

  const totalWeight = funnel.offers.reduce((s, o) => s + o.weight, 0);

  return (
    <div className="p-6 max-w-4xl space-y-8">
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
        <h1 className="text-2xl font-bold text-gray-900">{funnel.name}</h1>
      </div>

      {/* Basic Info */}
      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Funnel Settings</h2>
        <form onSubmit={saveInfo} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input
                value={nameEdit}
                onChange={e => setNameEdit(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">RedTrack Campaign</label>
              <select
                value={campaignEdit}
                onChange={e => setCampaignEdit(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">None</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>
          {infoError && <p className="text-red-600 text-sm">{infoError}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={savingInfo}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {savingInfo ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </section>

      {/* Domains */}
      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Lander Domains</h2>
            <p className="text-xs text-gray-400 mt-0.5">1 primary + up to 4 backups. Backups rotate in when primary is flagged.</p>
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
          <p className="text-sm text-gray-400 text-center py-4">No domains yet. Add a primary lander to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Domain</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Role</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">RedTrack Lander</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {funnel.domains.map(d => {
                const landing = landings.find(l => l.id === d.redtrack_lander_id);
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
                      {landing ? landing.title : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2">
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
            landings={landings}
            onSave={() => { setShowAddDomain(false); load(); }}
            onCancel={() => setShowAddDomain(false)}
          />
        )}
      </section>

      {/* Offers */}
      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Offers (Split Test)</h2>
            <p className="text-xs text-gray-400 mt-0.5">Traffic is split between offers by weight.</p>
          </div>
          {!showAddOffer && (
            <button
              onClick={() => setShowAddOffer(true)}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              + Add Offer
            </button>
          )}
        </div>

        {funnel.offers.length === 0 && !showAddOffer ? (
          <p className="text-sm text-gray-400 text-center py-4">No offers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Offer</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">Weight</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-16">Split %</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {funnel.offers.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-800">{o.offer_title}</td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number" min="1" max="100"
                      defaultValue={o.weight}
                      onBlur={e => {
                        if (Number(e.target.value) !== o.weight) updateOfferWeight(o.id, e.target.value);
                      }}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">
                    {totalWeight > 0 ? Math.round((o.weight / totalWeight) * 100) : 0}%
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => deleteOffer(o.id)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showAddOffer && (
          <AddOfferForm
            funnelId={Number(id)}
            rtOffers={rtOffers}
            onSave={() => { setShowAddOffer(false); load(); }}
            onCancel={() => setShowAddOffer(false)}
          />
        )}
      </section>
    </div>
  );
}
