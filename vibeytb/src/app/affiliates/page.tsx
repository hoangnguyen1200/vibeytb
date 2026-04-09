'use client';

import { useEffect, useState, useCallback } from 'react';

interface AffiliateLink {
  id: string;
  tool_name: string;
  affiliate_url: string;
  direct_url: string;
  commission: string;
  signup_url: string;
  dashboard_url: string;
  active: boolean;
  notes: string;
  monthly_clicks: number;
  monthly_signups: number;
  monthly_earnings: number;
  last_synced_at: string | null;
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

const emptyForm = { tool_name: '', affiliate_url: '', direct_url: '', commission: '', signup_url: '', dashboard_url: '', notes: '' };

const PAGE_SIZE = 5;

export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(0);
  const [showAllPrograms, setShowAllPrograms] = useState(false);
  const [editingPerf, setEditingPerf] = useState<AffiliateLink | null>(null);
  const [perfForm, setPerfForm] = useState({ monthly_clicks: 0, monthly_signups: 0, monthly_earnings: 0 });

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
      dashboard_url: aff.dashboard_url || '',
      notes: aff.notes || '',
    });
    setEditingId(aff.id);
    setShowForm(true);
  }

  function startPerfEdit(aff: AffiliateLink) {
    setPerfForm({
      monthly_clicks: aff.monthly_clicks || 0,
      monthly_signups: aff.monthly_signups || 0,
      monthly_earnings: aff.monthly_earnings || 0,
    });
    setEditingPerf(aff);
  }

  async function handlePerfSave() {
    if (!editingPerf) return;
    try {
      await fetch('/api/affiliates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPerf.id,
          ...perfForm,
          last_synced_at: new Date().toISOString(),
        }),
      });
      setMessage({ type: 'success', text: `✅ Updated performance for ${editingPerf.tool_name}` });
      setEditingPerf(null);
      await fetchAffiliates();
    } catch {
      setMessage({ type: 'error', text: 'Failed to update performance' });
    }
    clearMessage();
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
  const totalPages = Math.max(1, Math.ceil(affiliates.length / PAGE_SIZE));
  const pagedAffiliates = affiliates.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalEarnings = affiliates.reduce((sum, a) => sum + (Number(a.monthly_earnings) || 0), 0);
  const totalClicks = affiliates.reduce((sum, a) => sum + (a.monthly_clicks || 0), 0);

  const INITIAL_PROGRAMS_SHOWN = 4;
  const unadded = KNOWN_PROGRAMS.filter(p => !affiliates.some(a => a.tool_name.toLowerCase() === p.name.toLowerCase()));
  const added = KNOWN_PROGRAMS.filter(p => affiliates.some(a => a.tool_name.toLowerCase() === p.name.toLowerCase()));
  const sortedPrograms = [...added, ...unadded];
  const visiblePrograms = showAllPrograms ? sortedPrograms : sortedPrograms.slice(0, INITIAL_PROGRAMS_SHOWN);
  const hasMore = sortedPrograms.length > INITIAL_PROGRAMS_SHOWN;

  return (
    <div>
      <div className="page-header">
        <h2>💰 Affiliate Links</h2>
        <p>Manage affiliate links for video descriptions. Pipeline auto-uses these links.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{activeCount}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Active Links</div>
        </div>
        <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{totalClicks}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monthly Clicks</div>
        </div>
        <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--status-success)' }}>${totalEarnings.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monthly Earnings</div>
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
                <label style={labelStyle}>Dashboard URL</label>
                <input
                  id="input-dashboard-url"
                  style={inputStyle}
                  placeholder="https://elevenlabs.io/affiliate-dashboard"
                  value={form.dashboard_url}
                  onChange={e => setForm({ ...form, dashboard_url: e.target.value })}
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

      {/* Active Affiliates Table with Pagination */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>🔗 Your Affiliate Links</h3>
          {affiliates.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, affiliates.length)} of {affiliates.length}
            </span>
          )}
        </div>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</p>
        ) : affiliates.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No affiliate links yet. Add one above or pick from known programs below.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={thStyle}>Tool</th>
                    <th style={thStyle}>Clicks</th>
                    <th style={thStyle}>Signups</th>
                    <th style={thStyle}>Earnings</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAffiliates.map(aff => (
                    <tr key={aff.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={tdStyle}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{aff.tool_name}</span>
                          <br />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{aff.commission || '—'}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{aff.monthly_clicks || 0}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{aff.monthly_signups || 0}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--status-success)' }}>
                          ${Number(aff.monthly_earnings || 0).toFixed(2)}
                        </span>
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
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => startPerfEdit(aff)} style={actionBtnStyle} title="Update Performance">📊</button>
                          {aff.dashboard_url && (
                            <a href={aff.dashboard_url} target="_blank" rel="noopener noreferrer" style={{ ...actionBtnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }} title="Open Dashboard">🔗</a>
                          )}
                          <button onClick={() => startEdit(aff)} style={actionBtnStyle} title="Edit">✏️</button>
                          <button onClick={() => handleDelete(aff)} style={{ ...actionBtnStyle, color: 'var(--status-error)' }} title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  id="btn-page-prev"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ ...paginationBtnStyle, opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'default' : 'pointer' }}
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    style={{
                      ...paginationBtnStyle,
                      background: i === page ? 'var(--accent)' : 'var(--bg-hover)',
                      color: i === page ? '#fff' : 'var(--text-secondary)',
                      minWidth: 32,
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  id="btn-page-next"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  style={{ ...paginationBtnStyle, opacity: page === totalPages - 1 ? 0.4 : 1, cursor: page === totalPages - 1 ? 'default' : 'pointer' }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Known Programs (collapsible) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>📋 Known Affiliate Programs</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {added.length} added · {unadded.length} available
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          AI tools with affiliate programs. Click &quot;Apply&quot; to visit signup, then add your link above.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {visiblePrograms.map(prog => {
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
        {hasMore && (
          <button
            id="btn-toggle-programs"
            onClick={() => setShowAllPrograms(!showAllPrograms)}
            style={{
              display: 'block', width: '100%', marginTop: 12, padding: '8px 0',
              background: 'transparent', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {showAllPrograms ? '▲ Show Less' : `▼ Show All ${sortedPrograms.length} Programs`}
          </button>
        )}
      </div>

      {/* Performance Edit Modal */}
      {editingPerf && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="card" style={{ width: 420, maxWidth: '90vw', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              📊 Update Performance — {editingPerf.tool_name}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Enter data from the affiliate platform dashboard.
              {editingPerf.last_synced_at && (
                <> Last updated: {new Date(editingPerf.last_synced_at).toLocaleDateString()}</>
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Monthly Clicks</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  value={perfForm.monthly_clicks}
                  onChange={e => setPerfForm({ ...perfForm, monthly_clicks: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label style={labelStyle}>Monthly Signups</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  value={perfForm.monthly_signups}
                  onChange={e => setPerfForm({ ...perfForm, monthly_signups: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label style={labelStyle}>Monthly Earnings ($)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  step="0.01"
                  value={perfForm.monthly_earnings}
                  onChange={e => setPerfForm({ ...perfForm, monthly_earnings: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingPerf(null)}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePerfSave}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                💾 Save Performance
              </button>
            </div>
          </div>
        </div>
      )}
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

const paginationBtnStyle: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, fontWeight: 600,
  background: 'var(--bg-hover)', color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', transition: 'all 0.15s',
};
