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
    } catch (e) {
      console.error(e);
      alert('Failed to load email events: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) load(); }, [token, page, perPage]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); load(); };

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

      {loading ? <div>Loading...</div> : (
        <div style={{ border: '1px solid #eee', borderRadius: 6, overflow: 'hidden' }}>
          {events.length === 0 ? <div style={{ padding: 16 }}>No events</div> : events.map(ev => (
            <div key={ev.id} style={{ padding: 12, borderBottom: '1px solid #f1f1f1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div><strong>{ev.provider}</strong> — {ev.eventType || 'n/a'}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{new Date(ev.createdAt).toLocaleString()}</div>
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
