'use client';

import { useEffect, useState, useCallback } from 'react';

interface AffiliateLink {
  id: string;
  tool_name: string;
  affiliate_url: string;
  direct_url: string;
  commission: string;
  signup_url: string;
  active: boolean;
  notes: string;
  created_at: string;
}

const KNOWN_PROGRAMS = [
  { name: 'ElevenLabs', signup: 'https://elevenlabs.io/affiliates', commission: '22% recurring (12mo)' },
  { name: 'HeyGen', signup: 'https://www.heygen.com/affiliate-program', commission: '35% (3 months)' },
  { name: 'Jasper', signup: 'https://www.jasper.ai/partners', commission: '25-30% recurring' },
  { name: 'Copy.ai', signup: 'https://www.copy.ai/affiliate', commission: '45% recurring (12mo)' },
  { name: 'Writesonic', signup: 'https://writesonic.com/affiliate', commission: '30% lifetime' },
  { name: 'Murf AI', signup: 'https://murf.ai/resources/affiliate-program', commission: '20% recurring (24mo)' },
  { name: 'Synthesia', signup: 'https://www.synthesia.io/affiliates', commission: '20% recurring' },
  { name: 'Pictory', signup: 'https://pictory.ai/affiliates', commission: '20% recurring' },
  { name: 'Descript', signup: 'https://www.descript.com/affiliates', commission: '15% recurring' },
  { name: 'Runway', signup: 'https://runwayml.com/affiliate', commission: '20% recurring' },
  { name: 'TubeBuddy', signup: 'https://www.tubebuddy.com/affiliates', commission: 'Up to 50% recurring' },
  { name: 'AdCreative.ai', signup: 'https://www.adcreative.ai/affiliate', commission: '30% lifetime' },
];

const emptyForm = { tool_name: '', affiliate_url: '', direct_url: '', commission: '', signup_url: '', notes: '' };

export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchAffiliates = useCallback(async () => {
    try {
      const res = await fetch('/api/affiliates');
      const data = await res.json();
      setAffiliates(data.affiliates ?? []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load affiliates' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAffiliates(); }, [fetchAffiliates]);

  function clearMessage() { setTimeout(() => setMessage(null), 4000); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tool_name || !form.affiliate_url) {
      setMessage({ type: 'error', text: 'Tool name and Affiliate URL are required' });
      clearMessage();
      return;
    }

    setSaving(true);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const body = editingId ? { id: editingId, ...form } : form;
      const res = await fetch('/api/affiliates', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to save');

      setMessage({ type: 'success', text: editingId ? `✅ Updated ${form.tool_name}` : `✅ Added ${form.tool_name}` });
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await fetchAffiliates();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
      clearMessage();
    }
  }

  async function handleToggleActive(aff: AffiliateLink) {
    try {
      await fetch('/api/affiliates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aff.id, active: !aff.active }),
      });
      await fetchAffiliates();
    } catch {
      setMessage({ type: 'error', text: 'Failed to toggle status' });
      clearMessage();
    }
  }

  async function handleDelete(aff: AffiliateLink) {
    if (!confirm(`Delete affiliate link for "${aff.tool_name}"?`)) return;
    try {
      await fetch('/api/affiliates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aff.id }),
      });
      setMessage({ type: 'success', text: `Deleted ${aff.tool_name}` });
      await fetchAffiliates();
    } catch {
      setMessage({ type: 'error', text: 'Delete failed' });
    }
    clearMessage();
  }

  function startEdit(aff: AffiliateLink) {
    setForm({
      tool_name: aff.tool_name,
      affiliate_url: aff.affiliate_url,
      direct_url: aff.direct_url || '',
      commission: aff.commission || '',
      signup_url: aff.signup_url || '',
      notes: aff.notes || '',
    });
    setEditingId(aff.id);
    setShowForm(true);
  }

  function prefillFromKnown(prog: typeof KNOWN_PROGRAMS[0]) {
    setForm({
      ...emptyForm,
      tool_name: prog.name,
      commission: prog.commission,
      signup_url: prog.signup,
    });
    setEditingId(null);
    setShowForm(true);
  }

  const activeCount = affiliates.filter(a => a.active).length;

  return (
    <div>
      <div className="page-header">
        <h2>💰 Affiliate Links</h2>
        <p>Manage affiliate links for video descriptions. Pipeline auto-uses these links.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{activeCount}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Active Links</div>
        </div>
        <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{affiliates.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Registered</div>
        </div>
        <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--status-warning)' }}>{KNOWN_PROGRAMS.length - affiliates.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Available Programs</div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13,
          background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: message.type === 'success' ? 'var(--status-success)' : 'var(--status-error)',
        }}>
          {message.text}
        </div>
      )}

      {/* Add/Edit Form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showForm ? 16 : 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>
            {editingId ? `✏️ Edit: ${form.tool_name}` : '➕ Add Affiliate Link'}
          </h3>
          <button
            id="btn-toggle-form"
            onClick={() => { setShowForm(!showForm); if (showForm) { setForm(emptyForm); setEditingId(null); } }}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: showForm ? 'var(--bg-hover)' : 'var(--accent)',
              color: showForm ? 'var(--text-secondary)' : '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)', transition: 'all 0.15s',
            }}
          >
            {showForm ? 'Cancel' : '+ New Link'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Tool Name *</label>
                <input
                  id="input-tool-name"
                  style={inputStyle}
                  placeholder="e.g. ElevenLabs"
                  value={form.tool_name}
                  onChange={e => setForm({ ...form, tool_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Affiliate URL *</label>
                <input
                  id="input-affiliate-url"
                  style={inputStyle}
                  placeholder="https://try.elevenlabs.io/your-ref-id"
                  value={form.affiliate_url}
                  onChange={e => setForm({ ...form, affiliate_url: e.target.value })}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Direct URL</label>
                <input
                  id="input-direct-url"
                  style={inputStyle}
                  placeholder="https://elevenlabs.io"
                  value={form.direct_url}
                  onChange={e => setForm({ ...form, direct_url: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Commission</label>
                <input
                  id="input-commission"
                  style={inputStyle}
                  placeholder="e.g. 22% recurring (12mo)"
                  value={form.commission}
                  onChange={e => setForm({ ...form, commission: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Signup URL</label>
                <input
                  id="input-signup-url"
                  style={inputStyle}
                  placeholder="https://elevenlabs.io/affiliates"
                  value={form.signup_url}
                  onChange={e => setForm({ ...form, signup_url: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input
                  id="input-notes"
                  style={inputStyle}
                  placeholder="Optional notes"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <button
              id="btn-save-affiliate"
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600,
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Saving...' : editingId ? '💾 Update' : '💾 Save'}
            </button>
          </form>
        )}
      </div>

      {/* Active Affiliates Table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>🔗 Your Affiliate Links</h3>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</p>
        ) : affiliates.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No affiliate links yet. Add one above or pick from known programs below.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={thStyle}>Tool</th>
                  <th style={thStyle}>Affiliate URL</th>
                  <th style={thStyle}>Commission</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map(aff => (
                  <tr key={aff.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{aff.tool_name}</span>
                    </td>
                    <td style={tdStyle}>
                      <a
                        href={aff.affiliate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12, wordBreak: 'break-all' }}
                      >
                        {aff.affiliate_url.length > 45 ? aff.affiliate_url.slice(0, 45) + '...' : aff.affiliate_url}
                      </a>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{aff.commission || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleToggleActive(aff)}
                        style={{
                          padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: aff.active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          color: aff.active ? 'var(--status-success)' : 'var(--status-error)',
                        }}
                      >
                        {aff.active ? '✅ Active' : '⏸ Paused'}
                      </button>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => startEdit(aff)} style={actionBtnStyle} title="Edit">✏️</button>
                        <button onClick={() => handleDelete(aff)} style={{ ...actionBtnStyle, color: 'var(--status-error)' }} title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Known Programs (suggestions) */}
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📋 Known Affiliate Programs</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          AI tools with affiliate programs. Click &quot;Apply&quot; to visit signup, then add your link above.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {KNOWN_PROGRAMS.map(prog => {
            const isAdded = affiliates.some(a => a.tool_name.toLowerCase() === prog.name.toLowerCase());
            return (
              <div
                key={prog.name}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px',
                  background: isAdded ? 'rgba(34,197,94,0.05)' : 'var(--bg-hover)',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isAdded ? 'rgba(34,197,94,0.2)' : 'var(--border-subtle)'}`,
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{prog.name}</span>
                  <br />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{prog.commission}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isAdded ? (
                    <span style={{ fontSize: 11, color: 'var(--status-success)', fontWeight: 600 }}>✅ Added</span>
                  ) : (
                    <>
                      <a
                        href={prog.signup}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 600,
                          background: 'var(--accent)', color: '#fff',
                          borderRadius: 'var(--radius-sm)', textDecoration: 'none',
                          display: 'inline-block',
                        }}
                      >
                        Apply →
                      </a>
                      <button
                        onClick={() => prefillFromKnown(prog)}
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 600,
                          background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        + Add
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500,
  color: 'var(--text-secondary)', marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  background: 'var(--bg-base)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)', outline: 'none',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', verticalAlign: 'middle',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 8px', fontSize: 13, background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', transition: 'all 0.15s',
};
