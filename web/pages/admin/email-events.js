import { useEffect, useState } from 'react';

function JSONViewer({ obj }) {
  return (
    <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#f7f7f7', padding: 8, borderRadius: 4 }}>{JSON.stringify(obj, null, 2)}</pre>
  );
}

export default function EmailEventsAdmin() {
  const [events, setEvents] = useState([]);
  const [provider, setProvider] = useState('');
  const [eventType, setEventType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({});
  const [selectAll, setSelectAll] = useState(false);
  const [exportJob, setExportJob] = useState(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const buildQuery = () => {
    const q = new URLSearchParams();
    if (provider) q.set('provider', provider);
    if (eventType) q.set('eventType', eventType);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    q.set('page', String(page));
    q.set('perPage', String(perPage));
    return q.toString();
  };

  const load = async () => {
    setLoading(true);
    try {
      const qs = buildQuery();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/email-events?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setEvents(json.events || []);
      setTotal(json.total || 0);
      // reset selection
      setSelected({});
      setSelectAll(false);
    } catch (e) {
      console.error(e);
      alert('Failed to load email events: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) load(); }, [token, page, perPage]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); load(); };

  const toggleSelect = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const toggleSelectAll = () => {
    if (!selectAll) {
      const newSel = {};
      events.forEach(ev => newSel[ev.id] = true);
      setSelected(newSel);
      setSelectAll(true);
    } else {
      setSelected({});
      setSelectAll(false);
    }
  };

  const exportSelected = async () => {
    const ids = Object.keys(selected).filter(k => selected[k]).map(k => Number(k));
    if (ids.length === 0) return alert('No events selected');
    const qs = new URLSearchParams();
    qs.set('ids', ids.join(','));
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/admin/email-events/export?${qs.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const json = await res.json();
      return alert('Export failed: ' + (json.error || res.statusText));
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `email-events-selected-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const exportAllFiltered = async () => {
    const qs = new URLSearchParams();
    if (provider) qs.set('provider', provider);
    if (eventType) qs.set('eventType', eventType);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    qs.set('all', 'true');
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/admin/email-events/export?${qs.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const json = await res.json();
      return alert('Export failed: ' + (json.error || res.statusText));
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `email-events-all-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  // New: trigger background S3 export (selected or all filtered)
  const triggerExportToS3 = async (useSelected = false) => {
    const body = {};
    if (useSelected) {
      const ids = Object.keys(selected).filter(k => selected[k]).map(k => Number(k));
      if (ids.length === 0) return alert('No events selected');
      body.ids = ids;
    } else {
      if (provider) body.provider = provider;
      if (eventType) body.eventType = eventType;
      if (from) body.from = from;
      if (to) body.to = to;
      body.all = true;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/email-events/export-job`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create export job');
      setExportJob({ id: json.jobId, status: 'pending' });
      // poll for status
      const poll = setInterval(async () => {
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/email-events/export-job/${json.jobId}`, { headers: { Authorization: `Bearer ${token}` } });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'Failed to get job');
          setExportJob({ id: json.jobId, ...j.job });
          if (j.job.status !== 'pending') clearInterval(poll);
        } catch (e) {
          console.error('poll error', e);
          clearInterval(poll);
        }
      }, 3000);
    } catch (e) {
      console.error(e);
      alert('Failed to start export job: ' + e.message);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin: Email Events</h1>
      <form onSubmit={onSearch} style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="provider (sendgrid|ses)" value={provider} onChange={e => setProvider(e.target.value)} />
        <input placeholder="eventType (delivered|bounce)" value={eventType} onChange={e => setEventType(e.target.value)} />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <button type="submit">Filter</button>
      </form>

      <div style={{ marginBottom: 12 }}>
        <strong>Total:</strong> {total} • <strong>Page:</strong> {page}
        <div style={{ marginTop: 8 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
          <button style={{ marginLeft: 8 }} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} /> Select all on page
        </label>
        <button onClick={exportSelected}>Export selected CSV</button>
        <button onClick={exportAllFiltered}>Export all filtered CSV (max 10k)</button>
        <button onClick={() => triggerExportToS3(true)}>Background Export selected to S3</button>
        <button onClick={() => triggerExportToS3(false)}>Background Export all filtered to S3</button>
      </div>

      {exportJob && (
        <div style={{ marginBottom: 12, padding: 12, border: '1px solid #eee' }}>
          <div><strong>Export Job #{exportJob.id}</strong> — Status: {exportJob.status}</div>
          {exportJob.status === 'done' && exportJob.s3Key && (
            <div style={{ marginTop: 8 }}>
              <a href={`/api/admin/email-events/export-job/${exportJob.id}?download=true`} target="_blank" rel="noreferrer">Download (signed URL)</a>
            </div>
          )}
          {exportJob.status === 'failed' && <div style={{ color: 'red' }}>Error: {exportJob.errorMessage}</div>}
        </div>
      )}

      {loading ? <div>Loading...</div> : (
        <div style={{ border: '1px solid #eee', borderRadius: 6, overflow: 'hidden' }}>
          {events.length === 0 ? <div style={{ padding: 16 }}>No events</div> : events.map(ev => (
            <div key={ev.id} style={{ padding: 12, borderBottom: '1px solid #f1f1f1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!selected[ev.id]} onChange={() => toggleSelect(ev.id)} />
                  <div>
                    <div><strong>{ev.provider}</strong> — {ev.eventType || 'n/a'}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{new Date(ev.createdAt).toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ minWidth: 160, textAlign: 'right' }}>
                  <div>ID: {ev.id}</div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}><JSONViewer obj={ev.payload} /></div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
