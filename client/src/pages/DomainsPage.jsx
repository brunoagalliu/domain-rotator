import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const STATUS_COLORS = {
  active:  'bg-green-100 text-green-800',
  standby: 'bg-yellow-100 text-yellow-800',
  banned:  'bg-red-100 text-red-800',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DomainForm({ initial = {}, landers, onSave, onClose }) {
  const isEdit = !!initial.id;
  const [form, setForm] = useState({
    domain:    initial.domain    || '',
    doc_root:  initial.doc_root  || '',
    status:    initial.status    || 'standby',
    lander_id: initial.lander_id || '',
    priority:  initial.priority  ?? 0,
    notes:     initial.notes     || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleDomainBlur(e) {
    const d = e.target.value.toLowerCase().trim();
    set('domain', d);
    if (!isEdit && !form.doc_root && d) set('doc_root', `public_html/${d}`);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        lander_id: form.lander_id ? Number(form.lander_id) : null,
        priority:  Number(form.priority),
      };
      if (isEdit) {
        await api.patch(`/domains/${initial.id}`, body);
      } else {
        await api.post('/domains', body);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Domain *</label>
          <input
            value={form.domain}
            onChange={e => set('domain', e.target.value)}
            onBlur={handleDomainBlur}
            required
            placeholder="example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => set('status', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="standby">Standby</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
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
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-400 mt-1">Path relative to your cPanel home directory</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Lander</label>
          <select
            value={form.lander_id}
            onChange={e => set('lander_id', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {landers.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
          <input
            type="number"
            value={form.priority}
            onChange={e => set('priority', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">Higher = picked first</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
        <input
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Optional notes"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Domain'}
        </button>
      </div>
    </form>
  );
}

const TABS = ['all', 'active', 'standby', 'banned'];

export default function DomainsPage() {
  const [domains,  setDomains]  = useState([]);
  const [landers,  setLanders]  = useState([]);
  const [filter,   setFilter]   = useState('all');
  const [modal,    setModal]    = useState(null); // null | 'add' | domain-object
  const [loading,  setLoading]  = useState(true);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [doms, lands] = await Promise.all([api.get('/domains'), api.get('/landers')]);
      setDomains(doms);
      setLanders(lands);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts   = domains.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {});
  const filtered = filter === 'all' ? domains : domains.filter(d => d.status === filter);

  async function handleDelete(id, domain) {
    if (!confirm(`Remove "${domain}" from the pool?`)) return;
    await api.delete(`/domains/${id}`);
    load();
  }

  async function handleRestore(id) {
    await api.patch(`/domains/${id}`, { status: 'standby', banned_at: null });
    load();
  }

  async function handleRotateNow(domain) {
    if (!confirm(`Manually trigger rotation away from "${domain}"?`)) return;
    setRotating(true);
    try {
      const res = await api.post('/rotate/trigger', { domain, reason: 'manual' });
      alert(`Rotated successfully:\n${res.fromDomain} → ${res.toDomain}`);
      load();
    } catch (err) {
      alert(`Rotation failed: ${err.message}`);
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domain Pool</h1>
          <div className="flex gap-4 mt-1 text-sm">
            <span className="text-green-600 font-medium">{counts.active || 0} active</span>
            <span className="text-yellow-600 font-medium">{counts.standby || 0} standby</span>
            <span className="text-red-600 font-medium">{counts.banned || 0} banned</span>
          </div>
        </div>
        <button
          onClick={() => setModal('add')}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + Add Domain
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              filter === t ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t} ({t === 'all' ? domains.length : counts[t] || 0})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Domain</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Lander</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Added</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">No domains found</td></tr>
            ) : filtered.map(d => (
              <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-800">{d.domain}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[d.status]}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{d.lander_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{d.priority}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(d.added_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.status === 'active' && (
                      <button
                        onClick={() => handleRotateNow(d.domain)}
                        disabled={rotating}
                        className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:opacity-50 transition-colors"
                      >
                        Rotate Now
                      </button>
                    )}
                    {d.status === 'banned' && (
                      <button
                        onClick={() => handleRestore(d.id)}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      >
                        Restore
                      </button>
                    )}
                    <button
                      onClick={() => setModal(d)}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(d.id, d.domain)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Domain' : `Edit: ${modal.domain}`}
          onClose={() => setModal(null)}
        >
          <DomainForm
            initial={modal === 'add' ? {} : modal}
            landers={landers}
            onSave={() => { setModal(null); load(); }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
